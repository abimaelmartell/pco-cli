#!/usr/bin/env node
import { Command } from 'commander';
import { PlanningCenterClient } from './client.js';
import { loadConfig } from './config.js';
import {
  asSingleResource,
  matchUniqueSong,
  notifyStatus,
  parseAssignments,
  parseTeamReminders,
  planningCenterUrl,
} from './helpers.js';

const program = new Command();

program
  .name('pco')
  .description('Agent-friendly CLI for the Planning Center API')
  .version('0.1.0')
  .option('--base-url <url>', 'Override the Planning Center API base URL')
  .option('--access-token <token>', 'Use a Planning Center bearer access token')
  .option('--app-id <id>', 'Use a Planning Center app id for basic auth')
  .option('--secret <secret>', 'Use a Planning Center secret for basic auth');

function getClient(): PlanningCenterClient {
  const opts = program.opts();
  const config = loadConfig({
    ...process.env,
    PCO_BASE_URL: opts.baseUrl ?? process.env.PCO_BASE_URL,
    PCO_ACCESS_TOKEN: opts.accessToken ?? process.env.PCO_ACCESS_TOKEN,
    PCO_APP_ID: opts.appId ?? process.env.PCO_APP_ID,
    PCO_SECRET: opts.secret ?? process.env.PCO_SECRET,
  });
  return new PlanningCenterClient(config);
}

program
  .command('health')
  .description('Validate local CLI configuration without calling an endpoint')
  .action(() => {
    const opts = program.opts();
    const config = loadConfig({
      ...process.env,
      PCO_BASE_URL: opts.baseUrl ?? process.env.PCO_BASE_URL,
      PCO_ACCESS_TOKEN: opts.accessToken ?? process.env.PCO_ACCESS_TOKEN,
      PCO_APP_ID: opts.appId ?? process.env.PCO_APP_ID,
      PCO_SECRET: opts.secret ?? process.env.PCO_SECRET,
    });

    const client = new PlanningCenterClient(config);

    console.log(JSON.stringify({
      ok: true,
      baseUrl: config.PCO_BASE_URL,
      auth: config.PCO_ACCESS_TOKEN ? 'bearer' : config.PCO_APP_ID && config.PCO_SECRET ? 'basic' : 'none',
      clientReady: Boolean(client),
    }, null, 2));
  });

// Service Types commands
const serviceTypes = program.command('service-types').description('Manage Planning Center service types');

serviceTypes
  .command('list')
  .description('List all service types')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .action(async (options) => {
    const client = getClient();
    const result = await client.listServiceTypes({
      per_page: parseInt(options.perPage),
      offset: parseInt(options.offset),
    });
    console.log(JSON.stringify(result, null, 2));
  });

// Songs commands
const songs = program.command('songs').description('Search and manage songs');

songs
  .command('search')
  .description('Search for songs by title')
  .argument('<query>', 'Search query')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .action(async (query, options) => {
    const client = getClient();
    const result = await client.searchSongs(query, {
      per_page: parseInt(options.perPage),
      offset: parseInt(options.offset),
    });
    console.log(JSON.stringify(result, null, 2));
  });

// People commands
const people = program.command('people').description('Search and manage people');

people
  .command('search')
  .description('Search for people by name')
  .argument('<query>', 'Search query')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .action(async (query, options) => {
    const client = getClient();
    const result = await client.searchPeople(query, {
      per_page: parseInt(options.perPage),
      offset: parseInt(options.offset),
    });
    console.log(JSON.stringify(result, null, 2));
  });

// Teams commands
const teams = program.command('teams').description('Manage service type teams and positions');

teams
  .command('list')
  .description('List teams for a service type')
  .argument('<service-type-id>', 'Service type ID')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .action(async (serviceTypeId, options) => {
    const client = getClient();
    const result = await client.listTeams(serviceTypeId, {
      per_page: parseInt(options.perPage),
      offset: parseInt(options.offset),
    });
    console.log(JSON.stringify(result, null, 2));
  });

teams
  .command('positions')
  .description('List positions for a team')
  .argument('<team-id>', 'Team ID')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .action(async (teamId, options) => {
    const client = getClient();
    const result = await client.listTeamPositions(teamId, {
      per_page: parseInt(options.perPage),
      offset: parseInt(options.offset),
    });
    console.log(JSON.stringify(result, null, 2));
  });

// Plans commands
const plans = program.command('plans').description('Manage service plans');

plans
  .command('list')
  .description('List plans for a service type')
  .argument('<service-type-id>', 'Service type ID')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .option('--filter <filter>', 'Filter plans (e.g., "future", "past")')
  .option('--order <order>', 'Order plans (e.g., "sort_date")')
  .action(async (serviceTypeId, options) => {
    const client = getClient();
    const result = await client.listPlans(serviceTypeId, {
      per_page: parseInt(options.perPage),
      offset: parseInt(options.offset),
      filter: options.filter,
      order: options.order,
    });
    console.log(JSON.stringify(result, null, 2));
  });

plans
  .command('get')
  .description('Get a specific plan')
  .argument('<service-type-id>', 'Service type ID')
  .argument('<plan-id>', 'Plan ID')
  .action(async (serviceTypeId, planId) => {
    const client = getClient();
    const result = await client.getPlan(serviceTypeId, planId);
    console.log(JSON.stringify({
      ...result,
      planning_center_url: planningCenterUrl(asSingleResource(result.data)),
    }, null, 2));
  });

plans
  .command('create')
  .description('Create a new plan')
  .argument('<service-type-id>', 'Service type ID')
  .option('--title <title>', 'Plan title')
  .option('--series-title <title>', 'Series title')
  .option('--public', 'Make the plan public', false)
  .option('--starts-at <datetime>', 'Service start time (ISO 8601)')
  .option('--ends-at <datetime>', 'Service end time (ISO 8601)')
  .option('--time-type <type>', 'Time type (service, rehearsal, other)', 'service')
  .action(async (serviceTypeId, options) => {
    const client = getClient();
    const planResult = await client.createPlan(serviceTypeId, {
      title: options.title,
      series_title: options.seriesTitle,
      public: options.public,
    });

    const planData = Array.isArray(planResult.data) ? planResult.data[0] : planResult.data;
    if (!planData) {
      throw new Error('Failed to create plan');
    }

    if (options.startsAt) {
      const timeAttributes: {
        starts_at: string;
        ends_at?: string;
        time_type?: 'service' | 'rehearsal' | 'other';
      } = {
        starts_at: options.startsAt,
      };
      if (options.endsAt) {
        timeAttributes.ends_at = options.endsAt;
      }
      if (options.timeType === 'service' || options.timeType === 'rehearsal' || options.timeType === 'other') {
        timeAttributes.time_type = options.timeType;
      }
      await client.createPlanTime(serviceTypeId, planData.id, timeAttributes);
    }

    const finalResult = await client.getPlan(serviceTypeId, planData.id);
    console.log(JSON.stringify({
      ...finalResult,
      planning_center_url: planningCenterUrl(asSingleResource(finalResult.data)),
    }, null, 2));
  });

// Plan items commands
const planItems = program.command('plan-items').description('Manage plan items (songs)');

planItems
  .command('list')
  .description('List items for a plan')
  .argument('<service-type-id>', 'Service type ID')
  .argument('<plan-id>', 'Plan ID')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .action(async (serviceTypeId, planId, options) => {
    const client = getClient();
    const result = await client.listPlanItems(serviceTypeId, planId, {
      per_page: parseInt(options.perPage),
      offset: parseInt(options.offset),
    });
    console.log(JSON.stringify(result, null, 2));
  });

planItems
  .command('add-song')
  .description('Add a song to a plan (by ID or search)')
  .argument('<service-type-id>', 'Service type ID')
  .argument('<plan-id>', 'Plan ID')
  .option('--song-id <id>', 'Song ID')
  .option('--title <title>', 'Song title to search for (must match exactly one song)')
  .option('--arrangement-id <id>', 'Arrangement ID')
  .option('--key-id <id>', 'Key ID')
  .option('--sequence <number>', 'Item sequence number')
  .option('--service-position <position>', 'Service position')
  .action(async (serviceTypeId, planId, options) => {
    const client = getClient();
    let songId = options.songId;

    if (!songId && options.title) {
      const searchResult = await client.searchSongs(options.title);
      songId = matchUniqueSong(searchResult, options.title).id;
    }

    if (!songId) {
      throw new Error('Either --song-id or --title must be provided');
    }

    const itemAttributes: {
      song_id?: string;
      arrangement_id?: string;
      key_id?: string;
      sequence?: number;
      service_position?: string;
    } = {
      song_id: songId,
      arrangement_id: options.arrangementId,
      key_id: options.keyId,
      service_position: options.servicePosition,
    };

    if (options.sequence) {
      itemAttributes.sequence = parseInt(options.sequence);
    }

    const result = await client.createPlanItem(serviceTypeId, planId, itemAttributes);
    console.log(JSON.stringify(result, null, 2));
  });

// Plan team members commands
const planTeamMembers = program.command('plan-team-members').description('Manage plan team member assignments');

planTeamMembers
  .command('list')
  .description('List team members assigned to a plan')
  .argument('<service-type-id>', 'Service type ID')
  .argument('<plan-id>', 'Plan ID')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .action(async (serviceTypeId, planId, options) => {
    const client = getClient();
    const result = await client.listPlanTeamMembers(serviceTypeId, planId, {
      per_page: parseInt(options.perPage),
      offset: parseInt(options.offset),
    });
    console.log(JSON.stringify(result, null, 2));
  });

planTeamMembers
  .command('notify-status')
  .description('Show which assigned people still need the first scheduling email')
  .argument('<service-type-id>', 'Service type ID')
  .argument('<plan-id>', 'Plan ID')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .action(async (serviceTypeId, planId, options) => {
    const client = getClient();
    const result = await client.listPlanTeamMembers(serviceTypeId, planId, {
      per_page: parseInt(options.perPage),
      offset: parseInt(options.offset),
    });
    console.log(JSON.stringify({
      ok: true,
      note: 'The Services API cannot send Accept/Decline scheduling emails. Use team_reminders or the Planning Center UI.',
      team_members: notifyStatus(result),
    }, null, 2));
  });

planTeamMembers
  .command('assign')
  .description('Assign a person to a plan')
  .argument('<service-type-id>', 'Service type ID')
  .argument('<plan-id>', 'Plan ID')
  .argument('<person-id>', 'Person ID')
  .argument('<team-id>', 'Team ID')
  .option('--position <name>', 'Team position name')
  .option('--prepare-notification', 'Send prepare notification', false)
  .action(async (serviceTypeId, planId, personId, teamId, options) => {
    const client = getClient();
    const result = await client.createPlanTeamMember(serviceTypeId, planId, {
      person_id: personId,
      team_id: teamId,
      team_position_name: options.position,
      prepare_notification: options.prepareNotification,
    });
    console.log(JSON.stringify(result, null, 2));
  });

// Plan reminders command
const planReminders = program.command('plan-reminders').description('Manage plan reminder settings');

planReminders
  .command('set')
  .description('Set team reminders for a plan time')
  .argument('<service-type-id>', 'Service type ID')
  .argument('<plan-id>', 'Plan ID')
  .argument('<plan-time-id>', 'Plan time ID')
  .requiredOption('--team-reminders <json>', 'Team reminders JSON (e.g., \'{"team_id": 7}\')')
  .action(async (serviceTypeId, _planId, planTimeId, options) => {
    const client = getClient();
    const result = await client.updatePlanTime(serviceTypeId, planTimeId, {
      team_reminders: parseTeamReminders(options.teamReminders),
    });
    console.log(JSON.stringify(result, null, 2));
  });

// Composite workflow command
program
  .command('create-worship-plan')
  .description('Create a worship plan with songs, assignments, and reminders in one command')
  .argument('<service-type-id>', 'Service type ID')
  .requiredOption('--title <title>', 'Plan title')
  .requiredOption('--starts-at <datetime>', 'Service start time (ISO 8601)')
  .option('--ends-at <datetime>', 'Service end time (ISO 8601)')
  .option('--series-title <title>', 'Series title')
  .option('--public', 'Make the plan public', false)
  .option('--songs <titles...>', 'Song titles to add (space-separated)')
  .option('--assignments <json>', 'Team member assignments JSON array: [{"person_id":"1","team_id":"2","position":"Leader"}]')
  .option('--team-reminders <json>', 'Team reminders JSON (e.g., \'{"team_id": 7}\')')
  .action(async (serviceTypeId, options) => {
    const client = getClient();
    const assignments = options.assignments ? parseAssignments(options.assignments) : [];
    const teamReminders = options.teamReminders ? parseTeamReminders(options.teamReminders) : undefined;
    const songTitles: string[] = options.songs ?? [];
    const resolvedSongs = [];

    for (const title of songTitles) {
      const searchResult = await client.searchSongs(title);
      resolvedSongs.push({ title, song: matchUniqueSong(searchResult, title) });
    }

    const planResult = await client.createPlan(serviceTypeId, {
      title: options.title,
      series_title: options.seriesTitle,
      public: options.public,
    });
    const planData = asSingleResource(planResult.data);
    if (!planData) {
      throw new Error('Failed to create plan');
    }

    const planTimeAttributes: {
      starts_at: string;
      ends_at?: string;
      time_type: 'service';
      team_reminders?: Record<string, number>;
    } = {
      starts_at: options.startsAt,
      time_type: 'service',
    };
    if (options.endsAt) {
      planTimeAttributes.ends_at = options.endsAt;
    }
    if (teamReminders) {
      planTimeAttributes.team_reminders = teamReminders;
    }

    const planTimeResult = await client.createPlanTime(serviceTypeId, planData.id, planTimeAttributes);
    const planTimeData = asSingleResource(planTimeResult.data);
    if (!planTimeData) {
      throw new Error('Failed to create plan time');
    }

    const songItems = [];
    for (const { song } of resolvedSongs) {
      const itemResult = await client.createPlanItem(serviceTypeId, planData.id, {
        song_id: song.id,
      });
      songItems.push(itemResult.data);
    }

    const assignmentResults = [];
    for (const assignment of assignments) {
      const memberAttributes: {
        person_id: string;
        team_id: string;
        team_position_name?: string;
        prepare_notification?: boolean;
      } = {
        person_id: assignment.person_id,
        team_id: assignment.team_id,
      };
      if (assignment.position) {
        memberAttributes.team_position_name = assignment.position;
      }
      if (assignment.prepare_notification !== undefined) {
        memberAttributes.prepare_notification = assignment.prepare_notification;
      }
      const memberResult = await client.createPlanTeamMember(serviceTypeId, planData.id, memberAttributes);
      assignmentResults.push(memberResult.data);
    }

    const finalPlan = await client.getPlan(serviceTypeId, planData.id);
    const plan = asSingleResource(finalPlan.data) ?? planData;

    console.log(JSON.stringify({
      ok: true,
      plan,
      plan_time: planTimeData,
      songs: songItems,
      assignments: assignmentResults,
      ...(teamReminders ? { team_reminders: teamReminders } : {}),
      planning_center_url: planningCenterUrl(plan),
    }, null, 2));
  });

program.parseAsync().catch((error: unknown) => {
  if (typeof error === 'object' && error !== null && 'ok' in error) {
    console.error(JSON.stringify(error, null, 2));
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  }
  process.exitCode = 1;
});
