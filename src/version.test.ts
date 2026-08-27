import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { packageVersion } from './version.js';

describe('packageVersion', () => {
  it('reads the version from package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(packageVersion()).toBe(pkg.version);
  });
});
