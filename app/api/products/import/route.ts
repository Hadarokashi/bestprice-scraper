import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { parseProductCSV } from '@/lib/csv-parser';
import { ApiResponse } from '@/lib/types';

// POST /api/products/import - Import products from CSV
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<{ imported: number; total: number }>>> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const csvText = formData.get('csvText') as string | null;
    const replaceExisting = formData.get('replaceExisting') === 'true';

    let csvContent: string;

    if (file) {
      csvContent = await file.text();
    } else if (csvText) {
      csvContent = csvText;
    } else {
      return NextResponse.json(
        { success: false, error: 'No CSV file or text provided' },
        { status: 400 }
      );
    }

    // Parse CSV
    const parsedProducts = parseProductCSV(csvContent);

    if (parsedProducts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid products found in CSV' },
        { status: 400 }
      );
    }

    // If replacing, delete all existing products first
    if (replaceExisting) {
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (deleteError) throw deleteError;
    }

    // Prepare products for upsert
    const productsToUpsert = parsedProducts.map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      recommended_price: p.recommendedPrice,
      sale_price: p.salePrice || null,
      consumer_sale_price: p.consumerSalePrice || null,
      category: p.category || null,
      updated_at: new Date().toISOString(),
    }));

    // Upsert in batches of 100
    const batchSize = 100;
    let imported = 0;

    for (let i = 0; i < productsToUpsert.length; i += batchSize) {
      const batch = productsToUpsert.slice(i, i + batchSize);
      const { error } = await supabase
        .from('products')
        .upsert(batch, { onConflict: 'barcode' });

      if (error) throw error;
      imported += batch.length;
    }

    // Get total count
    const { count } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success: true,
      data: { imported, total: count || imported },
    });
  } catch (error) {
    console.error('POST /api/products/import error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
