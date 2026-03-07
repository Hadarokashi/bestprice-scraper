import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { searchWithZap } from '@/lib/price-sources/zap-scraper';
import type { PriceComparison, ScanPhase, WebsiteScanStatus } from '@/lib/types';
import {
  buildComparisonFromJob,
  computeFlaggedProviders,
  createJobMetaEntry,
  dedupeProviders,
  extractJobMeta,
  filterScrapersByPreset,
  filterVisibleSiteScans,
  getSitesToExclude,
  normalizeScanMetadata,
  replaceJobMeta,
  toScraperConfig,
} from '@/lib/scan-utils';
import { getWorkerJobStatus, startWorkerJob } from '@/lib/scraper-worker';
import { upsertPriceComparison } from '@/lib/price-cache';

const ZAP_SITE_NAME = 'Zap.co.il';

interface JobRow {
  id: string;
  product_id: string;
  product_name: string;
  barcode: string;
  recommended_price?: string | number | null;
  status: string;
  total_scrapers: number;
  completed_scrapers: number;
  results: PriceComparison['providers'];
  website_scans?: WebsiteScanStatus[];
  created_at: string;
  updated_at: string;
  error?: string | null;
}

interface SettingsRow {
  threshold?: number;
}

function buildResponse(job: JobRow, comparison: PriceComparison) {
  const progress = job.total_scrapers > 0
    ? Math.round((job.completed_scrapers / job.total_scrapers) * 100)
    : 0;

  return {
    success: true,
    data: {
      jobId: job.id,
      status: job.status,
      progress,
      productId: job.product_id,
      productName: job.product_name,
      barcode: job.barcode,
      providers: comparison.providers,
      results: comparison.providers,
      phase: comparison.phase,
      scanMetadata: comparison.scanMetadata,
      comparison,
      completedScrapers: job.completed_scrapers,
      totalScrapers: job.total_scrapers,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    },
  };
}

function getThreshold(settingsRow: SettingsRow | null): number {
  return Number(settingsRow?.threshold ?? 10);
}

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json();

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'Missing jobId' },
        { status: 400 }
      );
    }

    const [{ data: job, error: jobError }, { data: settingsData }] = await Promise.all([
      supabase.from('scraping_jobs').select('*').eq('id', jobId).single(),
      supabase.from('settings').select('*').single(),
    ]);

    if (jobError || !job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    const typedJob = job as JobRow;
    const threshold = getThreshold((settingsData || null) as SettingsRow | null);
    const recommendedPrice = typedJob.recommended_price ? parseFloat(String(typedJob.recommended_price)) : 0;
    const existingProviders = dedupeProviders(typedJob.results || []);
    const existingWebsiteScans = typedJob.website_scans || [];
    const jobMeta = extractJobMeta(existingWebsiteScans) || createJobMetaEntry({});
    const visibleScans = filterVisibleSiteScans(existingWebsiteScans);
    const scanMode = jobMeta.mode || 'zap_then_remaining';
    const includedSites = jobMeta.includedSites || [];

    if (typedJob.status === 'completed' || typedJob.status === 'failed' || typedJob.status === 'partial') {
      const finalComparison = buildComparisonFromJob({
        productId: typedJob.product_id,
        barcode: typedJob.barcode,
        recommendedPrice,
        threshold,
        providers: existingProviders,
        flaggedProviders: computeFlaggedProviders(existingProviders, recommendedPrice, threshold),
        lastSearched: new Date(typedJob.updated_at || Date.now()).toISOString(),
        scanMetadata: normalizeScanMetadata({
          totalWebsites: typedJob.total_scrapers,
          scannedWebsites: typedJob.completed_scrapers,
          websites: existingWebsiteScans,
          phase: jobMeta.phase,
          message: jobMeta.message,
          currentSite: jobMeta.currentSite,
          mode: scanMode,
          providerCount: existingProviders.length,
          startedAt: typedJob.created_at,
          completedAt: typedJob.updated_at,
        }),
        jobId: typedJob.id,
        phase: jobMeta.phase || (typedJob.status === 'partial' ? 'partial' : typedJob.status === 'failed' ? 'failed' : 'completed'),
        error: typedJob.error || undefined,
      });

      return NextResponse.json(buildResponse(typedJob, finalComparison));
    }

    let updatedProviders = existingProviders;
    let updatedScans = [...visibleScans];
    let updatedStatus = 'processing';
    let updatedCompletedScrapers = typedJob.completed_scrapers || 0;
    let updatedPhase: ScanPhase = jobMeta.phase || 'queued';
    let updatedMessage = jobMeta.message || 'ממתין להתחלת הסריקה';
    let currentSite = jobMeta.currentSite;
    let newMeta = jobMeta;

    // Phase 1: Zap pass
    if (updatedPhase === 'queued' || updatedPhase === 'checking_zap') {
      if (scanMode !== 'playwright_only') {
        updatedPhase = 'checking_zap';
        updatedMessage = 'בודק קודם בזאפ';

        try {
          const zapResult = await searchWithZap({
            productName: typedJob.product_name,
            barcode: typedJob.barcode,
            recommendedPrice,
          });

          updatedScans = updatedScans.filter((site) => site.name !== ZAP_SITE_NAME);
          updatedScans.unshift({
            name: ZAP_SITE_NAME,
            status: zapResult.providers.length > 0 ? 'found' : 'not_found',
            resultsCount: zapResult.providers.length,
            category: 'general',
          });
          updatedProviders = dedupeProviders([...updatedProviders, ...zapResult.providers]);
        } catch (error) {
          updatedScans = updatedScans.filter((site) => site.name !== ZAP_SITE_NAME);
          updatedScans.unshift({
            name: ZAP_SITE_NAME,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown Zap error',
            category: 'general',
          });
        }

        updatedCompletedScrapers = Math.min(1, typedJob.total_scrapers || 1);
      }

      const { data: scrapers, error: scrapersError } = await supabase
        .from('scrapers')
        .select('*')
        .eq('enabled', true)
        .order('priority', { ascending: false });

      if (scrapersError) {
        throw scrapersError;
      }

      const filteredScrapers = filterScrapersByPreset(
        (scrapers || []).map((scraper) => toScraperConfig(scraper)),
        includedSites.length > 0 ? 'selected' : 'enabled',
        includedSites
      ).filter((scraper) => scraper.name !== ZAP_SITE_NAME);

      const excludeSites = scanMode === 'selected_sites'
        ? [ZAP_SITE_NAME]
        : [ZAP_SITE_NAME, ...getSitesToExclude(updatedProviders)];
      const fallbackSites = filteredScrapers.filter((scraper) => !excludeSites.includes(scraper.name));

      const shouldStopAfterZap =
        scanMode === 'zap_only' ||
        (!fallbackSites.length && scanMode !== 'playwright_only');

      newMeta = createJobMetaEntry({
        ...jobMeta,
        status: 'pending',
        phase: shouldStopAfterZap ? 'completed' : (updatedProviders.length > 0 ? 'zap_complete' : 'scanning_sites'),
        mode: scanMode,
        includedSites: filteredScrapers.map((scraper) => scraper.name),
        excludedSites: excludeSites,
        message: shouldStopAfterZap
          ? 'הסריקה הסתיימה אחרי זאפ'
          : updatedProviders.length > 0
          ? `נמצאו ${updatedProviders.length} ספקים בזאפ, ממשיך לאתרים`
          : `זאפ הסתיים, ממשיך ל-${fallbackSites.length} אתרים`,
        currentSite: fallbackSites[0]?.name,
      });

      if (shouldStopAfterZap || scanMode === 'playwright_only' && filteredScrapers.length === 0) {
        updatedStatus = 'completed';
        updatedPhase = 'completed';
        updatedMessage = newMeta.message || 'הסריקה הושלמה';
        currentSite = undefined;
        updatedCompletedScrapers = typedJob.total_scrapers || updatedCompletedScrapers;
      } else if (!newMeta.externalJobId) {
        const { workerUrl, externalJobId } = await startWorkerJob({
          productName: typedJob.product_name,
          barcode: typedJob.barcode,
          recommendedPrice,
          excludeSites,
          includeSites: fallbackSites.map((scraper) => scraper.name),
        });

        newMeta = createJobMetaEntry({
          ...newMeta,
          phase: 'scanning_sites',
          externalJobId,
          workerUrl,
          message: `סורק ${fallbackSites.length} אתרים עם Playwright`,
          currentSite: fallbackSites[0]?.name,
          progress: 0,
          error: undefined,
          providerCount: updatedProviders.length,
        });
        updatedPhase = 'scanning_sites';
        updatedMessage = newMeta.message || 'סורק אתרים';
        currentSite = newMeta.currentSite;
      }
    } else if (updatedPhase === 'scanning_sites' && jobMeta.externalJobId) {
      const workerUrl = jobMeta.workerUrl;
      if (!workerUrl) {
        throw new Error('Missing worker URL for running job');
      }

      const workerStatus = await getWorkerJobStatus({
        workerUrl,
        externalJobId: jobMeta.externalJobId,
      });

      updatedProviders = dedupeProviders([...updatedProviders, ...workerStatus.providers]);
      const externalSites = filterVisibleSiteScans(workerStatus.scanMetadata?.websites || []);
      const zapSite = updatedScans.find((site) => site.name === ZAP_SITE_NAME);
      updatedScans = [
        ...(zapSite ? [zapSite] : []),
        ...externalSites.filter((site) => site.name !== ZAP_SITE_NAME),
      ];

      const baseCompleted = scanMode === 'playwright_only' ? 0 : 1;
      updatedCompletedScrapers = Math.min(
        typedJob.total_scrapers || 0,
        baseCompleted + (workerStatus.scanMetadata?.scannedWebsites || 0)
      );

      if (workerStatus.status === 'completed') {
        updatedStatus = 'completed';
        updatedPhase = 'completed';
        updatedMessage = `הסריקה הושלמה עם ${updatedProviders.length} ספקים`;
        currentSite = undefined;
      } else if (workerStatus.status === 'failed') {
        updatedStatus = updatedProviders.length > 0 ? 'partial' : 'failed';
        updatedPhase = updatedProviders.length > 0 ? 'partial' : 'failed';
        updatedMessage = updatedProviders.length > 0
          ? 'הסריקה הושלמה חלקית'
          : 'סריקת האתרים נכשלה';
        currentSite = undefined;
      } else {
        updatedStatus = 'processing';
        updatedPhase = 'scanning_sites';
        updatedMessage = workerStatus.scanMetadata?.message || `סורק אתרים (${workerStatus.progress}%)`;
        currentSite = workerStatus.scanMetadata?.currentSite;
      }

      newMeta = createJobMetaEntry({
        ...jobMeta,
        phase: updatedPhase,
        status: workerStatus.status === 'failed' ? 'error' : 'pending',
        message: updatedMessage,
        currentSite,
        progress: workerStatus.progress,
        mode: scanMode,
      });
    }

    const nextWebsiteScans = replaceJobMeta(updatedScans, newMeta);
    const comparison = buildComparisonFromJob({
      productId: typedJob.product_id,
      barcode: typedJob.barcode,
      recommendedPrice,
      threshold,
      providers: updatedProviders,
      flaggedProviders: computeFlaggedProviders(updatedProviders, recommendedPrice, threshold),
      lastSearched: new Date().toISOString(),
      scanMetadata: normalizeScanMetadata({
        totalWebsites: typedJob.total_scrapers,
        scannedWebsites: updatedCompletedScrapers,
        websites: nextWebsiteScans,
        phase: updatedPhase,
        message: updatedMessage,
        currentSite,
        mode: scanMode,
        providerCount: updatedProviders.length,
        startedAt: typedJob.created_at,
        completedAt: ['completed', 'partial', 'failed'].includes(updatedPhase) ? new Date().toISOString() : undefined,
      }),
      jobId: typedJob.id,
      phase: updatedPhase,
      error: updatedStatus === 'failed' ? updatedMessage : undefined,
    });

    const { data: updatedJob, error: updateError } = await supabase
      .from('scraping_jobs')
      .update({
        status: updatedStatus,
        completed_scrapers: updatedCompletedScrapers,
        results: comparison.providers,
        website_scans: nextWebsiteScans,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .select('*')
      .single();

    if (updateError || !updatedJob) {
      throw updateError || new Error('Failed to update job');
    }

    await upsertPriceComparison(comparison);

    return NextResponse.json(buildResponse(updatedJob as JobRow, comparison));
  } catch (error) {
    console.error('Error in process-batch:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
