import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { AppSettings, ApiResponse } from '@/lib/types';

const DEFAULT_SETTINGS: AppSettings = {
  threshold: 10,
  priceSource: 'zap',
};

// GET /api/settings - Get current settings
export async function GET(): Promise<NextResponse<ApiResponse<AppSettings>>> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

    const settings: AppSettings = data ? {
      threshold: data.threshold,
      priceSource: data.price_source,
    } : DEFAULT_SETTINGS;

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('GET /api/settings error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/settings - Update settings
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<AppSettings>>> {
  try {
    const body = await request.json();

    // Validate threshold
    let threshold = DEFAULT_SETTINGS.threshold;
    if (body.threshold !== undefined) {
      threshold = Number(body.threshold);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        return NextResponse.json(
          { success: false, error: 'Threshold must be a number between 0 and 100' },
          { status: 400 }
        );
      }
    }

    // Validate price source
    let priceSource = body.priceSource || DEFAULT_SETTINGS.priceSource;
    if (!['serpapi', 'zap', 'manual', 'combined'].includes(priceSource)) {
      return NextResponse.json(
        { success: false, error: 'Invalid price source' },
        { status: 400 }
      );
    }

    // Upsert settings (update if exists, insert if not)
    const { data, error } = await supabase
      .from('settings')
      .upsert({
        id: 1, // Always use ID 1 for settings
        threshold,
        price_source: priceSource,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    const settings: AppSettings = {
      threshold: data.threshold,
      priceSource: data.price_source,
    };

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('POST /api/settings error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
