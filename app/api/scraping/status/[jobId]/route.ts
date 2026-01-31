import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ScrapingJob } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const jobId = params.jobId;
    
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
    
    const progress = job.total_scrapers > 0
      ? Math.round((job.completed_scrapers / job.total_scrapers) * 100)
      : 0;
    
    return NextResponse.json({
      success: true,
      data: {
        id: job.id,
        productId: job.product_id,
        productName: job.product_name,
        barcode: job.barcode,
        status: job.status,
        totalScrapers: job.total_scrapers,
        completedScrapers: job.completed_scrapers,
        progress,
        results: job.results || [],
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      } as ScrapingJob & { progress: number },
    });
  } catch (error) {
    console.error('Error in status:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
