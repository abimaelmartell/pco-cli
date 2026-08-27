import { PartialWorkflowError, PlanningCenterApiError } from './client.js';
import { packageVersion } from './version.js';

export function formatCliError(error: unknown): Record<string, unknown> {
  const version = packageVersion();
  if (error instanceof PlanningCenterApiError || error instanceof PartialWorkflowError) {
    return { version, ...error.toJSON() };
  }

  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, version, error: message };
}
