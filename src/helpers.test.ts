import { describe, expect, it } from 'vitest';
import {
  matchUniqueSong,
  notifyStatus,
  parseAssignments,
  parseIntegerOption,
  parsePlanTimeType,
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

describe('parseIntegerOption', () => {
  it('accepts whole integers', () => {
    expect(parseIntegerOption('3', '--sequence')).toBe(3);
    expect(parseIntegerOption('0', '--offset', { min: 0 })).toBe(0);
  });

  it('rejects truncated or non-numeric values', () => {
    expect(() => parseIntegerOption('3.7', '--sequence')).toThrow('--sequence must be an integer');
    expect(() => parseIntegerOption('2x', '--per-page')).toThrow('--per-page must be an integer');
    expect(() => parseIntegerOption('101', '--per-page', { min: 1, max: 100 })).toThrow('--per-page must be <= 100');
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
