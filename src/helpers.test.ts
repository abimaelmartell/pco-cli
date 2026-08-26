import { describe, expect, it } from 'vitest';
import {
  matchUniqueSong,
  notifyStatus,
  parseAlternateKeys,
  parseAssignments,
  parseBooleanOption,
  parseIntegerOption,
  parseIsoDateTime,
  parseMusicalKey,
  parsePlanTimeType,
  parsePlanTimeWindow,
  parseTagIds,
  parseTeamReminders,
  planningCenterUrl,
} from './helpers.js';

describe('parsePlanTimeType', () => {
  it('accepts documented PlanTime values', () => {
    expect(parsePlanTimeType('service')).toBe('service');
    expect(parsePlanTimeType('rehearsal')).toBe('rehearsal');
    expect(parsePlanTimeType('other')).toBe('other');
  });

  it('rejects unsupported values', () => {
    expect(() => parsePlanTimeType('soundcheck')).toThrow('--time-type must be one of: service, rehearsal, other');
  });
});

describe('parseIsoDateTime', () => {
  it('accepts ISO 8601 datetimes with a timezone', () => {
    expect(parseIsoDateTime('2026-08-30T10:00:00Z', '--starts-at').toISOString())
      .toBe('2026-08-30T10:00:00.000Z');
    expect(parseIsoDateTime('2026-08-30T10:00:00-05:00', '--starts-at').toISOString())
      .toBe('2026-08-30T15:00:00.000Z');
    expect(parseIsoDateTime('2026-08-30T10:00Z', '--starts-at').toISOString())
      .toBe('2026-08-30T10:00:00.000Z');
  });

  it('rejects missing timezones, invalid calendars, and non-ISO values', () => {
    expect(() => parseIsoDateTime('nope', '--starts-at'))
      .toThrow('--starts-at must be an ISO 8601 datetime with a timezone');
    expect(() => parseIsoDateTime('2026-08-30T10:00:00', '--starts-at'))
      .toThrow('--starts-at must be an ISO 8601 datetime with a timezone');
    expect(() => parseIsoDateTime('2026-02-30T10:00:00Z', '--ends-at'))
      .toThrow('--ends-at must be a valid ISO 8601 datetime');
    expect(() => parseIsoDateTime('2026-08-30T24:00:00Z', '--starts-at'))
      .toThrow('--starts-at must be a valid ISO 8601 datetime');
  });
});

describe('parsePlanTimeWindow', () => {
  it('returns a validated start and optional end', () => {
    expect(parsePlanTimeWindow({
      startsAt: '2026-08-30T10:00:00Z',
      endsAt: '2026-08-30T11:30:00Z',
    })).toEqual({
      startsAt: '2026-08-30T10:00:00Z',
      endsAt: '2026-08-30T11:30:00Z',
    });
  });

  it('rejects --ends-at without --starts-at', () => {
    expect(() => parsePlanTimeWindow({ endsAt: '2026-08-30T11:30:00Z' }))
      .toThrow('--ends-at requires --starts-at');
  });

  it('rejects an end time that is not after the start time', () => {
    expect(() => parsePlanTimeWindow({
      startsAt: '2026-08-30T11:30:00Z',
      endsAt: '2026-08-30T10:00:00Z',
    })).toThrow('--ends-at must be after --starts-at');
    expect(() => parsePlanTimeWindow({
      startsAt: '2026-08-30T10:00:00Z',
      endsAt: '2026-08-30T10:00:00Z',
    })).toThrow('--ends-at must be after --starts-at');
  });
});

describe('parseIntegerOption', () => {
  it('accepts whole integers', () => {
    expect(parseIntegerOption('3', '--sequence')).toBe(3);
    expect(parseIntegerOption('0', '--offset', { min: 0 })).toBe(0);
  });

  it('rejects truncated or non-numeric values', () => {
    expect(() => parseIntegerOption('3.7', '--sequence')).toThrow('--sequence must be an integer');
    expect(() => parseIntegerOption('2x', '--per-page')).toThrow('--per-page must be an integer');
    expect(() => parseIntegerOption('101', '--per-page', { min: 1, max: 100 })).toThrow('--per-page must be <= 100');
    expect(() => parseIntegerOption('9007199254740993', '--sequence')).toThrow('--sequence must be a safe integer');
  });
});

describe('parseBooleanOption', () => {
  it('accepts true/false and 1/0', () => {
    expect(parseBooleanOption('true', '--hidden')).toBe(true);
    expect(parseBooleanOption('FALSE', '--hidden')).toBe(false);
    expect(parseBooleanOption('1', '--hidden')).toBe(true);
    expect(parseBooleanOption('0', '--hidden')).toBe(false);
  });

  it('rejects other values', () => {
    expect(() => parseBooleanOption('yes', '--hidden')).toThrow('--hidden must be true or false');
  });
});

describe('parseMusicalKey', () => {
  it('accepts documented starting keys including minor', () => {
    expect(parseMusicalKey('C', '--starting-key')).toBe('C');
    expect(parseMusicalKey('F#', '--starting-key')).toBe('F#');
    expect(parseMusicalKey('Cm', '--starting-key')).toBe('Cm');
  });

  it('rejects unknown keys', () => {
    expect(() => parseMusicalKey('H', '--starting-key')).toThrow('--starting-key must be a Planning Center key');
  });
});

describe('parseTagIds', () => {
  it('parses a comma-separated list and treats blank as an empty replace set', () => {
    expect(parseTagIds('5, 9')).toEqual(['5', '9']);
    expect(parseTagIds('')).toEqual([]);
  });

  it('rejects empty tokens', () => {
    expect(() => parseTagIds('5,,9')).toThrow('--tag-ids must be a comma-separated list of tag IDs');
  });
});

describe('parseAlternateKeys', () => {
  it('parses name/key objects', () => {
    expect(parseAlternateKeys('[{"name":"Capo 3","key":"A"}]')).toEqual([
      { name: 'Capo 3', key: 'A' },
    ]);
  });
});

describe('matchUniqueSong', () => {
  it('returns the exact title match', () => {
    expect(matchUniqueSong({
      data: [
        { id: '1', type: 'Song', attributes: { title: 'Amazing Grace' } },
        { id: '2', type: 'Song', attributes: { title: 'Amazing' } },
      ],
    }, 'Amazing Grace')).toMatchObject({ id: '1' });
  });

  it('fails when no title matches', () => {
    expect(() => matchUniqueSong({ data: [] }, 'Oceans')).toThrow('No songs found matching "Oceans"');
  });

  it('fails when more than one song has the same title', () => {
    expect(() => matchUniqueSong({
      data: [
        { id: '1', type: 'Song', attributes: { title: 'Holy' } },
        { id: '2', type: 'Song', attributes: { title: 'Holy' } },
      ],
    }, 'Holy')).toThrow('Multiple songs found matching "Holy"');
  });
});

describe('planningCenterUrl', () => {
  it('prefers attributes.planning_center_url over a constructed fallback', () => {
    expect(planningCenterUrl({
      id: '123',
      type: 'Plan',
      attributes: { planning_center_url: 'https://services.planningcenteronline.com/plans/123' },
      links: { self: 'https://api.planningcenteronline.com/services/v2/plans/123' },
    })).toBe('https://services.planningcenteronline.com/plans/123');
  });

  it('falls back to the Services web URL when the attribute is missing', () => {
    expect(planningCenterUrl({ id: '123', type: 'Plan' }))
      .toBe('https://services.planningcenteronline.com/plans/123');
  });

  it('does not invent a plan URL for other resource types', () => {
    expect(planningCenterUrl({ id: '99', type: 'Song' })).toBeUndefined();
  });
});

describe('parseTeamReminders', () => {
  it('parses a team id to days hash', () => {
    expect(parseTeamReminders('{"10":7,"11":0}')).toEqual({ '10': 7, '11': 0 });
  });

  it('rejects values outside 0-7', () => {
    expect(() => parseTeamReminders('{"10":8}')).toThrow('must be an integer between 0 and 7');
  });
});

describe('parseAssignments', () => {
  it('parses assignment objects', () => {
    expect(parseAssignments('[{"person_id":"1","team_id":"2","position":"Leader"}]')).toEqual([
      { person_id: '1', team_id: '2', position: 'Leader' },
    ]);
  });

  it('rejects a non-array payload', () => {
    expect(() => parseAssignments('{"person_id":"1"}')).toThrow('--assignments must be a JSON array');
  });

  it('rejects present assignment fields with the wrong type', () => {
    expect(() => parseAssignments('[{"person_id":"1","team_id":"2","prepare_notification":"false"}]'))
      .toThrow('--assignments[0].prepare_notification must be a boolean');
    expect(() => parseAssignments('[{"person_id":"1","team_id":"2","position":1}]'))
      .toThrow('--assignments[0].position must be a string');
  });
});

describe('notifyStatus', () => {
  it('flags team members who still need the first scheduling email', () => {
    expect(notifyStatus({
      data: [
        {
          id: '1',
          type: 'PlanPerson',
          attributes: {
            name: 'Ada',
            status: 'U',
            prepare_notification: true,
            notification_prepared_at: '2026-08-01T00:00:00Z',
            notification_sent_at: null,
          },
        },
        {
          id: '2',
          type: 'PlanPerson',
          attributes: {
            name: 'Grace',
            status: 'C',
            notification_sent_at: '2026-08-02T00:00:00Z',
          },
        },
        {
          id: '3',
          type: 'PlanPerson',
          attributes: {
            name: 'Clara',
            status: 'C',
            notification_sent_at: null,
          },
        },
        {
          id: '4',
          type: 'PlanPerson',
          attributes: {
            name: 'Declan',
            status: 'D',
            notification_sent_at: null,
          },
        },
      ],
    })).toEqual([
      {
        id: '1',
        name: 'Ada',
        status: 'U',
        team_position_name: null,
        prepare_notification: true,
        notification_prepared_at: '2026-08-01T00:00:00Z',
        notification_sent_at: null,
        needs_scheduling_email: true,
      },
      {
        id: '2',
        name: 'Grace',
        status: 'C',
        team_position_name: null,
        prepare_notification: null,
        notification_prepared_at: null,
        notification_sent_at: '2026-08-02T00:00:00Z',
        needs_scheduling_email: false,
      },
      {
        id: '3',
        name: 'Clara',
        status: 'C',
        team_position_name: null,
        prepare_notification: null,
        notification_prepared_at: null,
        notification_sent_at: null,
        needs_scheduling_email: false,
      },
      {
        id: '4',
        name: 'Declan',
        status: 'D',
        team_position_name: null,
        prepare_notification: null,
        notification_prepared_at: null,
        notification_sent_at: null,
        needs_scheduling_email: false,
      },
    ]);
  });
});
