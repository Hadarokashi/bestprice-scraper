import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { PriceCache, ApiResponse } from '@/lib/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const PRICE_CACHE_FILE = path.join(DATA_DIR, 'price-cache.json');

async function loadPriceCache(): Promise<PriceCache> {
  try {
    const data = await fs.readFile(PRICE_CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// GET /api/prices - Get all cached prices
export async function GET(): Promise<NextResponse<ApiResponse<PriceCache>>> {
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

// DELETE /api/prices - Clear price cache
export async function DELETE(): Promise<NextResponse<ApiResponse<null>>> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(PRICE_CACHE_FILE, '{}', 'utf-8');
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

