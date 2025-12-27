import { ProviderPrice } from '../types';
import { PriceSearchResult } from './index';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const MANUAL_PRICES_FILE = path.join(DATA_DIR, 'manual-prices.json');

interface ManualPriceStore {
  [barcode: string]: ProviderPrice[];
}

/**
 * Get manually imported prices for a product
 */
export async function getManualPrices(barcode: string): Promise<PriceSearchResult> {
  try {
    const data = await fs.readFile(MANUAL_PRICES_FILE, 'utf-8');
    const store: ManualPriceStore = JSON.parse(data);
    
    const providers = store[barcode] || [];
    
    return {
      success: true,
      providers,
    };
  } catch (error) {
    // File doesn't exist or is invalid - return empty results
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        success: true,
        providers: [],
      };
    }
    
    return {
      success: false,
      providers: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Save manually imported prices
 */
export async function saveManualPrices(
  barcode: string,
  prices: ProviderPrice[]
): Promise<void> {
  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  let store: ManualPriceStore = {};
  
  try {
    const data = await fs.readFile(MANUAL_PRICES_FILE, 'utf-8');
    store = JSON.parse(data);
  } catch {
    // File doesn't exist, start fresh
  }
  
  store[barcode] = prices;
  
  await fs.writeFile(
    MANUAL_PRICES_FILE,
    JSON.stringify(store, null, 2),
    'utf-8'
  );
}

/**
 * Import multiple manual prices from parsed CSV data
 */
export async function importManualPrices(
  prices: Array<{ barcode: string; provider: ProviderPrice }>
): Promise<{ imported: number; errors: string[] }> {
  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  let store: ManualPriceStore = {};
  
  try {
    const data = await fs.readFile(MANUAL_PRICES_FILE, 'utf-8');
    store = JSON.parse(data);
  } catch {
    // File doesn't exist, start fresh
  }
  
  const errors: string[] = [];
  let imported = 0;
  
  for (const item of prices) {
    if (!item.barcode || !item.provider) {
      errors.push(`Invalid price entry: missing barcode or provider`);
      continue;
    }
    
    if (!store[item.barcode]) {
      store[item.barcode] = [];
    }
    
    // Check for duplicate provider
    const existingIndex = store[item.barcode].findIndex(
      p => p.providerName === item.provider.providerName
    );
    
    if (existingIndex >= 0) {
      // Update existing
      store[item.barcode][existingIndex] = item.provider;
    } else {
      // Add new
      store[item.barcode].push(item.provider);
    }
    
    imported++;
  }
  
  await fs.writeFile(
    MANUAL_PRICES_FILE,
    JSON.stringify(store, null, 2),
    'utf-8'
  );
  
  return { imported, errors };
}

/**
 * Get all manual prices
 */
export async function getAllManualPrices(): Promise<ManualPriceStore> {
  try {
    const data = await fs.readFile(MANUAL_PRICES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * Clear all manual prices
 */
export async function clearManualPrices(): Promise<void> {
  try {
    await fs.unlink(MANUAL_PRICES_FILE);
  } catch {
    // File doesn't exist, nothing to clear
  }
}

