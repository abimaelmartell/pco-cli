# Agent Notes

This repository is a TypeScript CLI intended to be published to npm and used by automation agents.

## Commands

- Install dependencies with `npm install`.
- Run `npm run check` before committing TypeScript changes.
- Run `npm run build` before publishing or changing CLI entrypoints.

## Conventions

- Keep endpoint commands small and composable so agents can call them reliably.
- Prefer JSON output by default for API-facing commands.
- Do not hard-code Planning Center credentials; read them from environment variables or explicit CLI flags.
- Keep reusable API logic in `src/client.ts`; keep CLI wiring in `src/cli.ts`.
