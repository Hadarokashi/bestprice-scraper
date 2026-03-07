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

    if (body.scraper) {
      const s = body.scraper as Partial<ScraperConfig>;
      if (!s.name || !s.baseUrl) {
        return NextResponse.json(
          { success: false, error: 'name and baseUrl are required' },
          { status: 400 },
        );
      }

      const row: Record<string, unknown> = {
        name: s.name.trim(),
        base_url: s.baseUrl.trim(),
        enabled: s.enabled ?? true,
        priority: s.priority ?? 5,
        search_pattern: s.searchPattern || '/?s={query}',
        category: s.category || 'general',
        method: s.method || 'playwright',
        updated_at: new Date().toISOString(),
      };

      if (s.id) {
        row.id = s.id;
      }

      const { error } = await supabase.from('scrapers').upsert(row, { onConflict: 'id' });
      if (error) throw error;

      const { data: allData, error: fetchError } = await supabase
        .from('scrapers')
        .select('*')
        .order('priority', { ascending: false })
        .order('name');
      if (fetchError) throw fetchError;

      return NextResponse.json({
        success: true,
        data: (allData || []).map((r) => toScraperConfig(r)),
      });
    }

    const scrapers = Array.isArray(body.scrapers) ? body.scrapers : [];

    if (scrapers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'scrapers array or scraper object is required' },
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
      category: scraper.category || 'general',
      method: scraper.method || 'playwright',
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

export async function DELETE(request: NextRequest): Promise<NextResponse<ApiResponse<null>>> {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id is required' },
        { status: 400 },
      );
    }

    const { error } = await supabase.from('scrapers').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/scrapers error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
