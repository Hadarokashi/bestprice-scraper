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

  // Run only at 05:00 Israel local time.
  if (nowInTz.getHours() !== FIXED_SCHEDULE.hour) {
    return false;
  }

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
    const updatedSchedule = { ...FIXED_SCHEDULE, lastRunAt: now };
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
