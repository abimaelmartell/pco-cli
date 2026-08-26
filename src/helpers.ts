import type { PcoJsonApiResource, PcoJsonApiResponse } from './client.js';

export type PlanTimeType = 'service' | 'rehearsal' | 'other';

export type PlanAssignmentInput = {
  person_id: string;
  team_id: string;
  position?: string;
  prepare_notification?: boolean;
};

export function asResourceList(data: PcoJsonApiResponse['data'] | undefined): PcoJsonApiResource[] {
  if (!data) return [];
  return Array.isArray(data) ? data.filter((item): item is PcoJsonApiResource => Boolean(item)) : [data];
}

export function asSingleResource(data: PcoJsonApiResponse['data'] | undefined): PcoJsonApiResource | undefined {
  if (!data) return undefined;
  return Array.isArray(data) ? data[0] : data;
}

export function parsePlanTimeType(value: string): PlanTimeType {
  if (value === 'service' || value === 'rehearsal' || value === 'other') {
    return value;
  }
  throw new Error('--time-type must be one of: service, rehearsal, other');
}

export function matchUniqueSong(response: PcoJsonApiResponse, title: string): PcoJsonApiResource {
  const matches = asResourceList(response.data).filter((song) => {
    const songTitle = song.attributes?.title;
    return typeof songTitle === 'string' && songTitle.toLowerCase() === title.toLowerCase();
  });

  if (matches.length === 0) {
    throw new Error(`No songs found matching "${title}"`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple songs found matching "${title}". Use --song-id to specify exactly which song.`);
  }

  const match = matches[0];
  if (!match) {
    throw new Error(`No songs found matching "${title}"`);
  }
  return match;
}

export function planningCenterUrl(resource: PcoJsonApiResource | undefined): string | undefined {
  const fromAttributes = resource?.attributes?.planning_center_url;
  if (typeof fromAttributes === 'string' && fromAttributes.length > 0) {
    return fromAttributes;
  }
  if (resource?.type === 'Plan' && resource.id) {
    return `https://services.planningcenteronline.com/plans/${resource.id}`;
  }
  return undefined;
}

export function parseIntegerOption(
  value: string,
  name: string,
  bounds?: { min?: number; max?: number },
): number {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${name} must be an integer`);
  }
  const parsed = Number(value);
  if (bounds?.min !== undefined && parsed < bounds.min) {
    throw new Error(`${name} must be >= ${bounds.min}`);
  }
  if (bounds?.max !== undefined && parsed > bounds.max) {
    throw new Error(`${name} must be <= ${bounds.max}`);
  }
  return parsed;
}

export function paginationFromOptions(options: { perPage?: string; offset?: string }): {
  per_page: number;
  offset: number;
} {
  return {
    per_page: parseIntegerOption(options.perPage ?? '25', '--per-page', { min: 1, max: 100 }),
    offset: parseIntegerOption(options.offset ?? '0', '--offset', { min: 0 }),
  };
}

export function parseTeamReminders(raw: string): Record<string, number> {
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--team-reminders must be a JSON object of team id to days (0-7)');
  }

  const reminders: Record<string, number> = {};
  for (const [teamId, days] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > 7) {
      throw new Error(`team_reminders.${teamId} must be an integer between 0 and 7`);
    }
    reminders[teamId] = days;
  }
  return reminders;
}

export function parseAssignments(raw: string): PlanAssignmentInput[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('--assignments must be a JSON array');
  }

  return parsed.map((item, index) => {
    if (item === null || typeof item !== 'object') {
      throw new Error(`--assignments[${index}] must be an object`);
    }
    const record = item as Record<string, unknown>;
    if (typeof record.person_id !== 'string' || typeof record.team_id !== 'string') {
      throw new Error(`--assignments[${index}] requires person_id and team_id strings`);
    }
    if ('position' in record && record.position !== undefined && typeof record.position !== 'string') {
      throw new Error(`--assignments[${index}].position must be a string`);
    }
    if (
      'prepare_notification' in record
      && record.prepare_notification !== undefined
      && typeof record.prepare_notification !== 'boolean'
    ) {
      throw new Error(`--assignments[${index}].prepare_notification must be a boolean`);
    }
    return {
      person_id: record.person_id,
      team_id: record.team_id,
      ...(typeof record.position === 'string' ? { position: record.position } : {}),
      ...(typeof record.prepare_notification === 'boolean'
        ? { prepare_notification: record.prepare_notification }
        : {}),
    };
  });
}

export function notifyStatus(response: PcoJsonApiResponse): Array<Record<string, unknown>> {
  return asResourceList(response.data).map((member) => ({
    id: member.id,
    name: member.attributes?.name ?? null,
    status: member.attributes?.status ?? null,
    team_position_name: member.attributes?.team_position_name ?? null,
    prepare_notification: member.attributes?.prepare_notification ?? null,
    notification_prepared_at: member.attributes?.notification_prepared_at ?? null,
    notification_sent_at: member.attributes?.notification_sent_at ?? null,
    needs_scheduling_email: needsSchedulingEmail(member.attributes),
  }));
}

function needsSchedulingEmail(attributes: Record<string, unknown> | undefined): boolean {
  const status = attributes?.status;
  const unconfirmed = status === 'U' || String(status).toLowerCase() === 'unconfirmed';
  return unconfirmed && attributes?.notification_sent_at == null;
}
