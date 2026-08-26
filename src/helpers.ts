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

const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/;

export function parsePlanTimeType(value: string): PlanTimeType {
  if (value === 'service' || value === 'rehearsal' || value === 'other') {
    return value;
  }
  throw new Error('--time-type must be one of: service, rehearsal, other');
}

export function parseIsoDateTime(value: string, name: string): Date {
  const match = ISO_DATE_TIME.exec(value);
  if (!match) {
    throw new Error(`${name} must be an ISO 8601 datetime with a timezone (for example 2026-08-30T10:00:00Z)`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? '0');
  const offset = match[8];

  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) {
    throw new Error(`${name} must be a valid ISO 8601 datetime`);
  }

  if (offset && offset !== 'Z') {
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      throw new Error(`${name} must be a valid ISO 8601 datetime`);
    }
  }

  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    calendar.getUTCFullYear() !== year
    || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day
  ) {
    throw new Error(`${name} must be a valid ISO 8601 datetime`);
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be a valid ISO 8601 datetime`);
  }
  return new Date(parsed);
}

export function parsePlanTimeWindow(options: { startsAt: string; endsAt?: string }): {
  startsAt: string;
  endsAt?: string;
};
export function parsePlanTimeWindow(options: { startsAt?: string; endsAt?: string }): {
  startsAt?: string;
  endsAt?: string;
};
export function parsePlanTimeWindow(options: { startsAt?: string; endsAt?: string }): {
  startsAt?: string;
  endsAt?: string;
} {
  if (options.endsAt && !options.startsAt) {
    throw new Error('--ends-at requires --starts-at');
  }
  if (!options.startsAt) {
    return {};
  }

  const start = parseIsoDateTime(options.startsAt, '--starts-at');
  if (!options.endsAt) {
    return { startsAt: options.startsAt };
  }

  const end = parseIsoDateTime(options.endsAt, '--ends-at');
  if (end.getTime() <= start.getTime()) {
    throw new Error('--ends-at must be after --starts-at');
  }
  return { startsAt: options.startsAt, endsAt: options.endsAt };
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
  if (!Number.isSafeInteger(parsed) || String(parsed) !== value) {
    throw new Error(`${name} must be a safe integer`);
  }
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
