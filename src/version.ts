import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function packageVersion(): string {
  const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error('package.json is missing a version');
  }
  return pkg.version;
}
