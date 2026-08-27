import dotenv from 'dotenv';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { packageVersion } from './version.js';

const optionalNonEmpty = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  PCO_ACCESS_TOKEN: optionalNonEmpty,
  PCO_CLIENT_ID: optionalNonEmpty,
  PCO_APP_ID: optionalNonEmpty,
  PCO_SECRET: optionalNonEmpty,
  PCO_BASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().default('https://api.planningcenteronline.com'),
  ),
  PCO_USER_AGENT: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).default(`pco-cli/${packageVersion()}`),
  ),
});

export type PcoConfig = {
  PCO_ACCESS_TOKEN?: string;
  PCO_APP_ID?: string;
  PCO_SECRET?: string;
  PCO_BASE_URL: string;
  PCO_USER_AGENT: string;
};

export type AuthMode = 'bearer' | 'basic' | 'none';

export type AuthOptionOverrides = {
  baseUrl?: string;
  accessToken?: string;
  clientId?: string;
  appId?: string;
  secret?: string;
};

export type ApplyEnvFilesOptions = {
  projectEnvPath?: string;
  globalEnvPath?: string;
  homedir?: string;
};

const CONFLICTING_BASIC_AUTH_IDS =
  'Conflicting Planning Center credentials: client id and app id are aliases and must match when both are set';

export function globalConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  homedir: string = os.homedir(),
): string {
  const configured = env.PCO_CONFIG_PATH;
  if (configured) return configured;

  const configHome = env.XDG_CONFIG_HOME || path.join(homedir, '.config');
  return path.join(configHome, 'pco', 'env');
}

function applyEnvFile(env: NodeJS.ProcessEnv, filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const parsed = dotenv.parse(fs.readFileSync(filePath));
  for (const [key, value] of Object.entries(parsed)) {
    if (value === '') continue;
    if (env[key]) continue;
    env[key] = value;
  }
}

export function applyEnvFiles(
  env: NodeJS.ProcessEnv = process.env,
  options: ApplyEnvFilesOptions = {},
): void {
  const projectEnvPath = options.projectEnvPath ?? path.resolve(process.cwd(), '.env');
  applyEnvFile(env, projectEnvPath);

  const globalPath = options.globalEnvPath ?? globalConfigPath(env, options.homedir);
  applyEnvFile(env, globalPath);
}

applyEnvFiles();

export function resolveBasicAuthUsername(clientId?: string, appId?: string): string | undefined {
  if (clientId && appId && clientId !== appId) {
    throw new Error(CONFLICTING_BASIC_AUTH_IDS);
  }
  return clientId ?? appId;
}

export function authMode(config: PcoConfig): AuthMode {
  if (config.PCO_ACCESS_TOKEN) return 'bearer';
  if (config.PCO_APP_ID && config.PCO_SECRET) return 'basic';
  return 'none';
}

export function healthReport(config: PcoConfig, clientReady: boolean) {
  return {
    ok: true as const,
    version: packageVersion(),
    baseUrl: config.PCO_BASE_URL,
    auth: authMode(config),
    clientReady,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PcoConfig {
  const parsed = envSchema.parse(env);
  const appId = resolveBasicAuthUsername(parsed.PCO_CLIENT_ID, parsed.PCO_APP_ID);

  return {
    PCO_BASE_URL: parsed.PCO_BASE_URL,
    PCO_USER_AGENT: parsed.PCO_USER_AGENT,
    ...(parsed.PCO_ACCESS_TOKEN ? { PCO_ACCESS_TOKEN: parsed.PCO_ACCESS_TOKEN } : {}),
    ...(appId ? { PCO_APP_ID: appId } : {}),
    ...(parsed.PCO_SECRET ? { PCO_SECRET: parsed.PCO_SECRET } : {}),
  };
}

export function loadConfigFromAuthOptions(
  opts: AuthOptionOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
): PcoConfig {
  return loadConfig({
    ...env,
    PCO_BASE_URL: opts.baseUrl ?? env.PCO_BASE_URL,
    PCO_ACCESS_TOKEN: opts.accessToken ?? env.PCO_ACCESS_TOKEN,
    PCO_CLIENT_ID: opts.clientId ?? env.PCO_CLIENT_ID,
    PCO_APP_ID: opts.appId ?? env.PCO_APP_ID,
    PCO_SECRET: opts.secret ?? env.PCO_SECRET,
  });
}
