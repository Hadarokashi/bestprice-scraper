import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ApiResponse, ScheduleConfig } from '@/lib/types';
import { DEFAULT_SCHEDULE } from '@/lib/scan-utils';

// POST /api/settings/schedule - Update only the schedule (dedicated endpoint to avoid fallback issues)
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<{ schedule: ScheduleConfig }>>> {
  try {
    const body = await request.json();
    const incoming = body.schedule as Partial<ScheduleConfig> | undefined;

    if (!incoming) {
      return NextResponse.json(
        { success: false, error: 'schedule object is required' },
        { status: 400 }
      );
    }

    const schedule: ScheduleConfig = {
      enabled: incoming.enabled ?? DEFAULT_SCHEDULE.enabled,
      frequency: incoming.frequency ?? DEFAULT_SCHEDULE.frequency,
      hour: incoming.hour != null && Number.isFinite(incoming.hour) ? incoming.hour : DEFAULT_SCHEDULE.hour,
      timezone: incoming.timezone || DEFAULT_SCHEDULE.timezone,
      lastRunAt: incoming.lastRunAt,
      nextRunAt: incoming.nextRunAt,
    };

    const { data: existing, error: fetchError } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const currentPolicy = (existing?.scan_policy as Record<string, unknown>) || {};
    const mergedPolicy = {
      ...currentPolicy,
      schedule,
    };

    const payload = existing
      ? {
          id: existing.id,
          threshold: existing.threshold,
          price_source: existing.price_source,
          scan_policy: mergedPolicy,
          updated_at: new Date().toISOString(),
        }
      : {
          id: 1,
          threshold: 10,
          price_source: 'zap',
          scan_policy: mergedPolicy,
          updated_at: new Date().toISOString(),
        };

    const { error: upsertError } = await supabase
      .from('settings')
      .upsert(payload, { onConflict: 'id' });

    if (upsertError) throw upsertError;

    return NextResponse.json({ success: true, data: { schedule } });
  } catch (error) {
    console.error('POST /api/settings/schedule error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
