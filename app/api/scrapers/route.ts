import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ApiResponse, ScraperConfig } from '@/lib/types';
import { toScraperConfig } from '@/lib/scan-utils';

export async function GET(): Promise<NextResponse<ApiResponse<ScraperConfig[]>>> {
  try {
    const { data, error } = await supabase
      .from('scrapers')
      .select('*')
      .order('priority', { ascending: false })
      .order('name');

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: (data || []).map((row) => toScraperConfig(row)),
    });
  } catch (error) {
    console.error('GET /api/scrapers error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<ScraperConfig[]>>> {
  try {
    const body = await request.json();
    const scrapers = Array.isArray(body.scrapers) ? body.scrapers : [];

    if (scrapers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'scrapers array is required' },
        { status: 400 }
      );
    }

    const payload = scrapers.map((scraper: ScraperConfig) => ({
      id: scraper.id,
      name: scraper.name,
      base_url: scraper.baseUrl,
      enabled: scraper.enabled,
      priority: scraper.priority,
      search_pattern: scraper.searchPattern || null,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('scrapers')
      .upsert(payload, { onConflict: 'id' })
      .select('*');

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: (data || []).map((row) => toScraperConfig(row)),
    });
  } catch (error) {
    console.error('POST /api/scrapers error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
