import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('applies safe defaults when optional Planning Center settings are absent', () => {
    expect(loadConfig({})).toEqual({
      PCO_BASE_URL: 'https://api.planningcenteronline.com',
      PCO_USER_AGENT: 'pco-cli/0.1.0',
    });
  });

  it('accepts explicit credential and connection settings', () => {
    expect(loadConfig({
      PCO_ACCESS_TOKEN: 'token',
      PCO_APP_ID: 'app-id',
      PCO_SECRET: 'secret',
      PCO_BASE_URL: 'https://example.test/api',
      PCO_USER_AGENT: 'agent/1.0',
    })).toEqual({
      PCO_ACCESS_TOKEN: 'token',
      PCO_APP_ID: 'app-id',
      PCO_SECRET: 'secret',
      PCO_BASE_URL: 'https://example.test/api',
      PCO_USER_AGENT: 'agent/1.0',
    });
  });

  it('rejects invalid base URLs', () => {
    expect(() => loadConfig({ PCO_BASE_URL: 'not-a-url' })).toThrow();
  });
});
