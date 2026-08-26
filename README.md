# pco-cli

Agent-friendly TypeScript CLI for the Planning Center API, intended for npm publishing.

Planning Center exposes APIs for products including Calendar, Check-Ins, Giving, Groups, People, and Services. This CLI focuses on the **Services** product for worship planning workflows.

## Install

From npm (after the package is published):

```bash
npm install -g @abimaelmartell/pco-cli
pco health
```

The registry package is scoped because npm rejects unscoped `pco-cli` as too similar to existing [`cp-cli`](https://www.npmjs.com/package/cp-cli). The installed binaries are still `pco` and `pco-cli`.

From this repository:

```bash
npm install
npm run build
npm link
pco health
```

`npm install` and `npm run build` alone do not put `pco` on `PATH`. Use `npm link` for a local checkout, or run `npm run dev -- health`.

## Configuration

Copy `.env.example` to `.env` and set credentials:

```bash
cp .env.example .env
```

To store credentials once for every working directory, copy the same file to `~/.config/pco/env` (or `$XDG_CONFIG_HOME/pco/env`). Override the path with `PCO_CONFIG_PATH` if needed.

Supported authentication inputs:

- `PCO_ACCESS_TOKEN` for bearer token flows.
- `PCO_CLIENT_ID` and `PCO_SECRET` for basic auth. Planning Center personal access tokens are labeled Client ID + Secret.
- `PCO_APP_ID` is a compatible alias of `PCO_CLIENT_ID`. If both are set to different values, the CLI exits with an error.

You can also pass credentials via CLI flags: `--access-token`, `--client-id` (alias `--app-id`), and `--secret`. Flags override environment values. Environment values override a project `.env`, which overrides the global config file. You do not need to pass flags on every command when credentials are in the environment or a config file.

Bearer `PCO_ACCESS_TOKEN` / `--access-token` wins over basic auth when both are present.

## Agent skill

A portable [Agent Skill](https://agentskills.io) lives at `.agents/skills/pco-cli/SKILL.md`. Cursor, Claude Code, Codex, and other compatible agents load it from that path automatically in this repo.

To use the CLI from another project or globally:

```bash
mkdir -p ~/.agents/skills/pco-cli
curl -fsSL https://raw.githubusercontent.com/abimaelmartell/pco-cli/main/.agents/skills/pco-cli/SKILL.md \
  -o ~/.agents/skills/pco-cli/SKILL.md
```

Project copy (Cursor also reads `.cursor/skills/`):

```bash
mkdir -p .agents/skills/pco-cli
curl -fsSL https://raw.githubusercontent.com/abimaelmartell/pco-cli/main/.agents/skills/pco-cli/SKILL.md \
  -o .agents/skills/pco-cli/SKILL.md
```

## Usage

The CLI prints JSON so automation agents can parse output reliably.

### Health check

```bash
pco health
```

### Service Types

List available service types:

```bash
pco service-types list
pco service-types list --per-page 10 --offset 0
```

### Songs

Search for songs by title:

```bash
pco songs search "Amazing Grace"
pco songs search "How Great" --per-page 5
```

Create or update library songs (Planning Center assignable fields: title, admin, author, copyright, ccli_number, hidden, themes):

```bash
pco songs get <song-id>
pco songs create --title "Holy Forever" --author "Chris Tomlin" --ccli-number 7200535
pco songs update <song-id> --hidden true --themes "Praise"
```

Tags replace the full set. Look up IDs first:

```bash
pco tag-groups list --tags-for song --include tags
pco tag-groups tags <tag-group-id>
pco songs tags <song-id>
pco songs assign-tags <song-id> --tag-ids 5,9
```

### Arrangements and keys

Keys belong to an arrangement, not directly to a song. Creating a song usually adds a default arrangement; list it before adding keys.

```bash
pco arrangements list <song-id> --include keys
pco arrangements create <song-id> --name "Default" --meter 4/4 --bpm 72
pco arrangements update <song-id> <arrangement-id> --chord-chart "[G]Holy forever"
pco arrangements assign-tags <song-id> <arrangement-id> --tag-ids 12

pco keys list <song-id> <arrangement-id>
pco keys create <song-id> <arrangement-id> --starting-key G --ending-key G
pco keys update <song-id> <arrangement-id> <key-id> --starting-key A --name "Acoustic"
```

`--starting-key` / `--ending-key` use Planning Center values (`C`, `Cm`, `F#`, …). `--alternate-keys` is a JSON array of `{"name":"Capo 3","key":"A"}`.

Keys do not have their own tags in the Services API. Tag songs and arrangements instead.

### People

Search for people by name:

```bash
pco people search "John Smith"
pco people search "Sarah" --per-page 10
```

### Teams

List teams for a service type, and positions for a team:

```bash
pco teams list <service-type-id>
pco teams positions <team-id>
```

### Plans

Create and manage service plans:

```bash
# List plans
pco plans list <service-type-id>
pco plans list <service-type-id> --filter future --order sort_date

# Get a specific plan (includes planning_center_url for the Services web UI)
pco plans get <service-type-id> <plan-id>

# Create a plan with optional service time (returns plan_time id for reminders)
pco plans create <service-type-id> \
  --title "Sunday Worship" \
  --series-title "Summer Series" \
  --public \
  --starts-at "2026-08-30T10:00:00Z" \
  --ends-at "2026-08-30T11:30:00Z"

`--starts-at` and `--ends-at` must be ISO 8601 datetimes with a timezone. `--ends-at` requires `--starts-at` and must be later than the start time.

# List times on a plan
pco plan-times list <service-type-id> <plan-id>
```

### Plan Items (Songs)

Add songs to a plan:

```bash
# List items in a plan
pco plan-items list <service-type-id> <plan-id>

# Add a song by ID
pco plan-items add-song <service-type-id> <plan-id> --song-id <song-id>

# Add a song by title (must match exactly one song across every search page)
pco plan-items add-song <service-type-id> <plan-id> --title "Amazing Grace"

# Add with arrangement and key
pco plan-items add-song <service-type-id> <plan-id> \
  --song-id <song-id> \
  --arrangement-id <arrangement-id> \
  --key-id <key-id>
```

### Team Member Assignments

Assign people to plans:

```bash
# List team members on a plan
pco plan-team-members list <service-type-id> <plan-id>

# See who still needs the first Accept/Decline scheduling email (all assigned members)
pco plan-team-members notify-status <service-type-id> <plan-id>

# Assign a person to a plan
pco plan-team-members assign <service-type-id> <plan-id> <person-id> <team-id> \
  --position "Worship Leader" \
  --prepare-notification
```

### Team Reminders

Set automated reminder emails for teams:

```bash
# Set team reminders (days before service)
pco plan-reminders set <service-type-id> <plan-time-id> \
  --team-reminders '{"<team-id>": 7, "<team-id-2>": 3}'
```

The `team_reminders` object maps team IDs to the number of days (0-7) before the service time to send automated reminder emails.

### Complete Worship Planning Workflow

Create a full worship plan in one command:

```bash
pco create-worship-plan <service-type-id> \
  --title "Sunday Morning Service" \
  --starts-at "2026-08-30T10:00:00Z" \
  --ends-at "2026-08-30T11:30:00Z" \
  --series-title "Summer Worship" \
  --public \
  --songs "Amazing Grace" "How Great Thou Art" "Oceans" \
  --assignments '[{"person_id":"123","team_id":"10","position":"Worship Leader"}]' \
  --team-reminders '{"10": 7, "11": 3}'
```

This command:
1. Validates assignment JSON and reminder offsets, then looks up each song title in the church library (fails before creating anything if a title is missing or not unique)
2. Creates a plan with the specified title and series
3. Adds a service time, including `team_reminders` when provided
4. Adds the matched songs in order
5. Assigns team members with their positions
6. Returns `planning_center_url` from the plan resource (the Services web UI URL, not the API `links.self`)

## Important API Limitations

### Scheduling Email ("Accept/Decline") Not Supported

Planning Center's "Send scheduling email" button (the one that sends Accept/Decline links to team members) is **NOT available via the API**. This was confirmed by Planning Center in [planningcenter/developers#1475](https://github.com/planningcenter/developers/issues/1475).

**Workarounds:**

1. **Automated Reminders:** Use `team_reminders` when creating or updating plan times. This sends automated reminder emails to teams at a specified number of days before the service.

2. **Manual Sending:** After creating a plan via the CLI, use the returned `planning_center_url` to open the plan in the Planning Center web UI and manually send scheduling emails.

3. **Check Notification Status:** Use `plan-team-members notify-status` (or `list`) to see `notification_sent_at`, `prepare_notification`, and `notification_prepared_at` and who still needs the first scheduling email.

## Project layout

- `src/cli.ts` wires the command-line interface.
- `src/client.ts` contains the reusable Planning Center API client.
- `src/helpers.ts` maps CLI arguments and JSON:API resources.
- `src/config.ts` loads and validates environment configuration.
- `src/index.ts` exports library primitives for programmatic use.

## Publishing

Releases use [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) from GitHub Actions. There is no `NPM_TOKEN` secret. The workflow in `.github/workflows/publish.yml` authenticates with a short-lived OIDC token and publishes provenance automatically.

Merge this workflow to `main` before attaching the trusted publisher. npm matches the workflow filename on the default branch.

### One-time setup on npmjs.com

1. Sign in as the npm user `abimaelmartell` (the scope must match your npm username).
2. If the package does not exist yet, either:
   - Attach the trusted publisher below first (when npm offers that for an unpublished name), then push tag `v0.1.0`, or
   - Publish once from your machine so the package settings page exists:

   ```bash
   npm login
   npm run check
   npm test
   npm publish --access public
   ```

   After a local first publish of `0.1.0`, bump the version before using the tag workflow.

3. On [npmjs.com](https://www.npmjs.com/) open **@abimaelmartell/pco-cli → Settings → Trusted Publisher**.
4. Choose **GitHub Actions** and set:
   - Organization or user: `abimaelmartell`
   - Repository: `pco-cli`
   - Workflow filename: `publish.yml` (filename only, including `.yml`)
   - Environment name: leave blank
   - Allowed actions: `npm publish`
5. After a successful OIDC publish, optionally set **Publishing access** to require 2FA and disallow tokens.

You can do the same attach step from a local npm 11.5.1+ CLI:

```bash
npm trust github @abimaelmartell/pco-cli --repo abimaelmartell/pco-cli --file publish.yml --allow-publish
```

### Later releases

1. Bump `version` in `package.json` (and the lockfile) and merge to `main`.
2. Tag the merge commit to match that version and push the tag:

   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```

The Publish workflow runs `npm ci`, check, test, lint, then `npm publish --access public`. Do not set `NODE_AUTH_TOKEN` or `NPM_TOKEN` on that job.

Local dry run:

```bash
npm run check
npm run build
npm pack --dry-run
```
