import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ScrapingJob, WebsiteScanStatus } from '@/lib/types';
import { extractJobMeta, filterVisibleSiteScans, normalizeScanMetadata } from '@/lib/scan-utils';

interface JobRow {
  id: string;
  product_id: string;
  product_name: string;
  barcode: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  total_scrapers: number;
  completed_scrapers: number;
  results: unknown[];
  website_scans?: WebsiteScanStatus[];
  created_at: string;
  updated_at: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    
    // Get job status
    const { data: job, error } = await supabase
      .from('scraping_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (error || !job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }
    
    const typedJob = job as JobRow;
    const progress = typedJob.total_scrapers > 0
      ? Math.round((typedJob.completed_scrapers / typedJob.total_scrapers) * 100)
      : 0;
    const websites = typedJob.website_scans || [];
    const meta = extractJobMeta(websites);
    const scanMetadata = normalizeScanMetadata({
      totalWebsites: typedJob.total_scrapers,
      scannedWebsites: typedJob.completed_scrapers,
      websites,
      phase: meta?.phase,
      message: meta?.message,
      currentSite: meta?.currentSite,
      mode: meta?.mode,
      providerCount: (typedJob.results || []).length,
      startedAt: typedJob.created_at,
      completedAt: typedJob.updated_at,
    });
    
    return NextResponse.json({
      success: true,
      data: {
        id: typedJob.id,
        productId: typedJob.product_id,
        productName: typedJob.product_name,
        barcode: typedJob.barcode,
        status: typedJob.status,
        totalScrapers: typedJob.total_scrapers,
        completedScrapers: typedJob.completed_scrapers,
        progress,
        results: typedJob.results || [],
        providers: typedJob.results || [],
        phase: meta?.phase || (typedJob.status === 'completed' ? 'completed' : 'queued'),
        scanMetadata,
        website_scans: filterVisibleSiteScans(websites),
        createdAt: typedJob.created_at,
        updatedAt: typedJob.updated_at,
      } as ScrapingJob & { progress: number; website_scans: WebsiteScanStatus[] },
    });
  } catch (error) {
    console.error('Error in status:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
