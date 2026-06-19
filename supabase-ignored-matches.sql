-- Ignored matches: user-dismissed incorrect provider results per product
CREATE TABLE IF NOT EXISTS ignored_matches (
  id SERIAL PRIMARY KEY,
  barcode TEXT NOT NULL REFERENCES products(barcode) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  provider_url TEXT NOT NULL DEFAULT '',
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(barcode, provider_name, provider_url)
);

CREATE INDEX IF NOT EXISTS idx_ignored_matches_barcode ON ignored_matches(barcode);

ALTER TABLE ignored_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on ignored_matches" ON ignored_matches FOR ALL USING (true) WITH CHECK (true);
