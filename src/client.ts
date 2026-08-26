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

export class PlanningCenterApiError extends Error implements PcoApiError {
  readonly ok = false as const;
  readonly status: number;
  readonly errors?: Array<{ detail?: string; title?: string }>;

  constructor(options: { status: number; message: string; errors?: Array<{ detail?: string; title?: string }> }) {
    super(options.message);
    this.name = 'PlanningCenterApiError';
    this.status = options.status;
    if (options.errors) this.errors = options.errors;
  }

  toJSON(): PcoApiError {
    return {
      ok: false,
      status: this.status,
      message: this.message,
      ...(this.errors ? { errors: this.errors } : {}),
    };
  }
}

export class PartialWorkflowError extends Error {
  readonly ok = false as const;
  readonly partial: Record<string, unknown>;

  constructor(message: string, partial: Record<string, unknown>) {
    super(message);
    this.name = 'PartialWorkflowError';
    this.partial = partial;
  }

  toJSON(): { ok: false; error: string; partial: Record<string, unknown> } {
    return { ok: false, error: this.message, partial: this.partial };
  }
}

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

    return this.requestAtUrl<T>(url, options.method ?? 'GET', options.body);
  }

  async collectCollection(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    options?: { maxPages?: number },
  ): Promise<PcoJsonApiResponse> {
    const data: PcoJsonApiResource[] = [];
    let page = await this.requestJson<PcoJsonApiResponse>({ path, query: query ?? {} });
    const apiOrigin = new URL(this.config.PCO_BASE_URL).origin;
    const maxPages = options?.maxPages ?? 100;
    let pagesRead = 0;

    while (true) {
      if (Array.isArray(page.data)) {
        data.push(...page.data);
      } else if (page.data) {
        data.push(page.data);
      }
      pagesRead += 1;

      const next = page.links?.next;
      if (!next) break;
      if (pagesRead >= maxPages) {
        throw new Error(`Exceeded ${maxPages} pages while collecting results; refine the query`);
      }

      const nextUrl = new URL(next, this.config.PCO_BASE_URL);
      if (nextUrl.origin !== apiOrigin) {
        throw new Error('Refusing to follow pagination link off the Planning Center API host');
      }
      page = await this.requestAtUrl<PcoJsonApiResponse>(nextUrl, 'GET');
    }

    return { data };
  }

  private async requestAtUrl<T>(url: URL, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': this.config.PCO_USER_AGENT,
    };

    if (body !== undefined) headers['Content-Type'] = 'application/json';

    if (this.config.PCO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${this.config.PCO_ACCESS_TOKEN}`;
    } else if (this.config.PCO_APP_ID && this.config.PCO_SECRET) {
      const credentials = Buffer.from(`${this.config.PCO_APP_ID}:${this.config.PCO_SECRET}`).toString('base64');
      headers.Authorization = `Basic ${credentials}`;
    }

    const requestOptions = {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };

    const response = await request(url, requestOptions);

    const payload = await response.body.text();
    let parsed: unknown = null;
    if (payload) {
      try {
        parsed = JSON.parse(payload);
      } catch {
        if (response.statusCode < 400) {
          throw new Error(`Planning Center API returned non-JSON (${response.statusCode})`);
        }
      }
    }

    if (response.statusCode >= 400) {
      const errors = Array.isArray((parsed as { errors?: unknown } | null)?.errors)
        ? (parsed as { errors: Array<{ detail?: string; title?: string }> }).errors
        : undefined;
      throw new PlanningCenterApiError({
        status: response.statusCode,
        message: errors?.[0]?.detail ?? errors?.[0]?.title ?? `Planning Center API request failed with ${response.statusCode}`,
        ...(errors ? { errors } : {}),
      });
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
      query: { 'where[title]': searchQuery, ...(query ?? {}) },
    });
  }

  async searchAllSongs(searchQuery: string): Promise<PcoJsonApiResponse> {
    return this.collectCollection('/services/v2/songs', {
      'where[title]': searchQuery,
      per_page: 100,
    });
  }

  async searchPeople(searchQuery: string, query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      path: '/people/v2/people',
      query: { 'where[search_name]': searchQuery, ...(query ?? {}) },
    });
  }

  async listTeams(serviceTypeId: string, query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({ 
      path: `/services/v2/service_types/${serviceTypeId}/teams`, 
      query: query ?? {}
    });
  }

  async listTeamPositions(teamId: string, query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      path: `/services/v2/teams/${teamId}/team_positions`,
      query: query ?? {},
    });
  }

  async listPlans(serviceTypeId: string, query?: { per_page?: number; offset?: number; filter?: string; order?: string }): Promise<PcoJsonApiResponse> {
    return this.requestJson({ 
      path: `/services/v2/service_types/${serviceTypeId}/plans`, 
      query: query ?? {}
    });
  }

  async getPlan(serviceTypeId: string, planId: string, query?: { include?: string }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      path: `/services/v2/service_types/${serviceTypeId}/plans/${planId}`,
      query: { include: 'plan_times', ...(query ?? {}) },
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

  async listPlanTimes(serviceTypeId: string, planId: string, query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      path: `/services/v2/service_types/${serviceTypeId}/plans/${planId}/plan_times`,
      query: query ?? {},
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

  async listAllPlanTeamMembers(serviceTypeId: string, planId: string): Promise<PcoJsonApiResponse> {
    return this.collectCollection(
      `/services/v2/service_types/${serviceTypeId}/plans/${planId}/team_members`,
      { per_page: 100 },
    );
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
      body: { data: { type: 'PlanPerson', attributes } }
    });
  }

  async updatePlanTime(serviceTypeId: string, planTimeId: string, attributes: {
    team_reminders?: Record<string, number>;
  }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      method: 'PATCH',
      path: `/services/v2/service_types/${serviceTypeId}/plan_times/${planTimeId}`,
      body: { data: { type: 'PlanTime', id: planTimeId, attributes } }
    });
  }

  async getSong(songId: string): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      path: `/services/v2/songs/${songId}`,
    });
  }

  async createSong(attributes: {
    title: string;
    admin?: string;
    author?: string;
    copyright?: string;
    ccli_number?: number;
    hidden?: boolean;
    themes?: string;
  }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      method: 'POST',
      path: '/services/v2/songs',
      body: { data: { type: 'Song', attributes } },
    });
  }

  async updateSong(songId: string, attributes: {
    title?: string;
    admin?: string;
    author?: string;
    copyright?: string;
    ccli_number?: number;
    hidden?: boolean;
    themes?: string;
  }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      method: 'PATCH',
      path: `/services/v2/songs/${songId}`,
      body: { data: { type: 'Song', id: songId, attributes } },
    });
  }

  async listSongTags(songId: string, query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      path: `/services/v2/songs/${songId}/tags`,
      query: query ?? {},
    });
  }

  async assignSongTags(songId: string, tagIds: string[]): Promise<null> {
    return this.requestJson({
      method: 'POST',
      path: `/services/v2/songs/${songId}/assign_tags`,
      body: tagAssignmentBody(tagIds),
    });
  }

  async listArrangements(songId: string, query?: { per_page?: number; offset?: number; include?: string }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      path: `/services/v2/songs/${songId}/arrangements`,
      query: query ?? {},
    });
  }

  async getArrangement(songId: string, arrangementId: string, query?: { include?: string }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      path: `/services/v2/songs/${songId}/arrangements/${arrangementId}`,
      query: query ?? {},
    });
  }

  async createArrangement(songId: string, attributes: ArrangementAttributes): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      method: 'POST',
      path: `/services/v2/songs/${songId}/arrangements`,
      body: { data: { type: 'Arrangement', attributes } },
    });
  }

  async updateArrangement(songId: string, arrangementId: string, attributes: ArrangementAttributes): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      method: 'PATCH',
      path: `/services/v2/songs/${songId}/arrangements/${arrangementId}`,
      body: { data: { type: 'Arrangement', id: arrangementId, attributes } },
    });
  }

  async listArrangementTags(songId: string, arrangementId: string, query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      path: `/services/v2/songs/${songId}/arrangements/${arrangementId}/tags`,
      query: query ?? {},
    });
  }

  async assignArrangementTags(songId: string, arrangementId: string, tagIds: string[]): Promise<null> {
    return this.requestJson({
      method: 'POST',
      path: `/services/v2/songs/${songId}/arrangements/${arrangementId}/assign_tags`,
      body: tagAssignmentBody(tagIds),
    });
  }

  async listKeys(songId: string, arrangementId: string, query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      path: `/services/v2/songs/${songId}/arrangements/${arrangementId}/keys`,
      query: query ?? {},
    });
  }

  async getKey(songId: string, arrangementId: string, keyId: string): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      path: `/services/v2/songs/${songId}/arrangements/${arrangementId}/keys/${keyId}`,
    });
  }

  async createKey(songId: string, arrangementId: string, attributes: KeyAttributes): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      method: 'POST',
      path: `/services/v2/songs/${songId}/arrangements/${arrangementId}/keys`,
      body: { data: { type: 'Key', attributes } },
    });
  }

  async updateKey(songId: string, arrangementId: string, keyId: string, attributes: KeyAttributes): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      method: 'PATCH',
      path: `/services/v2/songs/${songId}/arrangements/${arrangementId}/keys/${keyId}`,
      body: { data: { type: 'Key', id: keyId, attributes } },
    });
  }

  async listTagGroups(query?: { per_page?: number; offset?: number; 'where[tags_for]'?: string; include?: string }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      path: '/services/v2/tag_groups',
      query: query ?? {},
    });
  }

  async listTagGroupTags(tagGroupId: string, query?: { per_page?: number; offset?: number }): Promise<PcoJsonApiResponse> {
    return this.requestJson({
      path: `/services/v2/tag_groups/${tagGroupId}/tags`,
      query: query ?? {},
    });
  }
}

export type ArrangementAttributes = {
  name?: string;
  bpm?: number;
  chord_chart?: string;
  length?: number;
  lyrics_enabled?: boolean;
  meter?: string;
  notes?: string;
  sequence?: string[];
};

export type KeyAttributes = {
  starting_key?: string;
  ending_key?: string;
  name?: string;
  alternate_keys?: Array<{ name: string; key: string }>;
};

function tagAssignmentBody(tagIds: string[]) {
  return {
    data: {
      type: 'TagAssignment',
      attributes: {},
      relationships: {
        tags: {
          data: tagIds.map((id) => ({ type: 'Tag', id })),
        },
      },
    },
  };
}
