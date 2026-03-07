import type {
  AppSettings,
  PriceComparison,
  ProviderPrice,
  ProductScanState,
  ScheduleConfig,
  ScanMetadata,
  ScanPhase,
  ScanSitePreset,
  ScraperConfig,
  WebsiteScanStatus,
} from './types';

export const JOB_META_NAME = '__job_meta__';

export const DEFAULT_SCAN_SETTINGS: Required<
  Pick<AppSettings, 'scanMode' | 'sitePreset' | 'cacheFreshnessHours' | 'maxConcurrentJobs'>
> = {
  scanMode: 'zap_then_remaining',
  sitePreset: 'enabled',
  cacheFreshnessHours: 24,
  maxConcurrentJobs: 2,
};

const MUSIC_SITE_NAMES = new Set([
  'Bconnect',
  'Diez',
  'Next-Pro',
  'הד סאונד',
  'טרטל',
  'עולם המוסיקה',
  "מג'יקל נוטס",
  'אודיולאב',
  'לבמה',
  'מיוזיק סנטר',
  'אסקול',
  'Speed of Sound',
  'Ginges',
  'Signal',
  'Orior',
  'Kilombo',
  'FunkyDJ',
  'שלמון',
  'קול המוסיקה',
  'חלילית',
  'מצלול',
  'פעימות',
  'אפקט',
  'שכטר',
  "סאונד צ'ק",
  'דראם בית',
]);

export function getSiteCategory(name: string): 'music' | 'electronics' | 'general' {
  if (MUSIC_SITE_NAMES.has(name)) {
    return 'music';
  }
  return 'electronics';
}

export function toScraperConfig(row: Record<string, unknown>): ScraperConfig {
  const name = String(row.name || '');
  const dbCategory = row.category ? String(row.category) : undefined;
  const validCategories = ['music', 'electronics', 'general'];
  const category = dbCategory && validCategories.includes(dbCategory)
    ? (dbCategory as 'music' | 'electronics' | 'general')
    : getSiteCategory(name);

  return {
    id: String(row.id || ''),
    name,
    baseUrl: String(row.base_url || row.baseUrl || ''),
    enabled: Boolean(row.enabled),
    priority: Number(row.priority || 0),
    searchPattern: row.search_pattern ? String(row.search_pattern) : undefined,
    category,
    method: name === 'Zap.co.il' ? 'zap' : 'playwright',
    timeoutMs: row.timeout_ms ? Number(row.timeout_ms) : undefined,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export function filterScrapersByPreset(
  scrapers: ScraperConfig[],
  preset: ScanSitePreset,
  selectedSites: string[] = []
): ScraperConfig[] {
  const selected = new Set(selectedSites);

  switch (preset) {
    case 'music':
      return scrapers.filter((scraper) => scraper.category === 'music');
    case 'electronics':
      return scrapers.filter((scraper) => scraper.category === 'electronics');
    case 'selected':
      return selected.size > 0
        ? scrapers.filter((scraper) => selected.has(scraper.name))
        : scrapers;
    case 'enabled':
    default:
      return scrapers;
  }
}

export function dedupeProviders(providers: ProviderPrice[]): ProviderPrice[] {
  const seen = new Map<string, ProviderPrice>();

  for (const provider of providers) {
    const key = [
      provider.providerName.trim().toLowerCase(),
      provider.providerUrl.trim().toLowerCase(),
      provider.price,
    ].join('::');

    if (!seen.has(key)) {
      seen.set(key, provider);
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.price - b.price);
}

export function createJobMetaEntry(meta: Partial<WebsiteScanStatus>): WebsiteScanStatus {
  return {
    type: 'meta',
    name: JOB_META_NAME,
    status: 'pending',
    phase: 'queued',
    ...meta,
  };
}

export function extractJobMeta(websites: WebsiteScanStatus[] = []): WebsiteScanStatus | undefined {
  return websites.find((entry) => entry.type === 'meta' || entry.name === JOB_META_NAME);
}

export function replaceJobMeta(
  websites: WebsiteScanStatus[] = [],
  meta: WebsiteScanStatus
): WebsiteScanStatus[] {
  const siteEntries = websites.filter((entry) => entry.name !== JOB_META_NAME && entry.type !== 'meta');
  return [meta, ...siteEntries];
}

export function filterVisibleSiteScans(websites: WebsiteScanStatus[] = []): WebsiteScanStatus[] {
  return websites.filter((entry) => entry.name !== JOB_META_NAME && entry.type !== 'meta');
}

export function normalizeScanMetadata(input?: Partial<ScanMetadata> | null): ScanMetadata | undefined {
  if (!input) {
    return undefined;
  }

  const websites = filterVisibleSiteScans(input.websites || []);
  const meta = extractJobMeta(input.websites || []);

  return {
    totalWebsites: input.totalWebsites ?? websites.length,
    scannedWebsites: input.scannedWebsites ?? websites.filter((site) => site.status !== 'pending').length,
    websites,
    phase: input.phase ?? meta?.phase,
    message: input.message ?? meta?.message,
    currentSite: input.currentSite ?? meta?.currentSite,
    currentBatch: input.currentBatch,
    mode: input.mode ?? meta?.mode,
    providerCount: input.providerCount,
    cached: input.cached,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
  };
}

export function buildComparisonFromJob(params: {
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
}): PriceComparison {
  return {
    productId: params.productId,
    barcode: params.barcode,
    recommendedPrice: params.recommendedPrice,
    threshold: params.threshold,
    providers: dedupeProviders(params.providers),
    flaggedProviders: dedupeProviders(params.flaggedProviders),
    lastSearched: params.lastSearched,
    error: params.error,
    scanMetadata: params.scanMetadata,
    jobId: params.jobId,
    phase: params.phase,
  };
}

export function buildScanStateFromComparison(
  comparison: PriceComparison | undefined,
  isLoading = false
): ProductScanState | undefined {
  if (!comparison && !isLoading) {
    return undefined;
  }

  const metadata = comparison?.scanMetadata;
  const providersCount = comparison?.providers.length || 0;
  const phase = comparison?.phase || metadata?.phase || (isLoading ? 'queued' : 'idle');

  let label = 'ממתין';
  if (phase === 'checking_zap') label = 'בודק בזאפ';
  if (phase === 'zap_complete') label = 'נמצא בזאפ';
  if (phase === 'scanning_sites') label = 'סורק אתרים';
  if (phase === 'completed') label = 'הושלם';
  if (phase === 'partial') label = 'הושלם חלקית';
  if (phase === 'failed') label = 'שגיאה';
  if (phase === 'cached') label = 'מהמטמון';

  const total = metadata?.totalWebsites || 0;
  const scanned = metadata?.scannedWebsites || 0;
  const progress = total > 0 ? Math.round((scanned / total) * 100) : phase === 'completed' ? 100 : 0;

  return {
    jobId: comparison?.jobId,
    phase,
    label,
    progress,
    providerCount: providersCount,
    currentSite: metadata?.currentSite,
    message: metadata?.message,
    mode: metadata?.mode,
    lastRunAt: comparison?.lastSearched,
    cached: metadata?.cached,
  };
}

export function isCompletedScan(comparison?: PriceComparison | null): boolean {
  if (!comparison) {
    return false;
  }

  const metadata = comparison.scanMetadata;
  if (!metadata) {
    return false;
  }

  if (comparison.phase && !['completed', 'cached'].includes(comparison.phase)) {
    return false;
  }

  return metadata.totalWebsites > 0 && metadata.scannedWebsites >= metadata.totalWebsites;
}

export function isSameCalendarDay(isoString?: string): boolean {
  if (!isoString) {
    return false;
  }

  const date = new Date(isoString);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function isComparisonFresh(
  comparison: PriceComparison | undefined,
  freshnessHours = DEFAULT_SCAN_SETTINGS.cacheFreshnessHours
): boolean {
  if (!comparison?.lastSearched) {
    return false;
  }

  const diffMs = Date.now() - new Date(comparison.lastSearched).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) {
    return false;
  }

  const freshnessMs = freshnessHours * 60 * 60 * 1000;
  return diffMs <= freshnessMs || isSameCalendarDay(comparison.lastSearched);
}

export function shouldReuseCachedComparison(
  comparison: PriceComparison | undefined,
  freshnessHours = DEFAULT_SCAN_SETTINGS.cacheFreshnessHours
): boolean {
  return isCompletedScan(comparison) && isComparisonFresh(comparison, freshnessHours);
}

export function markComparisonAsCached(
  comparison: PriceComparison,
  message: string
): PriceComparison {
  return {
    ...comparison,
    phase: 'cached',
    scanMetadata: comparison.scanMetadata
      ? {
          ...comparison.scanMetadata,
          cached: true,
          phase: 'cached',
          message,
        }
      : {
          totalWebsites: 0,
          scannedWebsites: 0,
          websites: [],
          cached: true,
          phase: 'cached',
          message,
        },
  };
}

export function formatLastRunLabel(isoString?: string): string {
  if (!isoString) {
    return 'לא הורץ';
  }

  return new Date(isoString).toLocaleString('he-IL', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  enabled: false,
  frequency: 'off',
  hour: 8,
  timezone: 'Asia/Jerusalem',
};

export function mapSettingsWithDefaults(settings?: AppSettings | null): AppSettings {
  return {
    threshold: settings?.threshold ?? 10,
    priceSource: settings?.priceSource ?? 'zap',
    serpApiKey: settings?.serpApiKey,
    scanMode: settings?.scanMode ?? DEFAULT_SCAN_SETTINGS.scanMode,
    sitePreset: settings?.sitePreset ?? DEFAULT_SCAN_SETTINGS.sitePreset,
    cacheFreshnessHours: settings?.cacheFreshnessHours ?? DEFAULT_SCAN_SETTINGS.cacheFreshnessHours,
    maxConcurrentJobs: settings?.maxConcurrentJobs ?? DEFAULT_SCAN_SETTINGS.maxConcurrentJobs,
    schedule: settings?.schedule ?? DEFAULT_SCHEDULE,
  };
}

const ZAP_TO_SITE_MAP: Record<string, string[]> = {
  ksp: ['KSP'],
  bug: ['Bug'],
  ivory: ['Ivory'],
  'מחסני חשמל': ['מחסני חשמל', 'מחסני חשמל אילת'],
  'pay&go': ['מחסני חשמל', 'מחסני חשמל אילת'],
  payngo: ['מחסני חשמל', 'מחסני חשמל אילת'],
  'שקם אלקטריק': ['SHEKEM', 'שקם דיוטי פרי'],
  shekem: ['SHEKEM', 'שקם דיוטי פרי'],
  ace: ['אייס'],
  אייס: ['אייס'],
  'חשמל נטו': ['חשמל נטו'],
  netoneto: ['חשמל נטו'],
  'ביג אלקטריק': ['ביג אלקטריק'],
  'big electric': ['ביג אלקטריק'],
  'סופר-פארם': ['SUPERPHARM'],
  superpharm: ['SUPERPHARM'],
  'super-pharm': ['SUPERPHARM'],
  wallashops: ['WALLASHOPS'],
  וואלהשופס: ['WALLASHOPS'],
  lastprice: ['LASTPRICE'],
  לאסטפרייס: ['LASTPRICE'],
  kravitz: ['KRAVITZ'],
  קרביץ: ['KRAVITZ'],
  htzone: ['HITECHZONE'],
  'היי-טק זון': ['HITECHZONE'],
  alm: ['ALM'],
  'eilat depot': ['אילת דיפו'],
  'אילת דיפו': ['אילת דיפו'],
  'zap store': ['ZAPSTORE'],
  zapstore: ['ZAPSTORE'],
  bconnect: ['Bconnect'],
  diez: ['Diez'],
  'sound check': ["סאונד צ'ק"],
  "סאונד צ'ק": ["סאונד צ'ק"],
  ginges: ['Ginges'],
  "ג'ינג'ס": ['Ginges'],
  funkydj: ['FunkyDJ'],
  'funky dj': ['FunkyDJ'],
  'next-pro': ['Next-Pro'],
  nextpro: ['Next-Pro'],
};

export function getSitesToExclude(zapProviders: Array<{ providerName: string }>): string[] {
  const excludeSites: Set<string> = new Set();

  for (const provider of zapProviders) {
    const providerNameLower = provider.providerName.toLowerCase().trim();

    if (ZAP_TO_SITE_MAP[providerNameLower]) {
      ZAP_TO_SITE_MAP[providerNameLower].forEach((site) => excludeSites.add(site));
      continue;
    }

    for (const [zapName, siteNames] of Object.entries(ZAP_TO_SITE_MAP)) {
      if (providerNameLower.includes(zapName) || zapName.includes(providerNameLower)) {
        siteNames.forEach((site) => excludeSites.add(site));
      }
    }
  }

  return Array.from(excludeSites);
}

export function computeFlaggedProviders(
  providers: ProviderPrice[],
  recommendedPrice: number,
  threshold: number
): ProviderPrice[] {
  const thresholdPrice = recommendedPrice * (1 - threshold / 100);
  return providers.filter((provider) => provider.price < thresholdPrice);
}
