import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Product, ProductsStore, ApiResponse } from '@/lib/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadProducts(): Promise<ProductsStore> {
  try {
    const data = await fs.readFile(PRODUCTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { products: [], lastImported: '' };
  }
}

async function saveProducts(store: ProductsStore): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(PRODUCTS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

// GET /api/products - List all products
export async function GET(): Promise<NextResponse<ApiResponse<ProductsStore>>> {
  try {
    const store = await loadProducts();
    return NextResponse.json({ success: true, data: store });
  } catch (error) {
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

    let store: ProductsStore;

    if (replaceAll) {
      // Replace all products entirely (for ProductEditor save)
      store = { products: newProducts, lastImported: new Date().toISOString() };
    } else {
      // Merge products by barcode
      store = await loadProducts();
      for (const newProduct of newProducts) {
        const existingIndex = store.products.findIndex(p => p.barcode === newProduct.barcode);
        if (existingIndex >= 0) {
          store.products[existingIndex] = newProduct;
        } else {
          store.products.push(newProduct);
        }
      }
      store.lastImported = new Date().toISOString();
    }

    await saveProducts(store);

    return NextResponse.json({ success: true, data: { count: newProducts.length } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/products - Clear all products
export async function DELETE(): Promise<NextResponse<ApiResponse<null>>> {
  try {
    await saveProducts({ products: [], lastImported: '' });
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

