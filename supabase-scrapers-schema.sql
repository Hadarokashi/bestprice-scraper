-- Create scrapers configuration table
CREATE TABLE IF NOT EXISTS scrapers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 5,
  search_pattern TEXT, -- e.g., "/?s={query}" or "/search?q={query}"
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create scraping jobs queue table
CREATE TABLE IF NOT EXISTS scraping_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  barcode TEXT NOT NULL,
  recommended_price NUMERIC,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  total_scrapers INTEGER,
  completed_scrapers INTEGER DEFAULT 0,
  results JSONB DEFAULT '[]',
  website_scans JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE scrapers ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for now)
CREATE POLICY "Allow all operations on scrapers" ON scrapers FOR ALL USING (true);
CREATE POLICY "Allow all operations on scraping_jobs" ON scraping_jobs FOR ALL USING (true);

-- Seed scrapers table with all websites from the CSV
INSERT INTO scrapers (name, base_url, enabled, priority, search_pattern) VALUES
  -- Music stores (high priority - not well covered by Zap)
  ('Bconnect', 'https://bconnect.co.il', true, 10, '/?s={query}'),
  ('Diez', 'https://diez.co.il', true, 10, '/?s={query}'),
  ('Next-Pro', 'https://www.next-pro.co.il', true, 10, '/?s={query}'),
  ('הד סאונד', 'https://headsound.co.il', true, 9, '/?s={query}'),
  ('טרטל', 'https://www.turtle.co.il', true, 9, '/?s={query}'),
  ('עולם המוסיקה', 'https://www.musicworld.co.il', true, 9, '/?s={query}'),
  ('מג''יקל נוטס', 'https://www.magical-notes.co.il', true, 8, '/?s={query}'),
  ('אודיולאב', 'https://audiolab.co.il', true, 8, '/?s={query}'),
  ('לבמה', 'https://la-bama.co.il', true, 8, '/?s={query}'),
  ('מיוזיק סנטר', 'https://www.music-center.co.il', true, 8, '/?s={query}'),
  ('אסקול', 'https://www.askol.co.il', true, 7, '/?s={query}'),
  ('Speed of sound', 'https://www.speedofsound.co.il', true, 7, '/?s={query}'),
  ('Ginges', 'https://www.ginges.co.il', true, 7, '/?s={query}'),
  ('Signal', 'https://www.signal-audio.co.il', true, 7, '/?s={query}'),
  ('Orior', 'https://www.orior.co.il', true, 7, '/?s={query}'),
  ('Kilombo', 'https://kilombo.co.il', true, 6, '/?s={query}'),
  ('FunkyDJ', 'https://www.funkydj.co.il', true, 6, '/?s={query}'),
  ('שלמון', 'https://shalmonmusic.co.il', true, 6, '/?s={query}'),
  ('קול המוסיקה', 'https://kolhamusica.com', true, 6, '/?s={query}'),
  ('חלילית', 'https://www.halilit.com', true, 5, '/?s={query}'),
  ('מצלול', 'https://mitzlol.com', true, 5, '/?s={query}'),
  ('פעימות', 'https://peimot.com', true, 5, '/?s={query}'),
  ('אפקט', 'https://www.effect.co.il', true, 5, '/?s={query}'),
  ('שכטר', 'https://shechtermusic.com', true, 5, '/?s={query}'),
  ('סאונד צ''ק', 'https://www.sound-check.co.il', true, 5, '/?s={query}'),
  ('דראם בית', 'https://www.drumbite.co.il', true, 5, '/?s={query}'),
  
  -- Electronics stores (lower priority - mostly covered by Zap)
  ('Gamestorm', 'https://www.gamestorm.co.il', true, 4, '/?s={query}'),
  ('Flymac', 'https://flymac.website', true, 3, '/?s={query}'),
  ('אילת דיפו', 'https://www.eilatdepot.co.il', true, 3, '/?s={query}'),
  ('לידר קומפיוטרס', 'https://www.leadercomputers.co.il', true, 3, '/?s={query}'),
  ('Wallashops', 'https://www.wallashops.co.il', true, 3, '/?s={query}'),
  ('Olsale', 'https://www.olsale.co.il', true, 3, '/?s={query}'),
  ('LastPrice', 'https://www.lastprice.co.il', true, 3, '/?s={query}'),
  ('Kravitz', 'https://www.kravitz.co.il', true, 3, '/?s={query}'),
  ('HTZone', 'https://www.htzone.co.il', true, 3, '/?s={query}'),
  ('בזק סטור', 'https://bstore.bezeq.co.il', true, 3, '/?s={query}'),
  ('ALM', 'https://www.alm.co.il', true, 3, '/?s={query}'),
  ('ביג אלקטריק', 'https://bigelectric.co.il', true, 2, '/?s={query}'),
  ('בסט מובייל', 'https://www.bestmobile.co.il', true, 2, '/?s={query}'),
  ('חשמל נטו', 'https://www.netoneto.co.il', true, 2, '/?s={query}'),
  ('Shekem', 'https://www.shekem-electric.co.il', true, 2, '/?s={query}'),
  ('ברנרד', 'https://www.bernard.co.il', true, 2, '/?s={query}'),
  ('סנסנטר', 'https://www.sancenter.co.il', true, 2, '/?s={query}'),
  ('i-Cell', 'https://www.i-cell.co.il', true, 2, '/?s={query}'),
  ('Greenmobile', 'https://greenmobile.co.il', true, 2, '/?s={query}'),
  ('ריקוטק', 'https://rikotek.co.il', true, 2, '/?s={query}'),
  ('אורסייל', 'https://orsale.co.il', true, 2, '/?s={query}'),
  ('נירטק', 'https://www.nirtech.co.il', true, 2, '/?s={query}'),
  ('x-press', 'https://www.x-press.co.il', true, 2, '/?s={query}'),
  ('אייס אונליין', 'https://www.ace.co.il', true, 2, '/?s={query}')
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_scrapers_enabled ON scrapers(enabled);
CREATE INDEX IF NOT EXISTS idx_scrapers_priority ON scrapers(priority DESC);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_product_id ON scraping_jobs(product_id);
