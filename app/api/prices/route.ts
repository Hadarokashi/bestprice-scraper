import { NextResponse } from 'next/server';
import { loadPriceCache } from '@/lib/price-cache';

export async function GET() {
  try {
    const cache = await loadPriceCache();
    return NextResponse.json({ success: true, data: cache });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
