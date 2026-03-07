import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ApiResponse, ScheduleConfig } from '@/lib/types';
import { DEFAULT_SCHEDULE } from '@/lib/scan-utils';

// POST /api/settings/schedule - Update only the schedule (dedicated endpoint to avoid fallback issues)
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<{ schedule: ScheduleConfig }>>> {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { success: false, error: 'Supabase לא מוגדר. בדוק את משתני הסביבה NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY.' },
        { status: 500 }
      );
    }
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

    let upsertError = (await supabase
      .from('settings')
      .upsert(payload, { onConflict: 'id' })).error;

    // Fallback: if scan_policy column doesn't exist (older schema), retry without it
    if (upsertError) {
      const errMsg = upsertError.message || String(upsertError);
      const maybeMissingColumn = /column.*scan_policy|scan_policy.*does not exist/i.test(errMsg);
      if (maybeMissingColumn) {
        const fallbackPayload = existing
          ? {
              id: existing.id,
              threshold: existing.threshold,
              price_source: existing.price_source,
              updated_at: new Date().toISOString(),
            }
          : {
              id: 1,
              threshold: 10,
              price_source: 'zap',
              updated_at: new Date().toISOString(),
            };
        const fallback = await supabase
          .from('settings')
          .upsert(fallbackPayload, { onConflict: 'id' });
        if (!fallback.error) {
          return NextResponse.json({
            success: false,
            error: 'טבלת ההגדרות חסרה עמודת scan_policy. יש להריץ עדכון סכמה: ALTER TABLE settings ADD COLUMN IF NOT EXISTS scan_policy JSONB DEFAULT \'{}\';',
          }, { status: 400 });
        }
      }
      throw upsertError;
    }

    return NextResponse.json({ success: true, data: { schedule } });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('POST /api/settings/schedule error:', err.message, err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
