import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { scrapeGeneric } from '@/lib/price-sources/generic-scraper';
import { searchWithZap } from '@/lib/price-sources/zap-scraper';
import type { ScraperConfig, ProviderPrice, WebsiteScanStatus } from '@/lib/types';

const BATCH_SIZE = 5; // Process 5 scrapers at a time

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json();
    
    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'Missing jobId' },
        { status: 400 }
      );
    }
    
    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('scraping_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (jobError || !job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }
    
    // Check if job is already completed
    if (job.status === 'completed') {
      return NextResponse.json({
        success: true,
        data: {
          jobId,
          status: 'completed',
          progress: 100,
          completedScrapers: job.completed_scrapers,
          totalScrapers: job.total_scrapers,
          results: job.results,
        },
      });
    }
    
    // Update job status to processing
    if (job.status === 'pending') {
      await supabase
        .from('scraping_jobs')
        .update({ status: 'processing' })
        .eq('id', jobId);
    }
    
    const allResults: ProviderPrice[] = job.results || [];
    let completedCount = job.completed_scrapers || 0;
    
    // Initialize or retrieve website scan tracking
    const websiteScans: WebsiteScanStatus[] = (job as any).website_scans || [];
    
    // First, check Zap if we haven't yet
    if (completedCount === 0) {
      console.log(`[Batch Processor] Checking Zap for: ${job.product_name}`);
      try {
        const zapResult = await searchWithZap({
          productName: job.product_name,
          barcode: job.barcode,
        });
        
        if (zapResult.success && zapResult.providers.length > 0) {
          allResults.push(...zapResult.providers);
          console.log(`[Batch Processor] Zap found ${zapResult.providers.length} providers`);
          
          // Track Zap scan
          websiteScans.push({
            name: 'Zap.co.il',
            status: 'found',
            resultsCount: zapResult.providers.length,
          });
        } else {
          websiteScans.push({
            name: 'Zap.co.il',
            status: 'not_found',
          });
        }
      } catch (error) {
        console.error('[Batch Processor] Zap error:', error);
        websiteScans.push({
          name: 'Zap.co.il',
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    // Get scrapers to process in this batch
    const { data: scrapers, error: scrapersError } = await supabase
      .from('scrapers')
      .select('*')
      .eq('enabled', true)
      .order('priority', { ascending: false })
      .range(completedCount, completedCount + BATCH_SIZE - 1);
    
    if (scrapersError) {
      console.error('Error fetching scrapers:', scrapersError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch scrapers' },
        { status: 500 }
      );
    }
    
    // Process scrapers in parallel
    if (scrapers && scrapers.length > 0) {
      const scrapePromises = scrapers.map(async (scraper: any) => {
        const config: ScraperConfig = {
          id: scraper.id,
          name: scraper.name,
          baseUrl: scraper.base_url,
          enabled: scraper.enabled,
          priority: scraper.priority,
          searchPattern: scraper.search_pattern,
        };
        
        try {
          const recommendedPrice = (job as any).recommended_price ? parseFloat((job as any).recommended_price) : undefined;
          const results = await scrapeGeneric(config, job.product_name, recommendedPrice);
          return { scraper, results, error: null };
        } catch (error) {
          console.error(`[Batch Processor] Error scraping ${scraper.name}:`, error);
          return { scraper, results: [], error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });
      
      const batchResults = await Promise.all(scrapePromises);
      
      // Process results and track scans
      for (const { scraper, results, error } of batchResults) {
        if (error) {
          websiteScans.push({
            name: scraper.name,
            status: 'error',
            error,
          });
        } else if (results.length > 0) {
          allResults.push(...results);
          websiteScans.push({
            name: scraper.name,
            status: 'found',
            resultsCount: results.length,
          });
        } else {
          websiteScans.push({
            name: scraper.name,
            status: 'not_found',
          });
        }
      }
      
      completedCount += scrapers.length;
    }
    
    // Determine if job is complete
    const isComplete = completedCount >= job.total_scrapers;
    const newStatus = isComplete ? 'completed' : 'processing';
    
    // Update job with results and scan metadata
    await supabase
      .from('scraping_jobs')
      .update({
        status: newStatus,
        completed_scrapers: completedCount,
        results: allResults,
        website_scans: websiteScans,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    
    const progress = Math.round((completedCount / job.total_scrapers) * 100);
    
    console.log(`[Batch Processor] Job ${jobId}: ${completedCount}/${job.total_scrapers} complete (${allResults.length} providers found)`);
    
    return NextResponse.json({
      success: true,
      data: {
        jobId,
        status: newStatus,
        progress,
        completedScrapers: completedCount,
        totalScrapers: job.total_scrapers,
        results: allResults,
      },
    });
  } catch (error) {
    console.error('Error in process-batch:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
