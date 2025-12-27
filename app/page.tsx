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
import { Product, PriceComparison, AppSettings, PriceSource } from '@/lib/types';

export default function Dashboard() {
  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [priceData, setPriceData] = useState<{ [barcode: string]: PriceComparison }>({});
  const [settings, setSettings] = useState<AppSettings>({
    threshold: 10,
    priceSource: 'zap', // Always use Zap.co.il
  });
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState<{ [barcode: string]: boolean }>({});
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProductEditor, setShowProductEditor] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  
  // Bulk search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState({ current: 0, total: 0 });
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Filter state
  const [productFilter, setProductFilter] = useState<FilterType>('all');

  // Load initial data
  useEffect(() => {
    Promise.all([
      fetch('/api/products').then(r => r.json()),
      fetch('/api/prices').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]).then(([productsRes, pricesRes, settingsRes]) => {
      if (productsRes.success && productsRes.data) {
        setProducts(productsRes.data.products || []);
      }
      if (pricesRes.success && pricesRes.data) {
        setPriceData(pricesRes.data);
      }
      if (settingsRes.success && settingsRes.data) {
        setSettings(settingsRes.data);
      }
      setInitialLoading(false);
    }).catch(console.error);
  }, []);

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

  // Check price for a single product
  const handleCheckPrice = useCallback(async (product: Product, signal?: AbortSignal) => {
    setLoading(prev => ({ ...prev, [product.barcode]: true }));

    try {
      const response = await fetch('/api/prices/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          barcode: product.barcode,
          productName: product.name,
          recommendedPrice: product.recommendedPrice,
        }),
        signal,
      });

      const result = await response.json();
      if (result.success && result.data) {
        setPriceData(prev => ({
          ...prev,
          [product.barcode]: result.data,
        }));
        
        // Log results summary
        const providerCount = result.data.providers?.length || 0;
        console.log(`Found ${providerCount} Israeli providers for ${product.name}`);
      } else {
        // Still update the cache to show "searched but no results"
        setPriceData(prev => ({
          ...prev,
          [product.barcode]: {
            productId: product.id,
            barcode: product.barcode,
            recommendedPrice: product.recommendedPrice,
            threshold: settings.threshold,
            providers: [],
            flaggedProviders: [],
            lastSearched: new Date().toISOString(),
          },
        }));
        console.log(`No results for ${product.name}: ${result.error || 'No Israeli providers found'}`);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log(`Search aborted for ${product.name}`);
      } else {
        console.error('Price search error:', error);
      }
    } finally {
      setLoading(prev => ({ ...prev, [product.barcode]: false }));
    }
  }, [settings.threshold]);

  // Bulk price check with abort support
  const handleBulkCheck = async (productsToCheck?: Product[]) => {
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    const checkList = productsToCheck || filteredProducts;
    
    setIsSearching(true);
    setSearchProgress({ current: 0, total: checkList.length });

    for (let i = 0; i < checkList.length; i++) {
      // Check if aborted
      if (signal.aborted) {
        console.log('Bulk search stopped by user');
        break;
      }

      const product = checkList[i];
      setSearchProgress({ current: i + 1, total: checkList.length });
      
      await handleCheckPrice(product, signal);
      
      // Small delay to avoid rate limiting
      if (!signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
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
    serpApiKey?: string;
  }) => {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings),
    });

    const result = await response.json();
    if (result.success) {
      setSettings(prev => ({
        ...prev,
        threshold: newSettings.threshold,
        priceSource: newSettings.priceSource,
        serpApiKey: newSettings.serpApiKey ? '***configured***' : prev.serpApiKey,
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

  // Legacy export for flagged (keeping for backward compatibility)
  const handleExportFlagged = () => handleExportByCategory('flagged');

  // Handle product save from editor
  const handleProductsSave = (updatedProducts: Product[]) => {
    setProducts(updatedProducts);
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
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header - Fixed */}
      <header className="flex-shrink-0 p-6 pb-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold gradient-text mb-1">
              שׁוֹמֵרְמְחִיר
            </h1>
            <p className="text-[var(--muted)]">
              מעקב והשוואת מחירים מול ספקים בישראל
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {flaggedCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/30">
                <AlertBadge count={flaggedCount} />
                <span className="text-[var(--danger)] font-medium">
                  חריגים
                </span>
              </div>
            )}
            <button onClick={() => setShowSettingsModal(true)} className="btn-secondary">
              ⚙️ הגדרות
            </button>
          </div>
        </div>

        {/* Stats Panel */}
        <StatsPanel
          products={products}
          priceData={priceData}
          threshold={settings.threshold}
          isSearching={isSearching}
          searchProgress={searchProgress}
          onExport={handleExportByCategory}
        />
      </header>

      {/* Main Content Area - Scrollable */}
      <div className="flex-1 overflow-hidden p-6 pt-6">
        <div className="h-full flex gap-6">
          {/* Product table - Scrollable */}
          <div className="flex-1 flex flex-col min-w-0 space-y-4 overflow-hidden">
            {/* Actions bar */}
            <div className="flex-shrink-0 rounded-2xl p-4 bg-[var(--card)] border border-[var(--border)] shadow-lg">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    placeholder="🔍 חיפוש לפי שם, מק״ט או ברקוד..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full"
                  />
                </div>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="btn-secondary"
                >
                  📁 ייבוא
                </button>
                <button
                  onClick={() => setShowProductEditor(true)}
                  className="btn-secondary"
                >
                  ✏️ עריכה
                </button>
                
                {/* Search/Stop buttons */}
                {isSearching ? (
                  <button
                    onClick={handleStopSearch}
                    className="btn-danger"
                  >
                    ⏹️ עצור
                  </button>
                ) : (
                  <button
                    onClick={() => handleBulkCheck()}
                    disabled={filteredProducts.length === 0}
                    className="btn-primary"
                  >
                    🔍 בדוק הכל ({filteredProducts.length})
                  </button>
                )}
              </div>
            </div>

            {/* Products table - Scrollable */}
            <div className="flex-1 rounded-2xl overflow-hidden border border-[var(--border)] shadow-lg bg-[var(--card)] overflow-y-auto">
              <ProductTable
                products={filteredProducts}
                priceData={priceData}
                threshold={settings.threshold}
                onCheckPrice={handleCheckPrice}
                onSelectProduct={setSelectedProduct}
                onCheckSelected={handleCheckSelected}
                selectedBarcode={selectedProduct?.barcode}
                loading={loading}
                filter={productFilter}
                onFilterChange={setProductFilter}
              />
            </div>
          </div>

          {/* Sidebar - Fixed, doesn't scroll with table */}
          <div className="hidden lg:block w-[380px] flex-shrink-0 space-y-4 overflow-y-auto">
            {/* Threshold slider */}
            <ThresholdSlider
              value={settings.threshold}
              onChange={handleThresholdChange}
            />

            {/* Price results */}
            <PriceResults
              product={selectedProduct}
              comparison={selectedProduct ? priceData[selectedProduct.barcode] : null}
              threshold={settings.threshold}
            />
          </div>
        </div>
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
