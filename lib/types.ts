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
  displayOrder?: number;
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

export type ScanMode =
  | 'zap_only'
  | 'zap_then_remaining'
  | 'selected_sites'
  | 'retry_failed'
  | 'playwright_only';

export type ScanSitePreset = 'enabled' | 'music' | 'electronics' | 'selected';

export type ScanPhase =
  | 'idle'
  | 'queued'
  | 'checking_zap'
  | 'zap_complete'
  | 'scanning_sites'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cached';

// Website scan status
export interface WebsiteScanStatus {
  type?: 'site' | 'meta';
  name: string;
  status: 'found' | 'not_found' | 'error' | 'pending';
  resultsCount?: number;
  error?: string;
  category?: 'music' | 'electronics' | 'general';
  currentSite?: string;
  message?: string;
  phase?: ScanPhase;
  progress?: number;
  externalJobId?: string;
  workerUrl?: string;
  excludedSites?: string[];
  includedSites?: string[];
  mode?: ScanMode;
  skippedReason?: string;
  providerCount?: number;
}

// Scan metadata for tracking which websites were checked
export interface ScanMetadata {
  totalWebsites: number;
  scannedWebsites: number;
  websites: WebsiteScanStatus[];
  phase?: ScanPhase;
  message?: string;
  currentSite?: string;
  currentBatch?: string;
  mode?: ScanMode;
  providerCount?: number;
  cached?: boolean;
  startedAt?: string;
  completedAt?: string;
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
  scanMetadata?: ScanMetadata;
  jobId?: string;
  phase?: ScanPhase;
}

export type ScheduleFrequency = 'off' | 'daily' | 'weekly';

export interface ScheduleConfig {
  enabled: boolean;
  frequency: ScheduleFrequency;
  hour: number; // 0-23
  timezone: string; // e.g. 'Asia/Jerusalem'
  lastRunAt?: string;
  nextRunAt?: string;
}

// Settings for the application
export interface AppSettings {
  threshold: number; // Percentage below recommended price to flag (e.g., 10 = 10%)
  priceSource: PriceSource;
  serpApiKey?: string;
  scanMode?: ScanMode;
  sitePreset?: ScanSitePreset;
  cacheFreshnessHours?: number;
  maxConcurrentJobs?: number;
  schedule?: ScheduleConfig;
}

// Available price sources
export type PriceSource = 'serpapi' | 'zap' | 'manual' | 'combined' | 'scraper' | 'playwright';

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

// Scraper configuration
export interface ScraperConfig {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  priority: number;
  searchPattern?: string;
  category?: 'music' | 'electronics' | 'general';
  method?: 'http' | 'playwright' | 'zap';
  timeoutMs?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Scraping job
export interface ScrapingJob {
  id: string;
  productId: string;
  productName: string;
  barcode: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  totalScrapers: number;
  completedScrapers: number;
  results: ProviderPrice[];
  createdAt: string;
  updatedAt: string;
  progress?: number;
  phase?: ScanPhase;
  scanMetadata?: ScanMetadata;
}

export interface ProductScanState {
  jobId?: string;
  phase: ScanPhase;
  label: string;
  progress: number;
  providerCount: number;
  currentSite?: string;
  message?: string;
  mode?: ScanMode;
  lastRunAt?: string;
  cached?: boolean;
}