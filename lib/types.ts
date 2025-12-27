// Product from CSV import
export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  recommendedPrice: number;
  salePrice?: number;
  consumerSalePrice?: number;
  category?: string;
}

// Provider price result from search
export interface ProviderPrice {
  providerName: string;
  providerUrl: string;
  price: number;
  currency: string;
  lastUpdated: string;
  source: PriceSource;
}

// Price comparison result for a product
export interface PriceComparison {
  productId: string;
  barcode: string;
  recommendedPrice: number;
  threshold: number;
  providers: ProviderPrice[];
  flaggedProviders: ProviderPrice[];
  lastSearched: string;
  error?: string;
}

// Settings for the application
export interface AppSettings {
  threshold: number; // Percentage below recommended price to flag (e.g., 10 = 10%)
  priceSource: PriceSource;
  serpApiKey?: string;
}

// Available price sources
export type PriceSource = 'serpapi' | 'zap' | 'manual' | 'combined';

// Raw CSV row from Hebrew product file
export interface RawProductRow {
  'שם פריט /  לינק': string;
  'מק"ט יצרן': string;
  'ברקוד': string;
  'מחיר מומלץ לצרכן בש"ח כולל מעמ': string;
  'נובמבר סייל עד 03.01.26 לסוחר בש"ח ללא מע"מ'?: string;
  'מבצע לצרכן בש"ח כולל מע"מ עד 03.01.26'?: string;
}

// Manual price import row
export interface ManualPriceRow {
  barcode: string;
  provider_name: string;
  price: string;
  url?: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Price search request
export interface PriceSearchRequest {
  productId: string;
  barcode: string;
  productName: string;
}

// Cached price data
export interface PriceCache {
  [barcode: string]: PriceComparison;
}

// Products data store
export interface ProductsStore {
  products: Product[];
  lastImported: string;
}

