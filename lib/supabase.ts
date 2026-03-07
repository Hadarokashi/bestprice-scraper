import { createClient } from '@supabase/supabase-js';
import type { ScanMetadata } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Database types
export interface DbProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  recommended_price: number;
  sale_price?: number;
  consumer_sale_price?: number;
  category?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbPriceCache {
  id?: number;
  barcode: string;
  product_id: string;
  recommended_price: number;
  threshold: number;
  providers: ProviderData[];
  flagged_providers: ProviderData[];
  scan_metadata?: ScanMetadata;
  last_searched: string;
  error?: string;
}

export interface ProviderData {
  providerName: string;
  providerUrl: string;
  price: number;
  currency: string;
  lastUpdated: string;
  source: string;
}

export interface DbSettings {
  id?: number;
  threshold: number;
  price_source: string;
  scan_policy?: Record<string, unknown>;
  updated_at?: string;
}


