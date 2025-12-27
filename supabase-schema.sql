-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  barcode TEXT UNIQUE NOT NULL,
  recommended_price DECIMAL(10,2) NOT NULL,
  sale_price DECIMAL(10,2),
  consumer_sale_price DECIMAL(10,2),
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create price_cache table
CREATE TABLE IF NOT EXISTS price_cache (
  id SERIAL PRIMARY KEY,
  barcode TEXT UNIQUE NOT NULL REFERENCES products(barcode) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  recommended_price DECIMAL(10,2) NOT NULL,
  threshold INTEGER NOT NULL DEFAULT 10,
  providers JSONB NOT NULL DEFAULT '[]',
  flagged_providers JSONB NOT NULL DEFAULT '[]',
  last_searched TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  threshold INTEGER NOT NULL DEFAULT 10,
  price_source TEXT NOT NULL DEFAULT 'zap',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (threshold, price_source) VALUES (10, 'zap')
ON CONFLICT DO NOTHING;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_price_cache_barcode ON price_cache(barcode);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (for now, no auth)
CREATE POLICY "Allow all on products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on price_cache" ON price_cache FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on settings" ON settings FOR ALL USING (true) WITH CHECK (true);

