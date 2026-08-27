import { describe, expect, it } from 'vitest';
import { PartialWorkflowError, PlanningCenterApiError } from './client.js';
import { formatCliError } from './cli-error.js';
import { packageVersion } from './version.js';

describe('formatCliError', () => {
  it('adds the CLI version to generic errors', () => {
    expect(formatCliError(new Error('missing song'))).toEqual({
      ok: false,
      version: packageVersion(),
      error: 'missing song',
    });
  });

  it('adds the CLI version to API errors without changing status fields', () => {
    const error = new PlanningCenterApiError({
      status: 404,
      message: 'Resource not found',
      errors: [{ detail: 'Resource not found' }],
    });

    expect(formatCliError(error)).toEqual({
      version: packageVersion(),
      ok: false,
      status: 404,
      message: 'Resource not found',
      errors: [{ detail: 'Resource not found' }],
    });
  });

  it('adds the CLI version to partial workflow errors', () => {
    const error = new PartialWorkflowError('failed after creating the plan', { plan: { id: '1' } });

    expect(formatCliError(error)).toEqual({
      version: packageVersion(),
      ok: false,
      error: 'failed after creating the plan',
      partial: { plan: { id: '1' } },
    });
  });
});
