import type { ProviderPrice, ScanMetadata } from './types';

const DEFAULT_CLOUD_WORKER_URL = 'https://bestprice-scraper.onrender.com';
const DEFAULT_LOCAL_WORKER_URL = 'http://localhost:3001';

function getConfiguredWorkerUrls(): string[] {
  const explicit = process.env.PLAYWRIGHT_SCRAPER_URL;
  const urls = [
    explicit,
    DEFAULT_CLOUD_WORKER_URL,
    process.env.NODE_ENV === 'development' ? DEFAULT_LOCAL_WORKER_URL : undefined,
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(urls));
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return response.json();
}

export async function resolveHealthyWorkerUrl(): Promise<string | null> {
  for (const baseUrl of getConfiguredWorkerUrls()) {
    try {
      const response = await fetchJsonWithTimeout(`${baseUrl}/health`, {}, 5000);
      if (response?.status === 'ok') {
        return baseUrl;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function startWorkerJob(params: {
  productName: string;
  barcode: string;
  recommendedPrice?: number;
  excludeSites?: string[];
  includeSites?: string[];
}): Promise<{ workerUrl: string; externalJobId: string }> {
  const workerUrl = await resolveHealthyWorkerUrl();

  if (!workerUrl) {
    throw new Error('No Playwright worker is available');
  }

  const response = await fetchJsonWithTimeout(
    `${workerUrl}/scrape`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    },
    15000
  );

  const externalJobId = response?.data?.jobId;
  if (!externalJobId) {
    throw new Error('Worker did not return a jobId');
  }

  return { workerUrl, externalJobId };
}

export async function getWorkerJobStatus(params: {
  workerUrl: string;
  externalJobId: string;
}): Promise<{
  status: string;
  progress: number;
  providers: ProviderPrice[];
  scanMetadata?: ScanMetadata;
}> {
  const response = await fetchJsonWithTimeout(
    `${params.workerUrl}/status/${params.externalJobId}`,
    {},
    15000
  );

  return {
    status: response?.data?.status || 'failed',
    progress: response?.data?.progress || 0,
    providers: response?.data?.providers || [],
    scanMetadata: response?.data?.scanMetadata,
  };
}
