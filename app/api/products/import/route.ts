import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { parseProductCSV } from '@/lib/csv-parser';
import { ProductsStore, ApiResponse, Product } from '@/lib/types';

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

    // Load existing or start fresh
    let store: ProductsStore;
    if (replaceExisting) {
      store = { products: [], lastImported: '' };
    } else {
      store = await loadProducts();
    }

    // Merge by barcode
    let imported = 0;
    for (const newProduct of parsedProducts) {
      const existingIndex = store.products.findIndex(
        (p: Product) => p.barcode === newProduct.barcode
      );
      if (existingIndex >= 0) {
        store.products[existingIndex] = newProduct;
      } else {
        store.products.push(newProduct);
      }
      imported++;
    }

    store.lastImported = new Date().toISOString();
    await saveProducts(store);

    return NextResponse.json({
      success: true,
      data: { imported, total: store.products.length },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

