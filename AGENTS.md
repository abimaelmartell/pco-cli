# Agent Notes

This repository is a TypeScript CLI intended to be published to npm and used by automation agents.

## Commands

- Install dependencies with `npm install`.
- Run `npm run check` before committing TypeScript changes.
- Run `npm run lint` and `npm test` as well; CI runs check, test, and lint.
- Run `npm run build` before publishing or changing CLI entrypoints.

## Command layout

Keep endpoint commands small and composable. Current Services worship-planning surface:

- `service-types list`
- `songs search` / `people search`
- `teams list` / `teams positions`
- `plans list` / `get` / `create`
- `plan-times list`
- `plan-items list` / `add-song`
- `plan-team-members list` / `notify-status` / `assign`
- `plan-reminders set`
- `create-worship-plan` (composite: resolve songs first, then mutate)

## Conventions

- Prefer JSON output by default for API-facing commands.
- Do not hard-code Planning Center credentials; read them from environment variables (`PCO_CLIENT_ID` / `PCO_SECRET`, with `PCO_APP_ID` as an alias) or explicit CLI flags (`--client-id`, `--app-id`, `--secret`, `--access-token`).
- Keep reusable API logic in `src/client.ts`; keep CLI wiring in `src/cli.ts`; keep argument mapping helpers in `src/helpers.ts`.
- Match Planning Center JSON:API filters (`where[title]`, `where[search_name]`) and documented routes.
- The Services API cannot send Accept/Decline scheduling emails. Use `team_reminders` and `notify-status`; return `attributes.planning_center_url`.
