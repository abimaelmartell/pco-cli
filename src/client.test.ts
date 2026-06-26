import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from 'undici';
import { PlanningCenterClient } from './client.js';
import type { PcoConfig } from './config.js';

vi.mock('undici', () => ({
  request: vi.fn(),
}));

const requestMock = vi.mocked(request);

const baseConfig: PcoConfig = {
  PCO_BASE_URL: 'https://api.example.test',
  PCO_USER_AGENT: 'pco-cli-test/1.0',
};

describe('PlanningCenterClient', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('sends bearer authenticated JSON requests with query parameters', async () => {
    requestMock.mockResolvedValueOnce({
      statusCode: 200,
      body: { text: async () => JSON.stringify({ data: [{ id: '1' }] }) },
    } as Awaited<ReturnType<typeof request>>);

    const client = new PlanningCenterClient({
      ...baseConfig,
      PCO_ACCESS_TOKEN: 'access-token',
    });

    await expect(client.requestJson({
      path: '/people/v2/people',
      query: { per_page: 1, include_inactive: false, skipped: undefined },
    })).resolves.toEqual({ data: [{ id: '1' }] });

    expect(requestMock).toHaveBeenCalledWith(new URL('https://api.example.test/people/v2/people?per_page=1&include_inactive=false'), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'pco-cli-test/1.0',
        Authorization: 'Bearer access-token',
      },
      body: undefined,
    });
  });

  it('sends basic auth and JSON request bodies when configured', async () => {
    requestMock.mockResolvedValueOnce({
      statusCode: 201,
      body: { text: async () => '' },
    } as Awaited<ReturnType<typeof request>>);

    const client = new PlanningCenterClient({
      ...baseConfig,
      PCO_APP_ID: 'app-id',
      PCO_SECRET: 'secret',
    });

    await expect(client.requestJson({
      method: 'POST',
      path: '/people/v2/people',
      body: { data: { attributes: { first_name: 'Ada' } } },
    })).resolves.toBeNull();

    expect(requestMock).toHaveBeenCalledWith(new URL('https://api.example.test/people/v2/people'), expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: `Basic ${Buffer.from('app-id:secret').toString('base64')}`,
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ data: { attributes: { first_name: 'Ada' } } }),
    }));
  });

  it('throws useful errors for failed API responses', async () => {
    requestMock.mockResolvedValueOnce({
      statusCode: 404,
      body: { text: async () => JSON.stringify({ errors: [{ detail: 'Not Found' }] }) },
    } as Awaited<ReturnType<typeof request>>);

    const client = new PlanningCenterClient(baseConfig);

    await expect(client.requestJson({ path: '/missing' })).rejects.toThrow(
      'Planning Center API request failed with 404',
    );
  });
});
