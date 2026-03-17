import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ScheduleConfig } from '@/lib/types';

export const maxDuration = 300;

const FIXED_SCHEDULE: ScheduleConfig = {
  enabled: true,
  frequency: 'daily',
  hour: 5,
  timezone: 'Asia/Jerusalem',
};

function shouldRunNow(lastRunAt?: string): boolean {
  const tz = FIXED_SCHEDULE.timezone;
  const nowInTz = new Date(
    new Date().toLocaleString('en-US', { timeZone: tz })
  );

  if (lastRunAt) {
    const lastRun = new Date(
      new Date(lastRunAt).toLocaleString('en-US', { timeZone: tz })
    );
    const sameDay =
      lastRun.getFullYear() === nowInTz.getFullYear() &&
      lastRun.getMonth() === nowInTz.getMonth() &&
      lastRun.getDate() === nowInTz.getDate();
    if (sameDay) return false;
  }

  return true;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: settingsRow, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') throw settingsError;

    const scanPolicy =
      typeof settingsRow?.scan_policy === 'object' && settingsRow?.scan_policy
        ? (settingsRow.scan_policy as Record<string, unknown>)
        : {};

    const savedSchedule =
      typeof scanPolicy.schedule === 'object' && scanPolicy.schedule
        ? (scanPolicy.schedule as Partial<ScheduleConfig>)
        : undefined;
    const lastRunAt = savedSchedule?.lastRunAt;

    if (!shouldRunNow(lastRunAt)) {
      return NextResponse.json({
        success: true,
        message: 'Not time to run yet',
        schedule: {
          ...FIXED_SCHEDULE,
          lastRunAt,
        },
      });
    }

    const now = new Date().toISOString();
    const updatedSchedule = { ...FIXED_SCHEDULE, lastRunAt: now };
    const updatedPolicy = { ...scanPolicy, schedule: updatedSchedule };

    // Persist run start up-front so a timeout later won't make the day look "not run".
    await supabase
      .from('settings')
      .update({
        scan_policy: updatedPolicy,
        updated_at: now,
      })
      .eq('id', settingsRow?.id || 1);

    const workerBaseUrl = process.env.PLAYWRIGHT_SCRAPER_URL || 'https://bestprice-scraper.onrender.com';
    const workerSecret =
      process.env.SCRAPER_API_SECRET ||
      process.env.PLAYWRIGHT_SCRAPER_SECRET ||
      cronSecret;
    const orchestratorRes = await fetch(`${workerBaseUrl}/cron/orchestrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workerSecret
          ? {
              Authorization: `Bearer ${workerSecret}`,
              'x-cron-secret': workerSecret,
              'x-scraper-secret': workerSecret,
            }
          : {}),
      },
      body: JSON.stringify({
        appBaseUrl: request.nextUrl.origin,
      }),
      signal: AbortSignal.timeout(90000),
    });

    const orchestratorText = await orchestratorRes.text();
    if (!orchestratorRes.ok) {
      throw new Error(`Failed to trigger Render orchestrator: ${orchestratorRes.status} ${orchestratorText}`);
    }
    let orchestratorResult: Record<string, unknown> = {};
    if (orchestratorText) {
      try {
        orchestratorResult = JSON.parse(orchestratorText);
      } catch {
        orchestratorResult = { raw: orchestratorText };
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Daily scan orchestration triggered on Render',
      schedule: updatedSchedule,
      orchestrator: {
        workerBaseUrl,
        ...(orchestratorResult?.data || {}),
      },
    });
  } catch (error) {
    console.error('Cron scan error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
