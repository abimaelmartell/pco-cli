import { request } from 'undici';
import type { PcoConfig } from './config.js';

export type PcoRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

export class PlanningCenterClient {
  constructor(private readonly config: PcoConfig) {}

  async requestJson<T = unknown>(options: PcoRequestOptions): Promise<T> {
    const url = new URL(options.path, this.config.PCO_BASE_URL);

    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': this.config.PCO_USER_AGENT,
    };

    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    if (this.config.PCO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${this.config.PCO_ACCESS_TOKEN}`;
    } else if (this.config.PCO_APP_ID && this.config.PCO_SECRET) {
      const credentials = Buffer.from(`${this.config.PCO_APP_ID}:${this.config.PCO_SECRET}`).toString('base64');
      headers.Authorization = `Basic ${credentials}`;
    }

    const response = await request(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const payload = await response.body.text();
    const parsed = payload ? JSON.parse(payload) : null;

    if (response.statusCode >= 400) {
      throw new Error(`Planning Center API request failed with ${response.statusCode}: ${payload}`);
    }

    return parsed as T;
  }
}
