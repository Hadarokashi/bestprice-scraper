-- Add display_order column to products table for drag-and-drop reordering
ALTER TABLE products ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- Set initial display_order values based on existing order
UPDATE products SET display_order = ROW_NUMBER() OVER (ORDER BY created_at);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_products_display_order ON products(display_order);

-- Ensure all future inserts have a display_order
CREATE OR REPLACE FUNCTION set_display_order()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.display_order IS NULL THEN
    NEW.display_order := (SELECT COALESCE(MAX(display_order), 0) + 1 FROM products);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_set_display_order ON products;
CREATE TRIGGER products_set_display_order
  BEFORE INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION set_display_order();
