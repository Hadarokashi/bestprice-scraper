import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { AppSettings, ApiResponse } from '@/lib/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const DEFAULT_SETTINGS: AppSettings = {
  threshold: 10,
  priceSource: 'zap', // Default to Zap - free, accurate, reliable
};

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function saveSettings(settings: AppSettings): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

// GET /api/settings - Get current settings
export async function GET(): Promise<NextResponse<ApiResponse<AppSettings>>> {
  try {
    const settings = await loadSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/settings - Update settings
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<AppSettings>>> {
  try {
    const body = await request.json();
    const currentSettings = await loadSettings();

    // Validate threshold
    if (body.threshold !== undefined) {
      const threshold = Number(body.threshold);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        return NextResponse.json(
          { success: false, error: 'Threshold must be a number between 0 and 100' },
          { status: 400 }
        );
      }
      currentSettings.threshold = threshold;
    }

    // Validate price source
    if (body.priceSource !== undefined) {
      if (!['serpapi', 'zap', 'manual', 'combined'].includes(body.priceSource)) {
        return NextResponse.json(
          { success: false, error: 'Invalid price source' },
          { status: 400 }
        );
      }
      currentSettings.priceSource = body.priceSource;
    }

    // Update API key (never returned in GET for security)
    if (body.serpApiKey !== undefined) {
      currentSettings.serpApiKey = body.serpApiKey;
    }

    await saveSettings(currentSettings);

    // Return settings without API key
    const safeSettings = { ...currentSettings };
    if (safeSettings.serpApiKey) {
      safeSettings.serpApiKey = '***configured***';
    }

    return NextResponse.json({ success: true, data: safeSettings });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

