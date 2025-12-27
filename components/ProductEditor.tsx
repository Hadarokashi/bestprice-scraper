'use client';

import { useState, useEffect } from 'react';
import { Product } from '@/lib/types';

interface ProductEditorProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSave: (products: Product[]) => void;
}

export default function ProductEditor({
  isOpen,
  onClose,
  products,
  onSave,
}: ProductEditorProps) {
  const [localProducts, setLocalProducts] = useState<Product[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: '',
    sku: '',
    barcode: '',
    recommendedPrice: 0,
    category: '',
  });
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    setLocalProducts([...products]);
  }, [products, isOpen]);

  if (!isOpen) return null;

  const filteredProducts = localProducts.filter(p =>
    p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    p.barcode.includes(searchFilter) ||
    p.sku.includes(searchFilter)
  );

  const handleUpdateProduct = (id: string, field: keyof Product, value: string | number) => {
    setLocalProducts(prev =>
      prev.map(p =>
        p.id === id
          ? { ...p, [field]: field === 'recommendedPrice' ? parseFloat(value as string) || 0 : value }
          : p
      )
    );
  };

  const handleDeleteProduct = (id: string) => {
    if (confirm('האם אתה בטוח שברצונך למחוק מוצר זה?')) {
      setLocalProducts(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleAddProduct = () => {
    if (!newProduct.name || !newProduct.barcode || !newProduct.recommendedPrice) {
      alert('נא למלא שם מוצר, ברקוד ומחיר מומלץ');
      return;
    }

    const product: Product = {
      id: crypto.randomUUID(),
      name: newProduct.name || '',
      sku: newProduct.sku || '',
      barcode: newProduct.barcode || '',
      recommendedPrice: newProduct.recommendedPrice || 0,
      category: newProduct.category,
    };

    setLocalProducts(prev => [...prev, product]);
    setNewProduct({
      name: '',
      sku: '',
      barcode: '',
      recommendedPrice: 0,
      category: '',
    });
    setShowAddForm(false);
  };

  const handleSave = async () => {
    // Save to API with replaceAll flag to handle deletions
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: localProducts, replaceAll: true }),
    });

    const result = await response.json();
    if (result.success) {
      onSave(localProducts);
      onClose();
    } else {
      alert(`שגיאה בשמירה: ${result.error}`);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative glass rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in">
        {/* Header */}
        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold gradient-text">עריכת מוצרים</h2>
            <p className="text-[var(--muted)] text-sm mt-1">
              הוסף, ערוך או מחק מוצרים מהרשימה
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors text-2xl"
          >
            ✕
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-[var(--border)] flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="חיפוש מוצר..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full"
            />
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-primary"
          >
            ➕ הוסף מוצר חדש
          </button>
        </div>

        {/* Add new product form */}
        {showAddForm && (
          <div className="p-4 border-b border-[var(--border)] bg-[var(--card)]">
            <h3 className="font-semibold mb-3">מוצר חדש</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input
                type="text"
                placeholder="שם המוצר *"
                value={newProduct.name}
                onChange={(e) => setNewProduct(p => ({ ...p, name: e.target.value }))}
              />
              <input
                type="text"
                placeholder="ברקוד *"
                value={newProduct.barcode}
                onChange={(e) => setNewProduct(p => ({ ...p, barcode: e.target.value }))}
              />
              <input
                type="text"
                placeholder="מק״ט יצרן"
                value={newProduct.sku}
                onChange={(e) => setNewProduct(p => ({ ...p, sku: e.target.value }))}
              />
              <input
                type="number"
                placeholder="מחיר מומלץ *"
                value={newProduct.recommendedPrice || ''}
                onChange={(e) => setNewProduct(p => ({ ...p, recommendedPrice: parseFloat(e.target.value) || 0 }))}
              />
              <div className="flex gap-2">
                <button onClick={handleAddProduct} className="btn-primary flex-1">
                  הוסף
                </button>
                <button 
                  onClick={() => setShowAddForm(false)} 
                  className="btn-secondary"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Products list */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-[var(--card)]">
              <tr>
                <th>שם מוצר</th>
                <th>ברקוד</th>
                <th>מק״ט</th>
                <th>מחיר מומלץ</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td>
                    {editingId === product.id ? (
                      <input
                        type="text"
                        value={product.name}
                        onChange={(e) => handleUpdateProduct(product.id, 'name', e.target.value)}
                        className="w-full"
                      />
                    ) : (
                      <span 
                        className="cursor-pointer hover:text-[var(--primary)]"
                        onClick={() => setEditingId(product.id)}
                      >
                        {product.name}
                      </span>
                    )}
                  </td>
                  <td>
                    {editingId === product.id ? (
                      <input
                        type="text"
                        value={product.barcode}
                        onChange={(e) => handleUpdateProduct(product.id, 'barcode', e.target.value)}
                        className="w-full"
                      />
                    ) : (
                      <code className="text-[var(--muted)]">{product.barcode}</code>
                    )}
                  </td>
                  <td>
                    {editingId === product.id ? (
                      <input
                        type="text"
                        value={product.sku}
                        onChange={(e) => handleUpdateProduct(product.id, 'sku', e.target.value)}
                        className="w-full"
                      />
                    ) : (
                      <span className="text-[var(--muted)]">{product.sku || '-'}</span>
                    )}
                  </td>
                  <td>
                    {editingId === product.id ? (
                      <input
                        type="number"
                        value={product.recommendedPrice}
                        onChange={(e) => handleUpdateProduct(product.id, 'recommendedPrice', e.target.value)}
                        className="w-full"
                      />
                    ) : (
                      <span className="font-medium">{formatPrice(product.recommendedPrice)}</span>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      {editingId === product.id ? (
                        <button
                          onClick={() => setEditingId(null)}
                          className="btn-primary text-sm px-3 py-1"
                        >
                          סיום ✓
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditingId(product.id)}
                          className="btn-secondary text-sm px-3 py-1"
                        >
                          ערוך
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="btn-secondary text-sm px-3 py-1 text-[var(--danger)] hover:bg-[var(--danger)]/10"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-[var(--muted)]">
                    {searchFilter ? 'לא נמצאו מוצרים תואמים' : 'אין מוצרים. הוסף מוצר חדש או ייבא מ-CSV.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] flex justify-between items-center">
          <span className="text-[var(--muted)] text-sm">
            {localProducts.length} מוצרים
            {localProducts.length !== products.length && (
              <span className="text-[var(--warning)] mr-2">
                (שינויים לא נשמרו)
              </span>
            )}
          </span>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">
              ביטול
            </button>
            <button onClick={handleSave} className="btn-primary">
              💾 שמור שינויים
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

