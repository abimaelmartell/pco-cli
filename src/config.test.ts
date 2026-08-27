import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyEnvFiles,
  authMode,
  globalConfigPath,
  healthReport,
  loadConfig,
  loadConfigFromAuthOptions,
} from './config.js';
import { packageVersion } from './version.js';

const defaultUserAgent = `pco-cli/${packageVersion()}`;

describe('loadConfig', () => {
  it('applies safe defaults when optional Planning Center settings are absent', () => {
    expect(loadConfig({})).toEqual({
      PCO_BASE_URL: 'https://api.planningcenteronline.com',
      PCO_USER_AGENT: defaultUserAgent,
    });
  });

  it('treats empty credential strings as unset', () => {
    expect(loadConfig({
      PCO_ACCESS_TOKEN: '',
      PCO_CLIENT_ID: '',
      PCO_APP_ID: '',
      PCO_SECRET: '',
    })).toEqual({
      PCO_BASE_URL: 'https://api.planningcenteronline.com',
      PCO_USER_AGENT: defaultUserAgent,
    });
  });

  it('accepts explicit credential and connection settings', () => {
    expect(loadConfig({
      PCO_ACCESS_TOKEN: 'token',
      PCO_APP_ID: 'app-id',
      PCO_SECRET: 'secret',
      PCO_BASE_URL: 'https://example.test/api',
      PCO_USER_AGENT: 'agent/1.0',
    })).toEqual({
      PCO_ACCESS_TOKEN: 'token',
      PCO_APP_ID: 'app-id',
      PCO_SECRET: 'secret',
      PCO_BASE_URL: 'https://example.test/api',
      PCO_USER_AGENT: 'agent/1.0',
    });
  });

  it('maps PCO_CLIENT_ID onto PCO_APP_ID for basic auth', () => {
    expect(loadConfig({
      PCO_CLIENT_ID: 'client-id',
      PCO_SECRET: 'secret',
    })).toEqual({
      PCO_APP_ID: 'client-id',
      PCO_SECRET: 'secret',
      PCO_BASE_URL: 'https://api.planningcenteronline.com',
      PCO_USER_AGENT: defaultUserAgent,
    });
  });

  it('keeps PCO_APP_ID working as a compatible alias', () => {
    expect(loadConfig({
      PCO_APP_ID: 'legacy-app-id',
      PCO_SECRET: 'secret',
    })).toMatchObject({
      PCO_APP_ID: 'legacy-app-id',
      PCO_SECRET: 'secret',
    });
  });

  it('continues when client id and app id are set to the same value', () => {
    expect(loadConfig({
      PCO_CLIENT_ID: 'same-id',
      PCO_APP_ID: 'same-id',
      PCO_SECRET: 'secret',
    })).toMatchObject({
      PCO_APP_ID: 'same-id',
    });
  });

  it('fails when client id and app id are set to different values', () => {
    expect(() => loadConfig({
      PCO_CLIENT_ID: 'client-id',
      PCO_APP_ID: 'app-id',
    })).toThrow('Conflicting Planning Center credentials: client id and app id are aliases and must match when both are set');
  });

  it('rejects invalid base URLs', () => {
    expect(() => loadConfig({ PCO_BASE_URL: 'not-a-url' })).toThrow();
  });
});

describe('loadConfigFromAuthOptions', () => {
  it('maps --client-id onto the basic-auth username', () => {
    expect(loadConfigFromAuthOptions({
      clientId: 'cli-client-id',
      secret: 'secret',
    }, {})).toMatchObject({
      PCO_APP_ID: 'cli-client-id',
      PCO_SECRET: 'secret',
    });
  });

  it('maps --app-id onto the same basic-auth username', () => {
    expect(loadConfigFromAuthOptions({
      appId: 'cli-app-id',
      secret: 'secret',
    }, {})).toMatchObject({
      PCO_APP_ID: 'cli-app-id',
    });
  });

  it('prefers --client-id over PCO_APP_ID when the values match', () => {
    expect(loadConfigFromAuthOptions(
      { clientId: 'shared-id' },
      { PCO_APP_ID: 'shared-id', PCO_SECRET: 'secret' },
    )).toMatchObject({
      PCO_APP_ID: 'shared-id',
    });
  });

  it('prefers CLI --client-id over PCO_CLIENT_ID', () => {
    expect(loadConfigFromAuthOptions(
      { clientId: 'from-flag' },
      { PCO_CLIENT_ID: 'from-env', PCO_SECRET: 'secret' },
    )).toMatchObject({
      PCO_APP_ID: 'from-flag',
    });
  });

  it('fails when --client-id and --app-id differ', () => {
    expect(() => loadConfigFromAuthOptions({
      clientId: 'client-id',
      appId: 'app-id',
    }, {})).toThrow('Conflicting Planning Center credentials');
  });

  it('fails when --client-id differs from PCO_APP_ID', () => {
    expect(() => loadConfigFromAuthOptions(
      { clientId: 'from-flag' },
      { PCO_APP_ID: 'from-env' },
    )).toThrow('Conflicting Planning Center credentials');
  });
});

describe('authMode', () => {
  it('reports basic auth for client id + secret without an access token', () => {
    expect(authMode(loadConfig({
      PCO_CLIENT_ID: 'client-id',
      PCO_SECRET: 'secret',
    }))).toBe('basic');
  });

  it('reports basic auth for app id + secret without an access token', () => {
    expect(authMode(loadConfig({
      PCO_APP_ID: 'app-id',
      PCO_SECRET: 'secret',
    }))).toBe('basic');
  });

  it('reports bearer auth when an access token is present', () => {
    expect(authMode(loadConfig({
      PCO_ACCESS_TOKEN: 'token',
      PCO_CLIENT_ID: 'client-id',
      PCO_SECRET: 'secret',
    }))).toBe('bearer');
  });

  it('reports none when credentials are missing', () => {
    expect(authMode(loadConfig({}))).toBe('none');
  });
});

describe('healthReport', () => {
  it('includes the package version so agents can confirm the installed CLI', () => {
    const config = loadConfig({
      PCO_CLIENT_ID: 'client-id',
      PCO_SECRET: 'secret',
    });

    expect(healthReport(config, true)).toEqual({
      ok: true,
      version: packageVersion(),
      baseUrl: 'https://api.planningcenteronline.com',
      auth: 'basic',
      clientReady: true,
    });
  });
});

describe('globalConfigPath', () => {
  it('uses PCO_CONFIG_PATH when set', () => {
    expect(globalConfigPath({ PCO_CONFIG_PATH: '/custom/pco.env' }, '/home/ada'))
      .toBe('/custom/pco.env');
  });

  it('uses XDG_CONFIG_HOME when set', () => {
    expect(globalConfigPath({ XDG_CONFIG_HOME: '/xdg' }, '/home/ada'))
      .toBe(path.join('/xdg', 'pco', 'env'));
  });

  it('defaults to ~/.config/pco/env', () => {
    expect(globalConfigPath({}, '/home/ada'))
      .toBe(path.join('/home/ada', '.config', 'pco', 'env'));
  });
});

describe('applyEnvFiles', () => {
  it('fills missing credentials from a project .env then a global config file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pco-cli-config-'));
    const projectEnvPath = path.join(root, '.env');
    const globalEnvPath = path.join(root, 'global.env');
    fs.writeFileSync(projectEnvPath, 'PCO_CLIENT_ID=from-project\nPCO_SECRET=\n');
    fs.writeFileSync(globalEnvPath, 'PCO_CLIENT_ID=from-global\nPCO_SECRET=from-global-secret\nPCO_USER_AGENT=global-agent/1.0\n');

    const env: NodeJS.ProcessEnv = {};
    applyEnvFiles(env, { projectEnvPath, globalEnvPath });

    expect(env).toMatchObject({
      PCO_CLIENT_ID: 'from-project',
      PCO_SECRET: 'from-global-secret',
      PCO_USER_AGENT: 'global-agent/1.0',
    });
  });

  it('does not override credentials already present in the environment', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pco-cli-config-'));
    const projectEnvPath = path.join(root, '.env');
    fs.writeFileSync(projectEnvPath, 'PCO_CLIENT_ID=from-project\nPCO_SECRET=from-project-secret\n');

    const env: NodeJS.ProcessEnv = {
      PCO_CLIENT_ID: 'from-shell',
    };
    applyEnvFiles(env, { projectEnvPath, globalEnvPath: path.join(root, 'missing.env') });

    expect(env.PCO_CLIENT_ID).toBe('from-shell');
    expect(env.PCO_SECRET).toBe('from-project-secret');
  });
});
