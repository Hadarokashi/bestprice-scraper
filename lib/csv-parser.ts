import Papa from 'papaparse';
import { Product, RawProductRow, ManualPriceRow, ProviderPrice } from './types';
import { randomUUID } from 'crypto';

/**
 * Parse price string from Hebrew CSV format
 * Handles formats like "₪ 1,249", "₪ 859", "₪ -"
 */
function parsePrice(priceStr: string | undefined): number {
  if (!priceStr || priceStr.trim() === '' || priceStr.includes('-')) {
    return 0;
  }
  
  // Remove currency symbol, commas, and whitespace
  const cleaned = priceStr
    .replace(/₪/g, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .trim();
  
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Find a column value by matching partial header names
 */
function findColumnValue(row: Record<string, string>, patterns: string[]): string {
  for (const key of Object.keys(row)) {
    const normalizedKey = key.trim().toLowerCase();
    for (const pattern of patterns) {
      if (normalizedKey.includes(pattern.toLowerCase())) {
        return row[key]?.trim() || '';
      }
    }
  }
  return '';
}

/**
 * Clean product name by removing special symbols
 */
function cleanProductName(name: string): string {
  return name
    // Remove Ω and similar symbols
    .replace(/Ω|ω|\u03A9|\u00D8/g, '')
    // Replace slashes with spaces
    .replace(/\//g, ' ')
    // Remove other special chars but keep letters, numbers, spaces, Hebrew, hyphen, period
    .replace(/[^\w\sא-ת.-]/g, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse Hebrew product CSV file
 */
export function parseProductCSV(csvContent: string): Product[] {
  // Pre-process: remove BOM and normalize line endings
  let cleanedContent = csvContent
    .replace(/^\uFEFF/, '') // Remove BOM
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  
  // Split into lines and find the actual header row (first row with meaningful content)
  const lines = cleanedContent.split('\n');
  let headerIndex = 0;
  
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i].trim();
    // Check if this line contains header-like content (Hebrew text)
    if (line.includes('שם') || line.includes('פריט') || line.includes('מק')) {
      headerIndex = i;
      break;
    }
  }
  
  // Reconstruct CSV starting from the header row
  if (headerIndex > 0) {
    cleanedContent = lines.slice(headerIndex).join('\n');
  }

  const result = Papa.parse<Record<string, string>>(cleanedContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length > 0) {
    console.warn('CSV parsing warnings:', result.errors);
  }

  // Log headers for debugging
  if (result.data.length > 0) {
    console.log('CSV Headers found:', Object.keys(result.data[0]));
  }

  const products: Product[] = [];
  let currentCategory = '';

  for (const row of result.data) {
    // Use flexible column matching
    const name = findColumnValue(row, ['שם פריט', 'שם', 'פריט', 'לינק']);
    const sku = findColumnValue(row, ['מק"ט', 'מקט', 'יצרן']);
    const barcode = findColumnValue(row, ['ברקוד', 'barcode']);
    const recommendedPriceStr = findColumnValue(row, ['מחיר מומלץ', 'לצרכן', 'כולל מעמ']);
    const salePriceStr = findColumnValue(row, ['סייל', 'לסוחר', 'ללא מע']);
    const consumerSalePriceStr = findColumnValue(row, ['מבצע לצרכן', 'מבצע']);

    // Check if this is a category row (has text in price column but no barcode)
    if (!barcode && recommendedPriceStr && !recommendedPriceStr.includes('₪')) {
      currentCategory = recommendedPriceStr.trim();
      continue;
    }

    // Skip rows without essential data
    if (!name || !barcode) {
      continue;
    }

    const recommendedPrice = parsePrice(recommendedPriceStr);
    
    // Skip products with no price
    if (recommendedPrice <= 0) {
      continue;
    }

    products.push({
      id: randomUUID(),
      name: cleanProductName(name),
      sku,
      barcode,
      recommendedPrice,
      salePrice: parsePrice(salePriceStr) || undefined,
      consumerSalePrice: parsePrice(consumerSalePriceStr) || undefined,
      category: currentCategory || undefined,
    });
  }

  return products;
}

/**
 * Parse manual price import CSV
 * Expected columns: barcode, provider_name, price, url (optional)
 */
export function parseManualPriceCSV(csvContent: string): ProviderPrice[] {
  const result = Papa.parse<ManualPriceRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
  });

  if (result.errors.length > 0) {
    console.warn('Manual price CSV parsing warnings:', result.errors);
  }

  const prices: ProviderPrice[] = [];

  for (const row of result.data) {
    const barcode = row.barcode?.trim();
    const providerName = row.provider_name?.trim();
    const priceStr = row.price?.trim();
    const url = row.url?.trim() || '';

    if (!barcode || !providerName || !priceStr) {
      continue;
    }

    const price = parsePrice(priceStr);
    if (price <= 0) {
      continue;
    }

    prices.push({
      providerName,
      providerUrl: url,
      price,
      currency: 'ILS',
      lastUpdated: new Date().toISOString(),
      source: 'manual',
    });
  }

  return prices;
}

/**
 * Convert products to CSV for export
 */
export function productsToCSV(products: Product[]): string {
  return Papa.unparse(products.map(p => ({
    'Product Name': p.name,
    'SKU': p.sku,
    'Barcode': p.barcode,
    'Recommended Price (ILS)': p.recommendedPrice,
    'Category': p.category || '',
  })));
}

/**
 * Convert flagged providers to CSV for export
 */
export function flaggedToCSV(comparisons: Array<{
  productName: string;
  barcode: string;
  recommendedPrice: number;
  provider: ProviderPrice;
  priceDifference: number;
  percentBelow: number;
}>): string {
  return Papa.unparse(comparisons.map(c => ({
    'Product Name': c.productName,
    'Barcode': c.barcode,
    'Recommended Price (ILS)': c.recommendedPrice,
    'Provider': c.provider.providerName,
    'Provider URL': c.provider.providerUrl,
    'Provider Price (ILS)': c.provider.price,
    'Price Difference (ILS)': c.priceDifference.toFixed(2),
    'Percent Below': `${c.percentBelow.toFixed(1)}%`,
    'Source': c.provider.source,
    'Last Updated': c.provider.lastUpdated,
  })));
}

