import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ScheduleConfig } from '@/lib/types';
import { DEFAULT_SCHEDULE } from '@/lib/scan-utils';

export const maxDuration = 300;

function shouldRunNow(schedule: ScheduleConfig): boolean {
  if (!schedule.enabled || schedule.frequency === 'off') return false;

  const tz = schedule.timezone || 'Asia/Jerusalem';
  const nowInTz = new Date(
    new Date().toLocaleString('en-US', { timeZone: tz })
  );

  if (schedule.lastRunAt) {
    const lastRun = new Date(
      new Date(schedule.lastRunAt).toLocaleString('en-US', { timeZone: tz })
    );

    if (schedule.frequency === 'daily') {
      const sameDay =
        lastRun.getFullYear() === nowInTz.getFullYear() &&
        lastRun.getMonth() === nowInTz.getMonth() &&
        lastRun.getDate() === nowInTz.getDate();
      if (sameDay) return false;
    }

    if (schedule.frequency === 'weekly') {
      const diffMs = nowInTz.getTime() - lastRun.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays < 6.5) return false;
    }
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

    const schedule: ScheduleConfig = {
      ...DEFAULT_SCHEDULE,
      ...(typeof scanPolicy.schedule === 'object' && scanPolicy.schedule
        ? (scanPolicy.schedule as Partial<ScheduleConfig>)
        : {}),
    };

    if (!shouldRunNow(schedule)) {
      return NextResponse.json({
        success: true,
        message: 'Not time to run yet',
        schedule,
      });
    }

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, barcode, recommended_price')
      .order('name');

    if (productsError) throw productsError;

    if (!products || products.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No products to scan',
      });
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';

    let scannedCount = 0;
    const scanMode = (scanPolicy.scanMode as string) || 'zap_then_remaining';
    const sitePreset = (scanPolicy.sitePreset as string) || 'enabled';

    for (const product of products) {
      try {
        const createRes = await fetch(`${baseUrl}/api/scraping/create-job`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: product.id,
            productName: product.name,
            barcode: product.barcode,
            recommendedPrice: Number(product.recommended_price),
            scanMode,
            sitePreset,
          }),
        });

        const createResult = await createRes.json();
        if (!createResult.success || !createResult.data?.id) continue;

        const jobId = createResult.data.id;
        let status = 'pending';
        let retries = 0;
        const maxRetries = 60;

        while (!['completed', 'failed', 'partial'].includes(status) && retries < maxRetries) {
          const tickRes = await fetch(`${baseUrl}/api/scraping/process-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId }),
          });

          const tickResult = await tickRes.json();
          status = tickResult.data?.status || 'failed';
          retries++;

          if (!['completed', 'failed', 'partial'].includes(status)) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        }

        scannedCount++;
      } catch (err) {
        console.error(`Cron: failed to scan product ${product.name}:`, err);
      }
    }

    const now = new Date().toISOString();
    const updatedSchedule = { ...schedule, lastRunAt: now };
    const updatedPolicy = { ...scanPolicy, schedule: updatedSchedule };

    await supabase
      .from('settings')
      .update({
        scan_policy: updatedPolicy,
        updated_at: now,
      })
      .eq('id', settingsRow?.id || 1);

    return NextResponse.json({
      success: true,
      message: `Scheduled scan complete: ${scannedCount}/${products.length} products scanned`,
      schedule: updatedSchedule,
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
