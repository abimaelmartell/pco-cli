import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from 'undici';
import { PlanningCenterApiError, PlanningCenterClient } from './client.js';
import { loadConfig } from './config.js';
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

  it('sends basic auth when PCO_CLIENT_ID and PCO_SECRET are loaded from the environment', async () => {
    requestMock.mockResolvedValueOnce({
      statusCode: 200,
      body: { text: async () => JSON.stringify({ data: [] }) },
    } as Awaited<ReturnType<typeof request>>);

    const client = new PlanningCenterClient(loadConfig({
      ...baseConfig,
      PCO_CLIENT_ID: 'client-id',
      PCO_SECRET: 'secret',
    }));

    await client.requestJson({ path: '/services/v2/service_types' });

    expect(requestMock).toHaveBeenCalledWith(
      new URL('https://api.example.test/services/v2/service_types'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('client-id:secret').toString('base64')}`,
        }),
      }),
    );
  });

  it('throws structured errors for failed API responses', async () => {
    requestMock.mockResolvedValueOnce({
      statusCode: 404,
      body: { text: async () => JSON.stringify({ errors: [{ detail: 'Resource not found', title: 'Not Found' }] }) },
    } as Awaited<ReturnType<typeof request>>);

    const client = new PlanningCenterClient(baseConfig);
    const error = await client.requestJson({ path: '/missing' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PlanningCenterApiError);
    expect(error).toMatchObject({
      ok: false,
      status: 404,
      message: 'Resource not found',
      errors: [{ detail: 'Resource not found', title: 'Not Found' }],
    });
  });

  it('uses the error title when detail is missing', async () => {
    requestMock.mockResolvedValueOnce({
      statusCode: 422,
      body: { text: async () => JSON.stringify({ errors: [{ title: 'Unprocessable Entity' }] }) },
    } as Awaited<ReturnType<typeof request>>);

    const client = new PlanningCenterClient(baseConfig);
    await expect(client.requestJson({ path: '/invalid' })).rejects.toMatchObject({
      status: 422,
      message: 'Unprocessable Entity',
    });
  });

  it('keeps HTTP status when an error body is not JSON', async () => {
    requestMock.mockResolvedValueOnce({
      statusCode: 502,
      body: { text: async () => '<html>bad gateway</html>' },
    } as Awaited<ReturnType<typeof request>>);

    const client = new PlanningCenterClient(baseConfig);

    await expect(client.requestJson({ path: '/oops' })).rejects.toMatchObject({
      name: 'PlanningCenterApiError',
      ok: false,
      status: 502,
      message: 'Planning Center API request failed with 502',
    });
  });

  describe('Services API methods', () => {
    it('lists service types with pagination', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 200,
        body: { text: async () => JSON.stringify({ data: [{ id: '1', type: 'ServiceType' }] }) },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      const result = await client.listServiceTypes({ per_page: 10, offset: 0 });

      expect(result).toEqual({ data: [{ id: '1', type: 'ServiceType' }] });
      expect(requestMock).toHaveBeenCalledWith(
        new URL('https://api.example.test/services/v2/service_types?per_page=10&offset=0'),
        expect.any(Object)
      );
    });

    it('searches songs by title', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 200,
        body: { text: async () => JSON.stringify({ data: [{ id: '1', type: 'Song', attributes: { title: 'Amazing Grace' } }] }) },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      const result = await client.searchSongs('Amazing Grace');

      expect(result.data).toEqual([{ id: '1', type: 'Song', attributes: { title: 'Amazing Grace' } }]);
      const expectedUrl = new URL('https://api.example.test/services/v2/songs');
      expectedUrl.searchParams.set('where[title]', 'Amazing Grace');
      expect(requestMock).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    });

    it('follows pagination links when collecting every song match', async () => {
      requestMock
        .mockResolvedValueOnce({
          statusCode: 200,
          body: {
            text: async () => JSON.stringify({
              data: [{ id: '1', type: 'Song', attributes: { title: 'Holy' } }],
              links: { next: 'https://api.example.test/services/v2/songs?offset=100' },
            }),
          },
        } as Awaited<ReturnType<typeof request>>)
        .mockResolvedValueOnce({
          statusCode: 200,
          body: {
            text: async () => JSON.stringify({
              data: [{ id: '2', type: 'Song', attributes: { title: 'Holy' } }],
            }),
          },
        } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      const result = await client.searchAllSongs('Holy');

      expect(result.data).toEqual([
        { id: '1', type: 'Song', attributes: { title: 'Holy' } },
        { id: '2', type: 'Song', attributes: { title: 'Holy' } },
      ]);
      expect(requestMock).toHaveBeenCalledTimes(2);
    });

    it('errors instead of silently truncating when pagination exceeds the safety limit', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 200,
        body: {
          text: async () => JSON.stringify({
            data: [{ id: '1', type: 'Song' }],
            links: { next: 'https://api.example.test/services/v2/songs?offset=100' },
          }),
        },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      await expect(client.collectCollection('/services/v2/songs', {}, { maxPages: 1 }))
        .rejects.toThrow('Exceeded 1 pages while collecting results');
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it('searches people by search_name', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 200,
        body: { text: async () => JSON.stringify({ data: [{ id: '9', type: 'Person' }] }) },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      await client.searchPeople('Ada Lovelace');

      const expectedUrl = new URL('https://api.example.test/people/v2/people');
      expectedUrl.searchParams.set('where[search_name]', 'Ada Lovelace');
      expect(requestMock).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    });

    it('creates a plan with attributes', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 201,
        body: { text: async () => JSON.stringify({ data: { id: '123', type: 'Plan', attributes: { title: 'Sunday Service' } } }) },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      const result = await client.createPlan('1', { title: 'Sunday Service', public: true });

      expect(result.data).toMatchObject({ id: '123', type: 'Plan' });
      expect(requestMock).toHaveBeenCalledWith(
        new URL('https://api.example.test/services/v2/service_types/1/plans'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ data: { type: 'Plan', attributes: { title: 'Sunday Service', public: true } } }),
        })
      );
    });

    it('creates a plan time with team reminders', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 201,
        body: { text: async () => JSON.stringify({ data: { id: '456', type: 'PlanTime' } }) },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      const result = await client.createPlanTime('1', '123', {
        starts_at: '2026-08-30T10:00:00Z',
        time_type: 'service',
        team_reminders: { '10': 7, '11': 3 },
      });

      expect(result.data).toMatchObject({ id: '456', type: 'PlanTime' });
      expect(requestMock).toHaveBeenCalledWith(
        new URL('https://api.example.test/services/v2/service_types/1/plans/123/plan_times'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            data: {
              type: 'PlanTime',
              attributes: {
                starts_at: '2026-08-30T10:00:00Z',
                time_type: 'service',
                team_reminders: { '10': 7, '11': 3 },
              },
            },
          }),
        })
      );
    });

    it('creates a plan item with a song', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 201,
        body: { text: async () => JSON.stringify({ data: { id: '789', type: 'Item' } }) },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      const result = await client.createPlanItem('1', '123', { song_id: '42' });

      expect(result.data).toMatchObject({ id: '789', type: 'Item' });
      expect(requestMock).toHaveBeenCalledWith(
        new URL('https://api.example.test/services/v2/service_types/1/plans/123/items'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ data: { type: 'Item', attributes: { song_id: '42' } } }),
        })
      );
    });

    it('assigns a team member to a plan', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 201,
        body: { text: async () => JSON.stringify({ data: { id: '999', type: 'TeamMember' } }) },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      const result = await client.createPlanTeamMember('1', '123', {
        person_id: '50',
        team_id: '10',
        team_position_name: 'Worship Leader',
      });

      expect(result.data).toMatchObject({ id: '999', type: 'TeamMember' });
      expect(requestMock).toHaveBeenCalledWith(
        new URL('https://api.example.test/services/v2/service_types/1/plans/123/team_members'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            data: {
              type: 'PlanPerson',
              attributes: {
                person_id: '50',
                team_id: '10',
                team_position_name: 'Worship Leader',
              },
            },
          }),
        })
      );
    });

    it('updates plan time team reminders', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 200,
        body: { text: async () => JSON.stringify({ data: { id: '456', type: 'PlanTime' } }) },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      const result = await client.updatePlanTime('1', '456', {
        team_reminders: { '10': 5 },
      });

      expect(result.data).toMatchObject({ id: '456', type: 'PlanTime' });
      expect(requestMock).toHaveBeenCalledWith(
        new URL('https://api.example.test/services/v2/service_types/1/plan_times/456'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            data: {
              type: 'PlanTime',
              id: '456',
              attributes: { team_reminders: { '10': 5 } },
            },
          }),
        })
      );
    });

    it('lists teams for a service type', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 200,
        body: { text: async () => JSON.stringify({ data: [{ id: '10', type: 'Team', attributes: { name: 'Worship Team' } }] }) },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      const result = await client.listTeams('1');

      expect(result.data).toEqual([{ id: '10', type: 'Team', attributes: { name: 'Worship Team' } }]);
      expect(requestMock).toHaveBeenCalledWith(
        new URL('https://api.example.test/services/v2/service_types/1/teams'),
        expect.any(Object)
      );
    });

    it('lists plans with filter, order, and pagination', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 200,
        body: { text: async () => JSON.stringify({ data: [{ id: '77', type: 'Plan' }] }) },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      await client.listPlans('1', { per_page: 10, offset: 0, filter: 'future', order: 'sort_date' });

      const expectedUrl = new URL('https://api.example.test/services/v2/service_types/1/plans');
      expectedUrl.searchParams.set('per_page', '10');
      expectedUrl.searchParams.set('offset', '0');
      expectedUrl.searchParams.set('filter', 'future');
      expectedUrl.searchParams.set('order', 'sort_date');
      expect(requestMock).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    });

    it('gets a plan including its plan times', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 200,
        body: { text: async () => JSON.stringify({ data: { id: '123', type: 'Plan' } }) },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      await client.getPlan('1', '123');

      expect(requestMock).toHaveBeenCalledWith(
        new URL('https://api.example.test/services/v2/service_types/1/plans/123?include=plan_times'),
        expect.any(Object),
      );
    });

    it('lists plan times for a plan', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 200,
        body: { text: async () => JSON.stringify({ data: [{ id: '456', type: 'PlanTime' }] }) },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      await client.listPlanTimes('1', '123');

      expect(requestMock).toHaveBeenCalledWith(
        new URL('https://api.example.test/services/v2/service_types/1/plans/123/plan_times'),
        expect.any(Object),
      );
    });

    it('lists team positions from the team nested route', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 200,
        body: { text: async () => JSON.stringify({ data: [{ id: '3', type: 'TeamPosition' }] }) },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      await client.listTeamPositions('10');

      expect(requestMock).toHaveBeenCalledWith(
        new URL('https://api.example.test/services/v2/teams/10/team_positions'),
        expect.any(Object)
      );
    });

    it('lists plan team members', async () => {
      requestMock.mockResolvedValueOnce({
        statusCode: 200,
        body: { text: async () => JSON.stringify({ data: [] }) },
      } as Awaited<ReturnType<typeof request>>);

      const client = new PlanningCenterClient(baseConfig);
      const result = await client.listPlanTeamMembers('1', '123');

      expect(result.data).toEqual([]);
      expect(requestMock).toHaveBeenCalledWith(
        new URL('https://api.example.test/services/v2/service_types/1/plans/123/team_members'),
        expect.any(Object)
      );
    });
  });
});
