import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { Product, ProductsStore, ApiResponse } from '@/lib/types';

// GET /api/products - List all products
export async function GET(): Promise<NextResponse<ApiResponse<ProductsStore>>> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name');

    if (error) throw error;

    const products: Product[] = (data || []).map(row => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      barcode: row.barcode,
      recommendedPrice: parseFloat(row.recommended_price),
      salePrice: row.sale_price ? parseFloat(row.sale_price) : undefined,
      consumerSalePrice: row.consumer_sale_price ? parseFloat(row.consumer_sale_price) : undefined,
      category: row.category || undefined,
    }));

    return NextResponse.json({ 
      success: true, 
      data: { products, lastImported: new Date().toISOString() } 
    });
  } catch (error) {
    console.error('GET /api/products error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/products - Add or update products
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<{ count: number }>>> {
  try {
    const body = await request.json();
    const newProducts: Product[] = body.products;
    const replaceAll: boolean = body.replaceAll ?? false;

    if (!Array.isArray(newProducts)) {
      return NextResponse.json(
        { success: false, error: 'Products must be an array' },
        { status: 400 }
      );
    }

    if (replaceAll) {
      // Delete all existing products first
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (deleteError) throw deleteError;
    }

    // Upsert products (insert or update on conflict)
    const productsToUpsert = newProducts.map(p => ({
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

    const { error } = await supabase
      .from('products')
      .upsert(productsToUpsert, { onConflict: 'barcode' });

    if (error) throw error;

    return NextResponse.json({ success: true, data: { count: newProducts.length } });
  } catch (error) {
    console.error('POST /api/products error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/products - Clear all products
export async function DELETE(): Promise<NextResponse<ApiResponse<null>>> {
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (error) throw error;

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    console.error('DELETE /api/products error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
