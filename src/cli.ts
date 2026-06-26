#!/usr/bin/env node
import { Command } from 'commander';
import { PlanningCenterClient } from './client.js';
import { loadConfig } from './config.js';

const program = new Command();

program
  .name('pco')
  .description('Agent-friendly CLI for the Planning Center API')
  .version('0.1.0')
  .option('--base-url <url>', 'Override the Planning Center API base URL')
  .option('--access-token <token>', 'Use a Planning Center bearer access token')
  .option('--app-id <id>', 'Use a Planning Center app id for basic auth')
  .option('--secret <secret>', 'Use a Planning Center secret for basic auth');

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

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exitCode = 1;
});
