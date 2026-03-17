'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import ProductTable, { FilterType } from '@/components/ProductTable';
import PriceResults from '@/components/PriceResults';
import ThresholdSlider from '@/components/ThresholdSlider';
import AlertBadge from '@/components/AlertBadge';
import ImportModal from '@/components/ImportModal';
import SettingsModal from '@/components/SettingsModal';
import StatsPanel from '@/components/StatsPanel';
import ProductEditor from '@/components/ProductEditor';
import ProvidersView from '@/components/ProvidersView';
import AdminPanel from '@/components/AdminPanel';
import {
  AppSettings,
  PriceComparison,
  PriceSource,
  Product,
  ProductScanState,
  ScanMode,
  ScanSitePreset,
  ScheduleConfig,
} from '@/lib/types';
import {
  buildScanStateFromComparison,
  DEFAULT_SCAN_SETTINGS,
  formatLastRunLabel,
  markComparisonAsCached,
  mapSettingsWithDefaults,
  shouldReuseCachedComparison,
} from '@/lib/scan-utils';

interface ScanJobResponse {
  status: string;
  comparison?: PriceComparison;
}

export default function Dashboard() {
  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [priceData, setPriceData] = useState<{ [barcode: string]: PriceComparison }>({});
  const [scanStates, setScanStates] = useState<{ [barcode: string]: ProductScanState }>({});
  const [settings, setSettings] = useState<AppSettings>(mapSettingsWithDefaults({
    threshold: 10,
    priceSource: 'zap',
  }));
  const [runScanMode, setRunScanMode] = useState<ScanMode>(DEFAULT_SCAN_SETTINGS.scanMode);
  const [runSitePreset, setRunSitePreset] = useState<ScanSitePreset>(DEFAULT_SCAN_SETTINGS.sitePreset);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState<{ [barcode: string]: boolean }>({});
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProductEditor, setShowProductEditor] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  
  // Tab navigation state
  const [activeTab, setActiveTab] = useState<'products' | 'providers' | 'admin'>('products');
  
  // Bulk search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState({ current: 0, total: 0 });
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Filter state
  const [productFilter, setProductFilter] = useState<FilterType>('all');

  const loadDashboardData = useCallback(async () => {
    const [productsRes, pricesRes, settingsRes] = await Promise.all([
      fetch('/api/products').then((r) => r.json()),
      fetch('/api/prices').then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ]);

    if (productsRes.success && productsRes.data) {
      setProducts(productsRes.data.products || []);
    }

    if (pricesRes.success && pricesRes.data) {
      setPriceData(pricesRes.data);
      setScanStates(
        Object.entries(pricesRes.data).reduce((acc, [barcode, comparison]) => {
          const state = buildScanStateFromComparison(comparison as PriceComparison, false);
          if (state) {
            acc[barcode] = state;
          }
          return acc;
        }, {} as { [barcode: string]: ProductScanState })
      );
    }

    if (settingsRes.success && settingsRes.data) {
      setSettings(mapSettingsWithDefaults(settingsRes.data));
    }
  }, []);

  // Load initial data
  useEffect(() => {
    loadDashboardData()
      .catch(console.error)
      .finally(() => setInitialLoading(false));
  }, [loadDashboardData]);

  // Count flagged products
  const flaggedCount = Object.values(priceData).reduce(
    (count, comparison) => count + (comparison.flaggedProviders?.length > 0 ? 1 : 0),
    0
  );

  // Filter products
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    p.barcode.includes(searchFilter) ||
    p.sku.includes(searchFilter)
  );

  // Import products from CSV
  const handleImport = async (file: File, replaceExisting: boolean) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('replaceExisting', String(replaceExisting));

    const response = await fetch('/api/products/import', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    if (result.success) {
      // Reload products
      const productsRes = await fetch('/api/products').then(r => r.json());
      if (productsRes.success) {
        setProducts(productsRes.data.products || []);
      }
    } else {
      alert(`שגיאה בייבוא: ${result.error}`);
    }
  };

  // Playwright scraper URL (Render cloud or local)
  const CLOUD_SCRAPER_URL = 'https://bestprice-scraper.onrender.com';
  const LOCAL_SCRAPER_URL = 'http://localhost:3001';
  const [scraperUrl, setScraperUrl] = useState<string | null>(null);
  const [usePlaywright, setUsePlaywright] = useState(false);
  
  // Check if Playwright scraper is available (cloud or local)
  useEffect(() => {
    // Try cloud scraper first (longer timeout for Render free tier wake-up)
    fetch(`${CLOUD_SCRAPER_URL}/health`, { signal: AbortSignal.timeout(30000) })
      .then(r => r.json())
      .then(data => {
        if (data.status === 'ok') {
          setScraperUrl(CLOUD_SCRAPER_URL);
          setUsePlaywright(true);
          console.log('[Dashboard] Cloud Playwright scraper detected - using browser-based scraping');
        }
      })
      .catch(() => {
        // Try local scraper as fallback
        fetch(`${LOCAL_SCRAPER_URL}/health`, { signal: AbortSignal.timeout(2000) })
          .then(r => r.json())
          .then(data => {
            if (data.status === 'ok') {
              setScraperUrl(LOCAL_SCRAPER_URL);
              setUsePlaywright(true);
              console.log('[Dashboard] Local Playwright scraper detected - using browser-based scraping');
            }
          })
          .catch(() => {
            console.log('[Dashboard] No Playwright scraper available - using HTTP scraping');
          });
      });
  }, []);

  useEffect(() => {
    setRunScanMode(settings.scanMode || DEFAULT_SCAN_SETTINGS.scanMode);
    setRunSitePreset(settings.sitePreset || DEFAULT_SCAN_SETTINGS.sitePreset);
  }, [settings.scanMode, settings.sitePreset]);

  const applyJobUpdate = useCallback((product: Product, data: ScanJobResponse) => {
    const comparison = data?.comparison;
    if (!comparison) {
      return;
    }

    setPriceData((prev) => ({
      ...prev,
      [product.barcode]: comparison,
    }));

    const scanState = buildScanStateFromComparison(comparison, data?.status === 'processing');
    if (scanState) {
      setScanStates((prev) => ({
        ...prev,
        [product.barcode]: scanState,
      }));
    }
  }, []);

  const createQueuedState = useCallback((product: Product, message = 'מחכה בתור') => {
    setScanStates((prev) => ({
      ...prev,
      [product.barcode]: {
        jobId: prev[product.barcode]?.jobId,
        phase: 'queued',
        label: 'מחכה בתור',
        progress: 0,
        providerCount: prev[product.barcode]?.providerCount || 0,
        message,
        mode: runScanMode,
      },
    }));
  }, [runScanMode]);

  const runScanJob = useCallback(async (product: Product, signal?: AbortSignal) => {
    const existingComparison = priceData[product.barcode];
    const freshnessHours = settings.cacheFreshnessHours || DEFAULT_SCAN_SETTINGS.cacheFreshnessHours;

    if (shouldReuseCachedComparison(existingComparison, freshnessHours)) {
      const cachedComparison = markComparisonAsCached(
        existingComparison!,
        `נעשה שימוש במטמון מהיום (${formatLastRunLabel(existingComparison?.lastSearched)})`
      );

      setPriceData((prev) => ({
        ...prev,
        [product.barcode]: cachedComparison,
      }));

      const cachedState = buildScanStateFromComparison(cachedComparison, false);
      if (cachedState) {
        setScanStates((prev) => ({
          ...prev,
          [product.barcode]: cachedState,
        }));
      }
      return;
    }

    setLoading((prev) => ({ ...prev, [product.barcode]: true }));
    createQueuedState(product, 'יוצר משימת סריקה');

    try {
      const startResponse = await fetch('/api/scraping/create-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          productName: product.name,
          barcode: product.barcode,
          recommendedPrice: product.recommendedPrice,
          scanMode: runScanMode,
          sitePreset: runSitePreset,
        }),
        signal,
      });

      const startResult = await startResponse.json();
      if (!startResult.success || !startResult.data?.id) {
        throw new Error(startResult.error || 'Failed to create scan job');
      }

      const jobId = startResult.data.id;
      let status = 'pending';

      setScanStates((prev) => ({
        ...prev,
        [product.barcode]: {
          jobId,
          phase: 'queued',
          label: 'מחכה בתור',
          progress: 0,
          providerCount: 0,
          message: 'ממתין לתחילת עיבוד',
          mode: runScanMode,
        },
      }));

      while (!signal?.aborted && !['completed', 'failed', 'partial'].includes(status)) {
        const tickResponse = await fetch('/api/scraping/process-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId }),
          signal,
        });

        const tickResult = await tickResponse.json();
        if (!tickResult.success) {
          throw new Error(tickResult.error || 'Failed to process scan job');
        }

        status = tickResult.data.status;
        applyJobUpdate(product, tickResult.data);

        if (!['completed', 'failed', 'partial'].includes(status)) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Price search error:', error);
        setScanStates((prev) => ({
          ...prev,
          [product.barcode]: {
            jobId: prev[product.barcode]?.jobId,
            phase: 'failed',
            label: 'שגיאה',
            progress: 0,
            providerCount: 0,
            message: error instanceof Error ? error.message : 'Unknown error',
            mode: runScanMode,
          },
        }));
      }
    } finally {
      setLoading((prev) => ({ ...prev, [product.barcode]: false }));
    }
  }, [applyJobUpdate, createQueuedState, priceData, runScanMode, runSitePreset, settings.cacheFreshnessHours]);

  // Check price for a single product using the unified job contract
  const handleCheckPrice = useCallback(async (product: Product, signal?: AbortSignal) => {
    await runScanJob(product, signal);
  }, [runScanJob]);

  // Bulk price check with queued jobs and configurable concurrency
  const handleBulkCheck = async (productsToCheck?: Product[]) => {
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const checkList = productsToCheck || filteredProducts;
    const maxConcurrentJobs = settings.maxConcurrentJobs || DEFAULT_SCAN_SETTINGS.maxConcurrentJobs;

    setIsSearching(true);
    setSearchProgress({ current: 0, total: checkList.length });

    for (const product of checkList) {
      createQueuedState(product);
    }

    let completedCount = 0;

    for (let i = 0; i < checkList.length; i += maxConcurrentJobs) {
      if (signal.aborted) break;

      const batch = checkList.slice(i, i + maxConcurrentJobs);
      await Promise.all(
        batch.map(async (product) => {
          if (signal.aborted) return;
          await runScanJob(product, signal);
          completedCount += 1;
          setSearchProgress({ current: completedCount, total: checkList.length });
        })
      );
    }

    setIsSearching(false);
    abortControllerRef.current = null;
  };
  
  // Check selected products
  const handleCheckSelected = (selectedProducts: Product[]) => {
    console.log('[Page] handleCheckSelected called with', selectedProducts.length, 'products');
    if (selectedProducts.length > 0) {
      handleBulkCheck(selectedProducts);
    }
  };

  // Stop bulk search
  const handleStopSearch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsSearching(false);
  };

  // Save settings
  const handleSaveSettings = async (newSettings: {
    threshold: number;
    priceSource: PriceSource;
    scanMode: ScanMode;
    sitePreset: ScanSitePreset;
    cacheFreshnessHours: number;
    maxConcurrentJobs: number;
    serpApiKey?: string;
    schedule?: ScheduleConfig;
  }) => {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings),
    });

    const result = await response.json();
    if (result.success) {
      setSettings(mapSettingsWithDefaults({
        ...settings,
        threshold: newSettings.threshold,
        priceSource: newSettings.priceSource,
        scanMode: newSettings.scanMode,
        sitePreset: newSettings.sitePreset,
        cacheFreshnessHours: newSettings.cacheFreshnessHours,
        maxConcurrentJobs: newSettings.maxConcurrentJobs,
        serpApiKey: newSettings.serpApiKey ? '***configured***' : settings.serpApiKey,
        schedule: newSettings.schedule || settings.schedule,
      }));
    }
  };

  // Update threshold
  const handleThresholdChange = async (value: number) => {
    setSettings(prev => ({ ...prev, threshold: value }));
    
    // Debounced save
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threshold: value }),
    });

    // Update flagged providers in price data
    setPriceData(prev => {
      const updated = { ...prev };
      for (const barcode of Object.keys(updated)) {
        const product = products.find(p => p.barcode === barcode);
        if (product) {
          const thresholdPrice = product.recommendedPrice * (1 - value / 100);
          updated[barcode] = {
            ...updated[barcode],
            threshold: value,
            flaggedProviders: updated[barcode].providers.filter(
              p => p.price < thresholdPrice
            ),
          };
        }
      }
      return updated;
    });
  };

  // Get product status helper
  const getProductStatus = (barcode: string): 'not-searched' | 'unmatched' | 'flagged' | 'good' => {
    const comparison = priceData[barcode];
    if (!comparison) return 'not-searched';
    if (comparison.providers.length === 0) return 'unmatched';
    if (comparison.flaggedProviders && comparison.flaggedProviders.length > 0) return 'flagged';
    return 'good';
  };

  // Export products by category
  const handleExportByCategory = (category: FilterType) => {
    let productsToExport: Product[] = [];
    
    if (category === 'all') {
      productsToExport = products;
    } else {
      productsToExport = products.filter(p => getProductStatus(p.barcode) === category);
    }

    if (productsToExport.length === 0) {
      alert('אין מוצרים לייצוא בקטגוריה זו');
      return;
    }

    // Build export data with provider info
    const exportData: Array<Record<string, string | number>> = [];

    for (const product of productsToExport) {
      const comparison = priceData[product.barcode];
      const status = getProductStatus(product.barcode);
      
      if (status === 'flagged' && comparison?.flaggedProviders) {
        // For flagged products, export each flagged provider
        for (const provider of comparison.flaggedProviders) {
          const percentBelow = (
            ((product.recommendedPrice - provider.price) / product.recommendedPrice) * 100
          ).toFixed(1);
          
          exportData.push({
            'שם מוצר': product.name,
            'ברקוד': product.barcode,
            'מק״ט': product.sku,
            'מחיר מומלץ': product.recommendedPrice,
            'סטטוס': 'חריג',
            'ספק': provider.providerName,
            'מחיר ספק': provider.price,
            'אחוז הנחה': `${percentBelow}%`,
            'קישור': provider.providerUrl,
          });
        }
      } else if (status === 'good' && comparison?.providers) {
        // For good products, export lowest price
        const lowestProvider = comparison.providers.reduce((a, b) => a.price < b.price ? a : b);
        exportData.push({
          'שם מוצר': product.name,
          'ברקוד': product.barcode,
          'מק״ט': product.sku,
          'מחיר מומלץ': product.recommendedPrice,
          'סטטוס': 'תקין',
          'ספק': lowestProvider.providerName,
          'מחיר ספק': lowestProvider.price,
          'אחוז הנחה': '',
          'קישור': lowestProvider.providerUrl,
        });
      } else {
        // For unmatched or not-searched
        exportData.push({
          'שם מוצר': product.name,
          'ברקוד': product.barcode,
          'מק״ט': product.sku,
          'מחיר מומלץ': product.recommendedPrice,
          'סטטוס': status === 'unmatched' ? 'לא נמצא' : 'לא נבדק',
          'ספק': '',
          'מחיר ספק': '',
          'אחוז הנחה': '',
          'קישור': '',
        });
      }
    }

    // Convert to CSV
    const headers = Object.keys(exportData[0]).join(',');
    const rows = exportData.map(item =>
      Object.values(item).map(v => `"${v}"`).join(',')
    );
    const csv = [headers, ...rows].join('\n');

    // Get filename based on category
    const categoryNames: Record<FilterType, string> = {
      'all': 'all-products',
      'flagged': 'flagged',
      'unmatched': 'unmatched',
      'good': 'good',
      'not-searched': 'pending',
    };

    // Download
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${categoryNames[category]}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle product save from editor
  const handleProductsSave = (updatedProducts: Product[]) => {
    setProducts(updatedProducts);
  };

  // Handle product reorder from drag-and-drop
  const handleReorder = async (newProducts: Product[]) => {
    // Update local state immediately for smooth UX
    setProducts(newProducts);
    
    // Update display_order in database
    try {
      for (let i = 0; i < newProducts.length; i++) {
        await fetch('/api/products/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: newProducts[i].id,
            newOrder: i,
          }),
        });
      }
    } catch (error) {
      console.error('Error updating product order:', error);
      // On error, reload products from API to restore correct order
      const response = await fetch('/api/products');
      const result = await response.json();
      if (result.success) {
        setProducts(result.data.products);
      }
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--muted)]">טוען...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen lg:h-screen lg:overflow-hidden">
      {/* Header - Fixed */}
      <header className="flex-shrink-0 p-4 md:p-6 pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 md:mb-6">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold gradient-text mb-1">
              BestPrice
            </h1>
            <p className="text-sm md:text-base text-[var(--muted)]">
              מעקב והשוואת מחירים מול ספקים בישראל
            </p>
            {usePlaywright && (
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-xs text-green-500">
                  {scraperUrl?.includes('onrender.com') ? 'Playwright (ענן)' : 'Playwright (מקומי)'}
                </span>
              </div>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {flaggedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/30">
                <AlertBadge count={flaggedCount} />
                <span className="text-[var(--danger)] font-medium text-sm sm:text-base">
                  חריגים
                </span>
              </div>
            )}
            <button onClick={() => setShowSettingsModal(true)} className="btn-secondary min-h-[44px]">
              ⚙️ הגדרות
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-4 md:mb-6 overflow-x-auto pb-1 -mx-1">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex-shrink-0 px-4 md:px-6 py-2.5 rounded-lg font-medium transition-all text-sm md:text-base ${
              activeTab === 'products'
                ? 'bg-[var(--primary)] text-white shadow-lg'
                : 'bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--border)]/30'
            }`}
          >
            📦 מוצרים
          </button>
          <button
            onClick={() => setActiveTab('providers')}
            className={`flex-shrink-0 px-4 md:px-6 py-2.5 rounded-lg font-medium transition-all text-sm md:text-base ${
              activeTab === 'providers'
                ? 'bg-[var(--primary)] text-white shadow-lg'
                : 'bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--border)]/30'
            }`}
          >
            🏪 ספקים
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex-shrink-0 px-4 md:px-6 py-2.5 rounded-lg font-medium transition-all text-sm md:text-base ${
              activeTab === 'admin'
                ? 'bg-[var(--primary)] text-white shadow-lg'
                : 'bg-[var(--background)] border border-[var(--border)] hover:bg-[var(--border)]/30'
            }`}
          >
            🛠️ אדמין
          </button>
        </div>

        {/* Stats Panel - Only show on products tab */}
        {activeTab === 'products' && (
          <StatsPanel
            products={products}
            priceData={priceData}
            threshold={settings.threshold}
            isSearching={isSearching}
            searchProgress={searchProgress}
            onExport={handleExportByCategory}
          />
        )}
      </header>

      {/* Main Content Area - Scrollable */}
      <div className="flex-1 lg:min-h-0 lg:overflow-hidden p-4 md:p-6 pt-4 md:pt-6">
        {activeTab === 'products' ? (
          <div className="lg:h-full lg:min-h-0 flex flex-col lg:flex-row gap-4 lg:gap-6">
            {/* Product table - Scrollable */}
            <div className="flex-1 flex lg:min-h-0 flex-col min-w-0 space-y-4 lg:overflow-hidden">
              {/* Actions bar */}
              <div className="flex-shrink-0 rounded-2xl p-4 bg-[var(--card)] border border-[var(--border)] shadow-lg">
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      placeholder="🔍 חיפוש לפי שם, מק״ט או ברקוד..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="w-full min-h-[44px]"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-center">
                    <div className="flex-1 min-w-0 sm:min-w-[180px]">
                      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                        שיטת סריקה
                      </label>
                      <select
                        value={runScanMode}
                        onChange={(e) => setRunScanMode(e.target.value as ScanMode)}
                        className="w-full sm:min-w-[180px] text-sm min-h-[44px]"
                        title="שיטת הסריקה להרצה הבאה"
                      >
                        <option value="zap_then_remaining">Zap ואז אתרים חסרים</option>
                        <option value="zap_only">Zap בלבד</option>
                        <option value="playwright_only">Playwright בלבד</option>
                        <option value="selected_sites">אתרים נבחרים</option>
                        <option value="retry_failed">אתרים שנכשלו</option>
                      </select>
                    </div>
                    <div className="flex-1 min-w-0 sm:min-w-[160px]">
                      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                        קבוצת אתרים
                      </label>
                      <select
                        value={runSitePreset}
                        onChange={(e) => setRunSitePreset(e.target.value as ScanSitePreset)}
                        className="w-full sm:min-w-[160px] text-sm min-h-[44px]"
                        title="Preset אתרים להרצה הבאה"
                      >
                        <option value="enabled">כל האתרים</option>
                        <option value="music">חנויות מוסיקה</option>
                        <option value="electronics">חנויות אלקטרוניקה</option>
                        <option value="selected">אתרים נבחרים באדמין</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="btn-secondary min-h-[44px] flex-1 sm:flex-none"
                    >
                      📁 ייבוא
                    </button>
                    <button
                      onClick={() => setShowProductEditor(true)}
                      className="btn-secondary min-h-[44px] flex-1 sm:flex-none"
                    >
                      ✏️ עריכה
                    </button>
                  
                    {/* Search/Stop buttons */}
                    {isSearching ? (
                      <button
                        onClick={handleStopSearch}
                        className="btn-danger min-h-[44px] flex-1 sm:flex-none"
                      >
                        ⏹️ עצור
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBulkCheck()}
                        disabled={filteredProducts.length === 0}
                        className="btn-primary min-h-[44px] flex-1 sm:flex-none"
                      >
                        🔍 בדוק הכל ({filteredProducts.length})
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Products table - Scrollable */}
              <div className="min-h-[60vh] lg:min-h-0 lg:flex-1 rounded-2xl overflow-hidden border border-[var(--border)] shadow-lg bg-[var(--card)]">
                <ProductTable
                  products={filteredProducts}
                  priceData={priceData}
                  scanStates={scanStates}
                  threshold={settings.threshold}
                  onCheckPrice={handleCheckPrice}
                  onSelectProduct={setSelectedProduct}
                  onCheckSelected={handleCheckSelected}
                  selectedBarcode={selectedProduct?.barcode}
                  loading={loading}
                  filter={productFilter}
                  onFilterChange={setProductFilter}
                  onReorder={handleReorder}
                />
              </div>
            </div>

            {/* Sidebar - Desktop only */}
            <div className="hidden lg:block w-[380px] min-h-0 flex-shrink-0 space-y-4 overflow-y-auto">
              <ThresholdSlider
                value={settings.threshold}
                onChange={handleThresholdChange}
              />
              <PriceResults
                product={selectedProduct}
                comparison={selectedProduct ? priceData[selectedProduct.barcode] : null}
                threshold={settings.threshold}
              />
            </div>

            {/* Mobile bottom sheet - Price results when product selected */}
            {selectedProduct && (
              <>
                <div
                  className="lg:hidden fixed inset-0 z-40 bg-black/40"
                  onClick={() => setSelectedProduct(null)}
                  aria-hidden="true"
                />
                <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-[var(--card)] border-t border-[var(--border)] shadow-2xl rounded-t-2xl max-h-[70vh] flex flex-col pb-[env(safe-area-inset-bottom)]">
                <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                  <span className="font-medium">פרטי מוצר ומחירים</span>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="p-2 -m-2 rounded-lg hover:bg-[var(--border)]/50 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="סגור"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                  <ThresholdSlider
                    value={settings.threshold}
                    onChange={handleThresholdChange}
                  />
                  <PriceResults
                    product={selectedProduct}
                    comparison={priceData[selectedProduct.barcode] ?? null}
                    threshold={settings.threshold}
                  />
                </div>
              </div>
              </>
            )}
          </div>
        ) : activeTab === 'providers' ? (
          <div className="h-full overflow-y-auto">
            <ProvidersView />
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <AdminPanel
              settings={settings}
              onRefresh={loadDashboardData}
              onOpenSettings={() => setShowSettingsModal(true)}
              onSaveSettings={async (patch) => {
                await handleSaveSettings({
                  threshold: settings.threshold,
                  priceSource: settings.priceSource,
                  scanMode: settings.scanMode || 'zap_then_remaining',
                  sitePreset: settings.sitePreset || 'enabled',
                  cacheFreshnessHours: settings.cacheFreshnessHours || 24,
                  maxConcurrentJobs: settings.maxConcurrentJobs || 2,
                  ...patch,
                } as Parameters<typeof handleSaveSettings>[0]);
              }}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
      />
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        threshold={settings.threshold}
        priceSource={settings.priceSource}
        scanMode={settings.scanMode}
        sitePreset={settings.sitePreset}
        cacheFreshnessHours={settings.cacheFreshnessHours}
        maxConcurrentJobs={settings.maxConcurrentJobs}
        hasApiKey={!!settings.serpApiKey}
        onSave={handleSaveSettings}
      />
      <ProductEditor
        isOpen={showProductEditor}
        onClose={() => setShowProductEditor(false)}
        products={products}
        onSave={handleProductsSave}
      />
    </div>
  );
}
