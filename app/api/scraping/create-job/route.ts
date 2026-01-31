import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ScraperConfig, ScrapingJob } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { productId, productName, barcode } = await request.json();
    
    if (!productId || !productName || !barcode) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Get all enabled scrapers
    const { data: scrapers, error: scrapersError } = await supabase
      .from('scrapers')
      .select('*')
      .eq('enabled', true)
      .order('priority', { ascending: false });
    
    if (scrapersError) {
      console.error('Error fetching scrapers:', scrapersError);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch scrapers' },
        { status: 500 }
      );
    }
    
    const totalScrapers = (scrapers || []).length;
    
    // Create scraping job
    const { data: job, error: jobError } = await supabase
      .from('scraping_jobs')
      .insert({
        product_id: productId,
        product_name: productName,
        barcode,
        status: 'pending',
        total_scrapers: totalScrapers,
        completed_scrapers: 0,
        results: [],
      })
      .select()
      .single();
    
    if (jobError) {
      console.error('Error creating job:', jobError);
      return NextResponse.json(
        { success: false, error: 'Failed to create job' },
        { status: 500 }
      );
    }
    
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
        results: job.results,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      } as ScrapingJob,
    });
  } catch (error) {
    console.error('Error in create-job:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
