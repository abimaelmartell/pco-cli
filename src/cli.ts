#!/usr/bin/env node
import { Command } from 'commander';
import { PartialWorkflowError, PlanningCenterApiError, PlanningCenterClient } from './client.js';
import type { ArrangementAttributes, KeyAttributes } from './client.js';
import { authMode, loadConfigFromAuthOptions } from './config.js';
import {
  asSingleResource,
  matchUniqueSong,
  notifyStatus,
  paginationFromOptions,
  parseAlternateKeys,
  parseAssignments,
  parseBooleanOption,
  parseIntegerOption,
  parseMusicalKey,
  parseNumberOption,
  parsePlanTimeType,
  parsePlanTimeWindow,
  parseStringList,
  parseTagGroupTarget,
  parseTagIds,
  parseTeamReminders,
  planningCenterUrl,
} from './helpers.js';

const program = new Command();

program
  .name('pco')
  .description('Agent-friendly CLI for the Planning Center API')
  .version('0.1.2')
  .option('--base-url <url>', 'Override the Planning Center API base URL')
  .option('--access-token <token>', 'Use a Planning Center bearer access token')
  .option('--client-id <id>', 'Use a Planning Center client id for basic auth')
  .option('--app-id <id>', 'Use a Planning Center app id for basic auth (alias of --client-id)')
  .option('--secret <secret>', 'Use a Planning Center secret for basic auth');

function loadRuntimeConfig() {
  return loadConfigFromAuthOptions(program.opts());
}

function getClient(): PlanningCenterClient {
  return new PlanningCenterClient(loadRuntimeConfig());
}

program
  .command('health')
  .description('Validate local CLI configuration without calling an endpoint')
  .action(() => {
    const config = loadRuntimeConfig();
    const client = new PlanningCenterClient(config);

    console.log(JSON.stringify({
      ok: true,
      baseUrl: config.PCO_BASE_URL,
      auth: authMode(config),
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
    const result = await client.listServiceTypes(paginationFromOptions(options));
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
    const result = await client.searchSongs(query, paginationFromOptions(options));
    console.log(JSON.stringify(result, null, 2));
  });

songs
  .command('get')
  .description('Get a song by ID')
  .argument('<song-id>', 'Song ID')
  .action(async (songId) => {
    const client = getClient();
    const result = await client.getSong(songId);
    console.log(JSON.stringify(result, null, 2));
  });

songs
  .command('create')
  .description('Create a song in the church library')
  .requiredOption('--title <title>', 'Song title')
  .option('--admin <name>', 'Admin or owner name')
  .option('--author <name>', 'Song author')
  .option('--copyright <text>', 'Copyright')
  .option('--ccli-number <number>', 'CCLI number')
  .option('--hidden <true|false>', 'Hide the song from the library', (value) => parseBooleanOption(value, '--hidden'))
  .option('--themes <text>', 'Themes')
  .action(async (options) => {
    const client = getClient();
    const result = await client.createSong(songAttributesFromOptions(options, { title: options.title }));
    console.log(JSON.stringify(result, null, 2));
  });

songs
  .command('update')
  .description('Update a song in the church library')
  .argument('<song-id>', 'Song ID')
  .option('--title <title>', 'Song title')
  .option('--admin <name>', 'Admin or owner name')
  .option('--author <name>', 'Song author')
  .option('--copyright <text>', 'Copyright')
  .option('--ccli-number <number>', 'CCLI number')
  .option('--hidden <true|false>', 'Hide the song from the library', (value) => parseBooleanOption(value, '--hidden'))
  .option('--themes <text>', 'Themes')
  .action(async (songId, options) => {
    const attributes = songAttributesFromOptions(options);
    if (Object.keys(attributes).length === 0) {
      throw new Error('Provide at least one of --title, --admin, --author, --copyright, --ccli-number, --hidden, or --themes');
    }
    const client = getClient();
    const result = await client.updateSong(songId, attributes);
    console.log(JSON.stringify(result, null, 2));
  });

songs
  .command('tags')
  .description('List tags assigned to a song')
  .argument('<song-id>', 'Song ID')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .action(async (songId, options) => {
    const client = getClient();
    const result = await client.listSongTags(songId, paginationFromOptions(options));
    console.log(JSON.stringify(result, null, 2));
  });

songs
  .command('assign-tags')
  .description('Replace all tags on a song (send the full tag id set)')
  .argument('<song-id>', 'Song ID')
  .requiredOption('--tag-ids <ids>', 'Comma-separated tag IDs (empty string clears tags)')
  .action(async (songId, options) => {
    const client = getClient();
    await client.assignSongTags(songId, parseTagIds(options.tagIds));
    console.log(JSON.stringify({ ok: true }, null, 2));
  });

const arrangements = program.command('arrangements').description('Manage song arrangements');

arrangements
  .command('list')
  .description('List arrangements for a song')
  .argument('<song-id>', 'Song ID')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .option('--include <resources>', 'Related resources to include (for example keys)')
  .action(async (songId, options) => {
    const client = getClient();
    const result = await client.listArrangements(songId, {
      ...paginationFromOptions(options),
      ...(options.include ? { include: options.include } : {}),
    });
    console.log(JSON.stringify(result, null, 2));
  });

arrangements
  .command('get')
  .description('Get an arrangement')
  .argument('<song-id>', 'Song ID')
  .argument('<arrangement-id>', 'Arrangement ID')
  .option('--include <resources>', 'Related resources to include (for example keys)')
  .action(async (songId, arrangementId, options) => {
    const client = getClient();
    const result = await client.getArrangement(songId, arrangementId, {
      ...(options.include ? { include: options.include } : {}),
    });
    console.log(JSON.stringify(result, null, 2));
  });

arrangements
  .command('create')
  .description('Create an arrangement for a song')
  .argument('<song-id>', 'Song ID')
  .requiredOption('--name <name>', 'Arrangement name')
  .option('--bpm <number>', 'Beats per minute')
  .option('--chord-chart <text>', 'Lyrics and chords (standard or ChordPro)')
  .option('--length <seconds>', 'Length in seconds')
  .option('--lyrics-enabled <true|false>', 'Enable lyrics', (value) => parseBooleanOption(value, '--lyrics-enabled'))
  .option('--meter <meter>', 'Time signature (for example 4/4)')
  .option('--notes <text>', 'Arrangement notes')
  .option('--sequence <json>', 'JSON array of section labels')
  .action(async (songId, options) => {
    const client = getClient();
    const result = await client.createArrangement(songId, arrangementAttributesFromOptions(options, { name: options.name }));
    console.log(JSON.stringify(result, null, 2));
  });

arrangements
  .command('update')
  .description('Update an arrangement')
  .argument('<song-id>', 'Song ID')
  .argument('<arrangement-id>', 'Arrangement ID')
  .option('--name <name>', 'Arrangement name')
  .option('--bpm <number>', 'Beats per minute')
  .option('--chord-chart <text>', 'Lyrics and chords (standard or ChordPro)')
  .option('--length <seconds>', 'Length in seconds')
  .option('--lyrics-enabled <true|false>', 'Enable lyrics', (value) => parseBooleanOption(value, '--lyrics-enabled'))
  .option('--meter <meter>', 'Time signature (for example 4/4)')
  .option('--notes <text>', 'Arrangement notes')
  .option('--sequence <json>', 'JSON array of section labels')
  .action(async (songId, arrangementId, options) => {
    const attributes = arrangementAttributesFromOptions(options);
    if (Object.keys(attributes).length === 0) {
      throw new Error('Provide at least one arrangement field to update');
    }
    const client = getClient();
    const result = await client.updateArrangement(songId, arrangementId, attributes);
    console.log(JSON.stringify(result, null, 2));
  });

arrangements
  .command('tags')
  .description('List tags assigned to an arrangement')
  .argument('<song-id>', 'Song ID')
  .argument('<arrangement-id>', 'Arrangement ID')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .action(async (songId, arrangementId, options) => {
    const client = getClient();
    const result = await client.listArrangementTags(songId, arrangementId, paginationFromOptions(options));
    console.log(JSON.stringify(result, null, 2));
  });

arrangements
  .command('assign-tags')
  .description('Replace all tags on an arrangement (send the full tag id set)')
  .argument('<song-id>', 'Song ID')
  .argument('<arrangement-id>', 'Arrangement ID')
  .requiredOption('--tag-ids <ids>', 'Comma-separated tag IDs (empty string clears tags)')
  .action(async (songId, arrangementId, options) => {
    const client = getClient();
    await client.assignArrangementTags(songId, arrangementId, parseTagIds(options.tagIds));
    console.log(JSON.stringify({ ok: true }, null, 2));
  });

const keys = program.command('keys').description('Manage arrangement keys');

keys
  .command('list')
  .description('List keys for an arrangement')
  .argument('<song-id>', 'Song ID')
  .argument('<arrangement-id>', 'Arrangement ID')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .action(async (songId, arrangementId, options) => {
    const client = getClient();
    const result = await client.listKeys(songId, arrangementId, paginationFromOptions(options));
    console.log(JSON.stringify(result, null, 2));
  });

keys
  .command('get')
  .description('Get a key')
  .argument('<song-id>', 'Song ID')
  .argument('<arrangement-id>', 'Arrangement ID')
  .argument('<key-id>', 'Key ID')
  .action(async (songId, arrangementId, keyId) => {
    const client = getClient();
    const result = await client.getKey(songId, arrangementId, keyId);
    console.log(JSON.stringify(result, null, 2));
  });

keys
  .command('create')
  .description('Add a key to an arrangement')
  .argument('<song-id>', 'Song ID')
  .argument('<arrangement-id>', 'Arrangement ID')
  .requiredOption('--starting-key <key>', 'Starting key (for example C or Cm)', (value) => parseMusicalKey(value, '--starting-key'))
  .option('--ending-key <key>', 'Ending key', (value) => parseMusicalKey(value, '--ending-key'))
  .option('--name <name>', 'Key name')
  .option('--alternate-keys <json>', 'JSON array of { "name", "key" } objects')
  .action(async (songId, arrangementId, options) => {
    const client = getClient();
    const result = await client.createKey(songId, arrangementId, keyAttributesFromOptions(options, {
      starting_key: options.startingKey,
    }));
    console.log(JSON.stringify(result, null, 2));
  });

keys
  .command('update')
  .description('Update a key')
  .argument('<song-id>', 'Song ID')
  .argument('<arrangement-id>', 'Arrangement ID')
  .argument('<key-id>', 'Key ID')
  .option('--starting-key <key>', 'Starting key (for example C or Cm)', (value) => parseMusicalKey(value, '--starting-key'))
  .option('--ending-key <key>', 'Ending key', (value) => parseMusicalKey(value, '--ending-key'))
  .option('--name <name>', 'Key name')
  .option('--alternate-keys <json>', 'JSON array of { "name", "key" } objects')
  .action(async (songId, arrangementId, keyId, options) => {
    const attributes = keyAttributesFromOptions(options);
    if (Object.keys(attributes).length === 0) {
      throw new Error('Provide at least one of --starting-key, --ending-key, --name, or --alternate-keys');
    }
    const client = getClient();
    const result = await client.updateKey(songId, arrangementId, keyId, attributes);
    console.log(JSON.stringify(result, null, 2));
  });

const tagGroups = program.command('tag-groups').description('List Planning Center tag groups and tags');

tagGroups
  .command('list')
  .description('List tag groups')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .option('--tags-for <target>', 'Filter by target (person, song, arrangement, media)', parseTagGroupTarget)
  .option('--include <resources>', 'Related resources to include (for example tags)')
  .action(async (options) => {
    const client = getClient();
    const result = await client.listTagGroups({
      ...paginationFromOptions(options),
      ...(options.tagsFor ? { 'where[tags_for]': options.tagsFor } : {}),
      ...(options.include ? { include: options.include } : {}),
    });
    console.log(JSON.stringify(result, null, 2));
  });

tagGroups
  .command('tags')
  .description('List tags in a tag group')
  .argument('<tag-group-id>', 'Tag group ID')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .action(async (tagGroupId, options) => {
    const client = getClient();
    const result = await client.listTagGroupTags(tagGroupId, paginationFromOptions(options));
    console.log(JSON.stringify(result, null, 2));
  });

function songAttributesFromOptions(
  options: {
    title?: string;
    admin?: string;
    author?: string;
    copyright?: string;
    ccliNumber?: string;
    hidden?: boolean;
    themes?: string;
  },
  required: { title: string },
): {
  title: string;
  admin?: string;
  author?: string;
  copyright?: string;
  ccli_number?: number;
  hidden?: boolean;
  themes?: string;
};
function songAttributesFromOptions(options: {
  title?: string;
  admin?: string;
  author?: string;
  copyright?: string;
  ccliNumber?: string;
  hidden?: boolean;
  themes?: string;
}): {
  title?: string;
  admin?: string;
  author?: string;
  copyright?: string;
  ccli_number?: number;
  hidden?: boolean;
  themes?: string;
};
function songAttributesFromOptions(options: {
  title?: string;
  admin?: string;
  author?: string;
  copyright?: string;
  ccliNumber?: string;
  hidden?: boolean;
  themes?: string;
}, required?: { title: string }) {
  const attributes: {
    title?: string;
    admin?: string;
    author?: string;
    copyright?: string;
    ccli_number?: number;
    hidden?: boolean;
    themes?: string;
  } = {
    ...(required ? { title: required.title } : {}),
  };
  if (!required && options.title) attributes.title = options.title;
  if (options.admin) attributes.admin = options.admin;
  if (options.author) attributes.author = options.author;
  if (options.copyright) attributes.copyright = options.copyright;
  if (options.ccliNumber) {
    attributes.ccli_number = parseIntegerOption(options.ccliNumber, '--ccli-number', { min: 1 });
  }
  if (options.hidden !== undefined) attributes.hidden = options.hidden;
  if (options.themes) attributes.themes = options.themes;
  return attributes;
}

function arrangementAttributesFromOptions(
  options: {
    name?: string;
    bpm?: string;
    chordChart?: string;
    length?: string;
    lyricsEnabled?: boolean;
    meter?: string;
    notes?: string;
    sequence?: string;
  },
  required: { name: string },
): ArrangementAttributes & { name: string };
function arrangementAttributesFromOptions(options: {
  name?: string;
  bpm?: string;
  chordChart?: string;
  length?: string;
  lyricsEnabled?: boolean;
  meter?: string;
  notes?: string;
  sequence?: string;
}): ArrangementAttributes;
function arrangementAttributesFromOptions(options: {
  name?: string;
  bpm?: string;
  chordChart?: string;
  length?: string;
  lyricsEnabled?: boolean;
  meter?: string;
  notes?: string;
  sequence?: string;
}, required?: { name: string }) {
  const attributes: {
    name?: string;
    bpm?: number;
    chord_chart?: string;
    length?: number;
    lyrics_enabled?: boolean;
    meter?: string;
    notes?: string;
    sequence?: string[];
  } = {
    ...(required ? { name: required.name } : {}),
  };
  if (!required && options.name) attributes.name = options.name;
  if (options.bpm) attributes.bpm = parseNumberOption(options.bpm, '--bpm', { min: 1 });
  if (options.chordChart) attributes.chord_chart = options.chordChart;
  if (options.length) attributes.length = parseIntegerOption(options.length, '--length', { min: 0 });
  if (options.lyricsEnabled !== undefined) attributes.lyrics_enabled = options.lyricsEnabled;
  if (options.meter) attributes.meter = options.meter;
  if (options.notes) attributes.notes = options.notes;
  if (options.sequence) attributes.sequence = parseStringList(options.sequence, '--sequence');
  return attributes;
}

function keyAttributesFromOptions(
  options: {
    startingKey?: string;
    endingKey?: string;
    name?: string;
    alternateKeys?: string;
  },
  required: { starting_key: string },
): KeyAttributes & { starting_key: string };
function keyAttributesFromOptions(options: {
  startingKey?: string;
  endingKey?: string;
  name?: string;
  alternateKeys?: string;
}): KeyAttributes;
function keyAttributesFromOptions(options: {
  startingKey?: string;
  endingKey?: string;
  name?: string;
  alternateKeys?: string;
}, required?: { starting_key: string }) {
  const attributes: {
    starting_key?: string;
    ending_key?: string;
    name?: string;
    alternate_keys?: Array<{ name: string; key: string }>;
  } = {
    ...(required ? { starting_key: required.starting_key } : {}),
  };
  if (!required && options.startingKey) attributes.starting_key = options.startingKey;
  if (options.endingKey) attributes.ending_key = options.endingKey;
  if (options.name) attributes.name = options.name;
  if (options.alternateKeys) attributes.alternate_keys = parseAlternateKeys(options.alternateKeys);
  return attributes;
}

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
    const result = await client.searchPeople(query, paginationFromOptions(options));
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
    const result = await client.listTeams(serviceTypeId, paginationFromOptions(options));
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
    const result = await client.listTeamPositions(teamId, paginationFromOptions(options));
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
      ...paginationFromOptions(options),
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
  .option('--time-type <type>', 'Time type (service, rehearsal, other)', parsePlanTimeType, 'service')
  .action(async (serviceTypeId, options) => {
    const timeWindow = parsePlanTimeWindow(options);

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

    let planTime;
    if (timeWindow.startsAt) {
      const timeAttributes: {
        starts_at: string;
        ends_at?: string;
        time_type: 'service' | 'rehearsal' | 'other';
      } = {
        starts_at: timeWindow.startsAt,
        time_type: options.timeType,
      };
      if (timeWindow.endsAt) {
        timeAttributes.ends_at = timeWindow.endsAt;
      }
      try {
        const timeResult = await client.createPlanTime(serviceTypeId, planData.id, timeAttributes);
        planTime = asSingleResource(timeResult.data);
      } catch (error: unknown) {
        throw new PartialWorkflowError(
          error instanceof Error ? error.message : 'Failed to create plan time',
          {
            plan: planData,
            planning_center_url: planningCenterUrl(planData),
            cause: error instanceof PlanningCenterApiError ? error.toJSON() : String(error),
          },
        );
      }
    }

    try {
      const finalResult = await client.getPlan(serviceTypeId, planData.id);
      console.log(JSON.stringify({
        ...finalResult,
        ...(planTime ? { plan_time: planTime } : {}),
        planning_center_url: planningCenterUrl(asSingleResource(finalResult.data)),
      }, null, 2));
    } catch (error: unknown) {
      if (error instanceof PartialWorkflowError) throw error;
      throw new PartialWorkflowError(
        error instanceof Error ? error.message : 'Failed to reload the created plan',
        {
          plan: planData,
          ...(planTime ? { plan_time: planTime } : {}),
          planning_center_url: planningCenterUrl(planData),
          cause: error instanceof PlanningCenterApiError ? error.toJSON() : String(error),
        },
      );
    }
  });

const planTimes = program.command('plan-times').description('Manage plan service times');

planTimes
  .command('list')
  .description('List times for a plan')
  .argument('<service-type-id>', 'Service type ID')
  .argument('<plan-id>', 'Plan ID')
  .option('--per-page <number>', 'Number of results per page', '25')
  .option('--offset <number>', 'Number of results to skip', '0')
  .action(async (serviceTypeId, planId, options) => {
    const client = getClient();
    const result = await client.listPlanTimes(serviceTypeId, planId, paginationFromOptions(options));
    console.log(JSON.stringify(result, null, 2));
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
    const result = await client.listPlanItems(serviceTypeId, planId, paginationFromOptions(options));
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
      const searchResult = await client.searchAllSongs(options.title);
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
      itemAttributes.sequence = parseIntegerOption(options.sequence, '--sequence', { min: 0 });
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
    const result = await client.listPlanTeamMembers(serviceTypeId, planId, paginationFromOptions(options));
    console.log(JSON.stringify(result, null, 2));
  });

planTeamMembers
  .command('notify-status')
  .description('Show which assigned people still need the first scheduling email')
  .argument('<service-type-id>', 'Service type ID')
  .argument('<plan-id>', 'Plan ID')
  .action(async (serviceTypeId, planId) => {
    const client = getClient();
    const result = await client.listAllPlanTeamMembers(serviceTypeId, planId);
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
  .option('--prepare-notification', 'Set prepare_notification=true (omit to keep the team default)')
  .action(async (serviceTypeId, planId, personId, teamId, options) => {
    const client = getClient();
    const attributes: {
      person_id: string;
      team_id: string;
      team_position_name?: string;
      prepare_notification?: boolean;
    } = {
      person_id: personId,
      team_id: teamId,
    };
    if (options.position) {
      attributes.team_position_name = options.position;
    }
    if (options.prepareNotification === true) {
      attributes.prepare_notification = true;
    }
    const result = await client.createPlanTeamMember(serviceTypeId, planId, attributes);
    console.log(JSON.stringify(result, null, 2));
  });

// Plan reminders command
const planReminders = program.command('plan-reminders').description('Manage plan reminder settings');

planReminders
  .command('set')
  .description('Set team reminders for a plan time')
  .argument('<service-type-id>', 'Service type ID')
  .argument('<plan-time-id>', 'Plan time ID')
  .requiredOption('--team-reminders <json>', 'Team reminders JSON (e.g., \'{"team_id": 7}\')')
  .action(async (serviceTypeId, planTimeId, options) => {
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
    const timeWindow = parsePlanTimeWindow(options);
    const client = getClient();
    const assignments = options.assignments ? parseAssignments(options.assignments) : [];
    const teamReminders = options.teamReminders ? parseTeamReminders(options.teamReminders) : undefined;
    const songTitles: string[] = options.songs ?? [];
    const resolvedSongs = [];

    for (const title of songTitles) {
      const searchResult = await client.searchAllSongs(title);
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
      starts_at: timeWindow.startsAt,
      time_type: 'service',
    };
    if (timeWindow.endsAt) {
      planTimeAttributes.ends_at = timeWindow.endsAt;
    }
    if (teamReminders) {
      planTimeAttributes.team_reminders = teamReminders;
    }

    const planTimeResult = await client.createPlanTime(serviceTypeId, planData.id, planTimeAttributes).catch((error: unknown) => {
      throw new PartialWorkflowError(
        error instanceof Error ? error.message : 'Failed to create plan time',
        {
          plan: planData,
          planning_center_url: planningCenterUrl(planData),
          cause: error instanceof PlanningCenterApiError ? error.toJSON() : String(error),
        },
      );
    });
    const planTimeData = asSingleResource(planTimeResult.data);
    if (!planTimeData) {
      throw new PartialWorkflowError('Failed to create plan time', {
        plan: planData,
        planning_center_url: planningCenterUrl(planData),
      });
    }

    const songItems = [];
    const assignmentResults = [];
    try {
      for (const { song } of resolvedSongs) {
        const itemResult = await client.createPlanItem(serviceTypeId, planData.id, {
          song_id: song.id,
        });
        songItems.push(itemResult.data);
      }

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
    } catch (error: unknown) {
      if (error instanceof PartialWorkflowError) throw error;
      throw new PartialWorkflowError(
        error instanceof Error ? error.message : 'Failed after creating the plan',
        {
          plan: planData,
          plan_time: planTimeData,
          songs: songItems,
          assignments: assignmentResults,
          planning_center_url: planningCenterUrl(planData),
          cause: error instanceof PlanningCenterApiError ? error.toJSON() : String(error),
        },
      );
    }
  });

program.parseAsync().catch((error: unknown) => {
  if (error instanceof PlanningCenterApiError || error instanceof PartialWorkflowError) {
    console.error(JSON.stringify(error.toJSON(), null, 2));
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  }
  process.exitCode = 1;
});
