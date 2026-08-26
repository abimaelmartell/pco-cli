import { request } from 'undici';
import type { PcoConfig } from './config.js';

export type PcoRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

export type PcoApiError = {
  ok: false;
  status: number;
  errors?: Array<{ detail?: string; title?: string }>;
  message: string;
};

export type PcoJsonApiResource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
  links?: Record<string, string>;
};

export type PcoJsonApiResponse<T = PcoJsonApiResource> = {
  data: T | T[];
  included?: PcoJsonApiResource[];
  links?: Record<string, string>;
  meta?: Record<string, unknown>;
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

    const requestOptions = {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    };

    const response = await request(url, requestOptions);

    const payload = await response.body.text();
    const parsed = payload ? JSON.parse(payload) : null;

    if (response.statusCode >= 400) {
      const error: PcoApiError = {
        ok: false,
        status: response.statusCode,
        errors: parsed?.errors,
        message: parsed?.errors?.[0]?.detail ?? `Planning Center API request failed with ${response.statusCode}`,
      };
      throw error;
    }

    return parsed as T;
  }

  // Services API helper methods

  async listServiceTypes(query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({ path: '/services/v2/service_types', query: query ?? {} });
  }

  async searchSongs(searchQuery: string, query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({ 
      path: '/services/v2/songs', 
      query: { where: searchQuery, ...(query ?? {}) } 
    });
  }

  async searchPeople(searchQuery: string, query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({ 
      path: '/people/v2/people', 
      query: { where: searchQuery, ...(query ?? {}) } 
    });
  }

  async listTeams(serviceTypeId: string, query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({ 
      path: `/services/v2/service_types/${serviceTypeId}/teams`, 
      query: query ?? {}
    });
  }

  async listTeamPositions(serviceTypeId: string, teamId: string, query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({ 
      path: `/services/v2/service_types/${serviceTypeId}/teams/${teamId}/team_positions`, 
      query: query ?? {}
    });
  }

  async listPlans(serviceTypeId: string, query?: { per_page?: number; offset?: number; filter?: string; order?: string }): Promise<PcoJsonApiResponse> {
    return this.requestJson({ 
      path: `/services/v2/service_types/${serviceTypeId}/plans`, 
      query: query ?? {}
    });
  }

  async getPlan(serviceTypeId: string, planId: string): Promise<PcoJsonApiResponse> {
    return this.requestJson({ 
      path: `/services/v2/service_types/${serviceTypeId}/plans/${planId}` 
    });
  }

  async createPlan(serviceTypeId: string, attributes: { 
    title?: string; 
    series_title?: string; 
    public?: boolean;
  }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      method: 'POST',
      path: `/services/v2/service_types/${serviceTypeId}/plans`,
      body: { data: { type: 'Plan', attributes } }
    });
  }

  async createPlanTime(serviceTypeId: string, planId: string, attributes: {
    starts_at: string;
    ends_at?: string;
    time_type?: 'service' | 'rehearsal' | 'other';
    name?: string;
    team_reminders?: Record<string, number>;
  }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      method: 'POST',
      path: `/services/v2/service_types/${serviceTypeId}/plans/${planId}/plan_times`,
      body: { data: { type: 'PlanTime', attributes } }
    });
  }

  async listPlanItems(serviceTypeId: string, planId: string, query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({ 
      path: `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items`, 
      query: query ?? {}
    });
  }

  async createPlanItem(serviceTypeId: string, planId: string, attributes: {
    song_id?: string;
    arrangement_id?: string;
    key_id?: string;
    title?: string;
    sequence?: number;
    service_position?: string;
  }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      method: 'POST',
      path: `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items`,
      body: { data: { type: 'Item', attributes } }
    });
  }

  async listPlanTeamMembers(serviceTypeId: string, planId: string, query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({ 
      path: `/services/v2/service_types/${serviceTypeId}/plans/${planId}/team_members`, 
      query: query ?? {}
    });
  }

  async createPlanTeamMember(serviceTypeId: string, planId: string, attributes: {
    person_id: string;
    team_id: string;
    team_position_name?: string;
    prepare_notification?: boolean;
  }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      method: 'POST',
      path: `/services/v2/service_types/${serviceTypeId}/plans/${planId}/team_members`,
      body: { data: { type: 'TeamMember', attributes } }
    });
  }

  async updatePlanTime(serviceTypeId: string, planId: string, planTimeId: string, attributes: {
    team_reminders?: Record<string, number>;
  }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      method: 'PATCH',
      path: `/services/v2/service_types/${serviceTypeId}/plans/${planId}/plan_times/${planTimeId}`,
      body: { data: { type: 'PlanTime', id: planTimeId, attributes } }
    });
  }

  async getSong(songId: string): Promise<PcoJsonApiResponse> {
    return this.requestJson({ 
      path: `/services/v2/songs/${songId}` 
    });
  }
}
