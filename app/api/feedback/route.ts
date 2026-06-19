import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
  loadIgnoredMatches,
  normalizeProviderUrl,
  rowToIgnoredMatch,
} from '@/lib/ignored-matches';
import type { ApiResponse, IgnoredMatch } from '@/lib/types';

export async function GET(): Promise<NextResponse<ApiResponse<IgnoredMatch[]>>> {
  try {
    const data = await loadIgnoredMatches();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/feedback error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<IgnoredMatch>>> {
  try {
    const body = await request.json();
    const barcode = String(body.barcode || '').trim();
    const providerName = String(body.providerName || '').trim();
    const providerUrl = normalizeProviderUrl(body.providerUrl);
    const reason = body.reason ? String(body.reason).trim() : null;

    if (!barcode || !providerName) {
      return NextResponse.json(
        { success: false, error: 'barcode and providerName are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('ignored_matches')
      .upsert(
        {
          barcode,
          provider_name: providerName,
          provider_url: providerUrl,
          reason,
        },
        { onConflict: 'barcode,provider_name,provider_url' }
      )
      .select('id, barcode, provider_name, provider_url, reason, created_at, products(name)')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: rowToIgnoredMatch(data),
    });
  } catch (error) {
    console.error('POST /api/feedback error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest
): Promise<NextResponse<ApiResponse<null>>> {
  try {
    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { success: false, error: 'Valid id query parameter is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase.from('ignored_matches').delete().eq('id', id);
    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/feedback error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
