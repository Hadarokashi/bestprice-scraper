import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { AppSettings, ApiResponse } from '@/lib/types';
import { DEFAULT_SCAN_SETTINGS, mapSettingsWithDefaults } from '@/lib/scan-utils';

const DEFAULT_SETTINGS: AppSettings = {
  threshold: 10,
  priceSource: 'zap',
  scanMode: DEFAULT_SCAN_SETTINGS.scanMode,
  sitePreset: DEFAULT_SCAN_SETTINGS.sitePreset,
  cacheFreshnessHours: DEFAULT_SCAN_SETTINGS.cacheFreshnessHours,
  maxConcurrentJobs: DEFAULT_SCAN_SETTINGS.maxConcurrentJobs,
};

// GET /api/settings - Get current settings
export async function GET(): Promise<NextResponse<ApiResponse<AppSettings>>> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

    const scanPolicy = typeof data?.scan_policy === 'object' && data?.scan_policy
      ? data.scan_policy
      : {};

    const settings: AppSettings = mapSettingsWithDefaults(data ? {
      threshold: data.threshold,
      priceSource: data.price_source,
      scanMode: scanPolicy.scanMode,
      sitePreset: scanPolicy.sitePreset,
      cacheFreshnessHours: scanPolicy.cacheFreshnessHours,
      maxConcurrentJobs: scanPolicy.maxConcurrentJobs,
    } : DEFAULT_SETTINGS);

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
    const priceSource = body.priceSource || DEFAULT_SETTINGS.priceSource;
    if (!['serpapi', 'zap', 'manual', 'combined', 'scraper', 'playwright'].includes(priceSource)) {
      return NextResponse.json(
        { success: false, error: 'Invalid price source' },
        { status: 400 }
      );
    }

    const scanMode = body.scanMode || DEFAULT_SETTINGS.scanMode;
    if (!['zap_only', 'zap_then_remaining', 'selected_sites', 'retry_failed', 'playwright_only'].includes(scanMode)) {
      return NextResponse.json(
        { success: false, error: 'Invalid scan mode' },
        { status: 400 }
      );
    }

    const sitePreset = body.sitePreset || DEFAULT_SETTINGS.sitePreset;
    if (!['enabled', 'music', 'electronics', 'selected'].includes(sitePreset)) {
      return NextResponse.json(
        { success: false, error: 'Invalid site preset' },
        { status: 400 }
      );
    }

    const cacheFreshnessHours = Number(body.cacheFreshnessHours ?? DEFAULT_SETTINGS.cacheFreshnessHours);
    const maxConcurrentJobs = Number(body.maxConcurrentJobs ?? DEFAULT_SETTINGS.maxConcurrentJobs);

    const scanPolicy = {
      scanMode,
      sitePreset,
      cacheFreshnessHours: Number.isFinite(cacheFreshnessHours) ? cacheFreshnessHours : DEFAULT_SETTINGS.cacheFreshnessHours,
      maxConcurrentJobs: Number.isFinite(maxConcurrentJobs) ? maxConcurrentJobs : DEFAULT_SETTINGS.maxConcurrentJobs,
    };

    const basePayload = {
      id: 1,
      threshold,
      price_source: priceSource,
      updated_at: new Date().toISOString(),
    };

    let data;
    let error;

    ({ data, error } = await supabase
      .from('settings')
      .upsert({
        ...basePayload,
        scan_policy: scanPolicy,
      }, { onConflict: 'id' })
      .select()
      .single());

    // Fallback for databases that have not been migrated yet.
    if (error) {
      ({ data, error } = await supabase
        .from('settings')
        .upsert(basePayload, { onConflict: 'id' })
        .select()
        .single());
    }

    if (error) throw error;

    const settings: AppSettings = mapSettingsWithDefaults({
      threshold: data.threshold,
      priceSource: data.price_source,
      scanMode,
      sitePreset,
      cacheFreshnessHours: scanPolicy.cacheFreshnessHours,
      maxConcurrentJobs: scanPolicy.maxConcurrentJobs,
    });

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('POST /api/settings error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
