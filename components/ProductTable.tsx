'use client';

import { useState } from 'react';
import type { JSX } from 'react';
import { Product, PriceComparison, ProductScanState } from '@/lib/types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export type FilterType = 'all' | 'unmatched' | 'flagged' | 'good' | 'not-searched';

interface ProductTableProps {
  products: Product[];
  priceData: { [barcode: string]: PriceComparison };
  scanStates?: { [barcode: string]: ProductScanState };
  threshold: number;
  onCheckPrice: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onCheckSelected: (products: Product[]) => void;
  selectedBarcode?: string;
  loading?: { [barcode: string]: boolean };
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  onReorder: (products: Product[]) => void;
}

export default function ProductTable({
  products,
  priceData,
  scanStates = {},
  threshold,
  onCheckPrice,
  onSelectProduct,
  onCheckSelected,
  selectedBarcode,
  loading = {},
  filter,
  onFilterChange,
  onReorder,
}: ProductTableProps) {
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = products.findIndex((p) => p.id === active.id);
      const newIndex = products.findIndex((p) => p.id === over.id);

      const newProducts = arrayMove(products, oldIndex, newIndex);
      onReorder(newProducts);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const getProductStatus = (barcode: string): 'not-searched' | 'unmatched' | 'flagged' | 'good' => {
    const comparison = priceData[barcode];
    if (!comparison) return 'not-searched';
    if (comparison.providers.length === 0) return 'unmatched';
    if (comparison.flaggedProviders && comparison.flaggedProviders.length > 0) return 'flagged';
    return 'good';
  };

  const getStatusBadge = (barcode: string) => {
    const scanState = scanStates[barcode];
    if (scanState && ['queued', 'checking_zap', 'zap_complete', 'scanning_sites'].includes(scanState.phase)) {
      return (
        <div className="flex flex-col gap-1">
          <span className="badge bg-[var(--primary)]/15 text-[var(--primary)]">
            {scanState.label}
          </span>
          <span className="text-[10px] text-[var(--muted)]">
            {scanState.message || `${scanState.progress}%`}
          </span>
        </div>
      );
    }

    const status = getProductStatus(barcode);
    switch (status) {
      case 'not-searched':
        return <span className="badge bg-[var(--card)] text-[var(--muted)]">לא נבדק</span>;
      case 'unmatched':
        return <span className="badge badge-warning">לא נמצא</span>;
      case 'flagged':
        const comparison = priceData[barcode];
        return (
          <span className="badge badge-danger">
            {comparison?.flaggedProviders?.length || 0} חריגים
          </span>
        );
      case 'good':
        const comp = priceData[barcode];
        return (
          <span className="badge badge-success">
            {comp?.providers?.length || 0} ספקים ✓
          </span>
        );
    }
  };

  const getLowestPrice = (barcode: string) => {
    const comparison = priceData[barcode];
    if (!comparison || comparison.providers.length === 0) return null;
    return Math.min(...comparison.providers.map(p => p.price));
  };

  // Filter counts
  const counts = {
    all: products.length,
    'not-searched': products.filter(p => getProductStatus(p.barcode) === 'not-searched').length,
    unmatched: products.filter(p => getProductStatus(p.barcode) === 'unmatched').length,
    flagged: products.filter(p => getProductStatus(p.barcode) === 'flagged').length,
    good: products.filter(p => getProductStatus(p.barcode) === 'good').length,
  };

  // Filter products
  const filteredProducts = filter === 'all' 
    ? products 
    : products.filter(p => getProductStatus(p.barcode) === filter);

  // Handle checkbox toggle
  const toggleProduct = (barcode: string) => {
    const newSet = new Set(selectedProducts);
    if (newSet.has(barcode)) {
      newSet.delete(barcode);
    } else {
      newSet.add(barcode);
    }
    setSelectedProducts(newSet);
    setSelectAll(newSet.size === filteredProducts.length && newSet.size > 0);
  };

  // Handle select all
  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedProducts(new Set());
      setSelectAll(false);
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.barcode)));
      setSelectAll(true);
    }
  };

  // Handle check selected
  const handleCheckSelectedClick = () => {
    const productsToCheck = products.filter(p => selectedProducts.has(p.barcode));
    console.log('[ProductTable] Checking selected:', productsToCheck.length, 'products');
    if (productsToCheck.length > 0) {
      onCheckSelected(productsToCheck);
      clearSelection(); // Clear selection after starting check
    }
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedProducts(new Set());
    setSelectAll(false);
  };

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 p-4 border-b border-[var(--border)]">
        <button
          onClick={() => { onFilterChange('all'); clearSelection(); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-[var(--primary)] text-white'
              : 'bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          הכל ({counts.all})
        </button>
        <button
          onClick={() => { onFilterChange('not-searched'); clearSelection(); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === 'not-searched'
              ? 'bg-[var(--muted)] text-white'
              : 'bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          ממתינים ({counts['not-searched']})
        </button>
        <button
          onClick={() => { onFilterChange('flagged'); clearSelection(); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === 'flagged'
              ? 'bg-[var(--danger)] text-white'
              : 'bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          ⚠️ חריגים ({counts.flagged})
        </button>
        <button
          onClick={() => { onFilterChange('unmatched'); clearSelection(); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === 'unmatched'
              ? 'bg-[var(--warning)] text-white'
              : 'bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          🔍 לא נמצאו ({counts.unmatched})
        </button>
        <button
          onClick={() => { onFilterChange('good'); clearSelection(); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === 'good'
              ? 'bg-[var(--success)] text-white'
              : 'bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          ✓ תקינים ({counts.good})
        </button>
      </div>

      {/* Selection bar */}
      {selectedProducts.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-[var(--primary)]/10 border-b border-[var(--primary)]/30">
          <span className="text-[var(--primary)] font-medium">
            {selectedProducts.size} מוצרים נבחרו
          </span>
          <div className="flex gap-2">
            <button
              onClick={clearSelection}
              className="btn-secondary text-sm py-1 px-3"
            >
              ביטול בחירה
            </button>
            <button
              onClick={handleCheckSelectedClick}
              className="btn-primary text-sm py-1 px-3"
            >
              🔍 בדוק נבחרים ({selectedProducts.size})
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-[var(--border)] bg-[var(--card)] text-[var(--primary)] cursor-pointer"
                />
              </th>
              <th className="w-10">⋮⋮</th>
              <th>שם מוצר</th>
              <th>מק״ט</th>
              <th>ברקוד</th>
              <th>מחיר מומלץ</th>
              <th>מחיר נמוך</th>
              <th>סטטוס</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredProducts.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <tbody>
                {filteredProducts.map((product) => (
                  <SortableRow
                    key={product.id}
                    product={product}
                    isSelected={selectedBarcode === product.barcode}
                    isChecked={selectedProducts.has(product.barcode)}
                    isLoading={loading[product.barcode]}
                    scanState={scanStates[product.barcode]}
                    lowestPrice={getLowestPrice(product.barcode)}
                    threshold={threshold}
                    formatPrice={formatPrice}
                    getStatusBadge={getStatusBadge}
                    toggleProduct={toggleProduct}
                    onSelectProduct={onSelectProduct}
                    onCheckPrice={onCheckPrice}
                  />
                ))}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
        
        {filteredProducts.length === 0 && (
          <div className="text-center py-12 text-[var(--muted)]">
            <p className="text-lg mb-2">
              {filter === 'all' ? 'אין מוצרים' : 'אין מוצרים בקטגוריה זו'}
            </p>
            <p className="text-sm">
              {filter === 'all' 
                ? 'ייבא מוצרים מקובץ CSV כדי להתחיל'
                : 'נסה לסנן לפי קטגוריה אחרת'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SortableRow({
  product,
  isSelected,
  isChecked,
  isLoading,
  scanState,
  lowestPrice,
  threshold,
  formatPrice,
  getStatusBadge,
  toggleProduct,
  onSelectProduct,
  onCheckPrice,
}: {
  product: Product;
  isSelected: boolean;
  isChecked: boolean;
  isLoading?: boolean;
  scanState?: ProductScanState;
  lowestPrice: number | null;
  threshold: number;
  formatPrice: (price: number) => string;
  getStatusBadge: (barcode: string) => JSX.Element;
  toggleProduct: (barcode: string) => void;
  onSelectProduct: (product: Product) => void;
  onCheckPrice: (product: Product) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`animate-fade-in transition-colors ${
        isSelected ? 'bg-[var(--primary)]/10' : ''
      } ${isChecked ? 'bg-[var(--primary)]/5' : ''}`}
      onClick={() => onSelectProduct(product)}
    >
      <td onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => toggleProduct(product.barcode)}
          className="w-4 h-4 rounded border-[var(--border)] bg-[var(--card)] text-[var(--primary)] cursor-pointer"
        />
      </td>
      <td
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-[var(--muted)] hover:text-[var(--foreground)]"
        onClick={(e) => e.stopPropagation()}
      >
        ⋮⋮
      </td>
      <td className="font-medium">{product.name}</td>
      <td className="text-[var(--muted)] text-sm">{product.sku}</td>
      <td className="font-mono text-xs">{product.barcode}</td>
      <td className="font-semibold">{formatPrice(product.recommendedPrice)}</td>
      <td>
        {lowestPrice ? (
          <span className={lowestPrice < product.recommendedPrice * (1 - threshold / 100) 
            ? 'text-[var(--danger)] font-semibold' 
            : 'text-[var(--success)]'
          }>
            {formatPrice(lowestPrice)}
          </span>
        ) : (
          <span className="text-[var(--muted)]">—</span>
        )}
      </td>
      <td>{getStatusBadge(product.barcode)}</td>
      <td>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCheckPrice(product);
          }}
          disabled={isLoading}
          className="btn-secondary text-sm py-1 px-2 disabled:opacity-50"
        >
          {isLoading ? (
            <span className="flex items-center gap-1" title={scanState?.message || scanState?.label}>
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </span>
          ) : (
            '🔍'
          )}
        </button>
      </td>
    </tr>
  );
}
