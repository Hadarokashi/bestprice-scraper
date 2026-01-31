import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { productId, newOrder } = await request.json();
    
    if (!productId || newOrder === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing productId or newOrder' },
        { status: 400 }
      );
    }
    
    // Update the product's display_order
    const { error } = await supabase
      .from('products')
      .update({ display_order: newOrder })
      .eq('id', productId);
    
    if (error) {
      console.error('Error updating product order:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to update product order' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in reorder:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
