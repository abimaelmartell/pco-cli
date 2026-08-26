---
name: pco-cli
description: Use the pco CLI (@abimaelmartell/pco-cli) to plan worship services in Planning Center Services. Use when creating or listing service plans, searching or creating songs, adding arrangement keys, tagging songs, assigning teams, setting reminders, or when the user mentions Planning Center, PCO, or pco-cli.
---

# pco-cli

Agent-friendly CLI for the Planning Center **Services** API. Commands print JSON. Parse stdout; never scrape text.

Package: `@abimaelmartell/pco-cli`. Binaries: `pco` and `pco-cli`.

This skill is for **calling** the CLI. If you are changing this repository's TypeScript, follow `AGENTS.md` instead.

## When to use

- Create or inspect a Sunday/worship service plan
- Search, create, or edit songs in the church library
- Add arrangement keys or assign song/arrangement tags
- Search the people directory
- Assign people to teams/positions on a plan
- Set reminder emails or check who still needs a scheduling email
- The user says Planning Center, PCO, service type, plan items, or team reminders

## Setup

Prefer a global install so `pco` is on `PATH`:

```bash
npm install -g @abimaelmartell/pco-cli
pco health
```

If `pco` is not on `PATH`, run the same commands with `npx --yes @abimaelmartell/pco-cli` in place of `pco`.

### Credentials

Do **not** hard-code secrets in commands, commits, or chat logs.

Planning Center personal access tokens are labeled **Client ID + Secret**:

- `PCO_CLIENT_ID` + `PCO_SECRET` → basic auth
- `PCO_APP_ID` is an alias of `PCO_CLIENT_ID` (error if both are set to different values)
- `PCO_ACCESS_TOKEN` → bearer auth (wins over basic auth)

Resolution: CLI flags, then environment, then project `.env`, then `~/.config/pco/env` (`$XDG_CONFIG_HOME/pco/env`, or `PCO_CONFIG_PATH`). Flags: `--client-id` (alias `--app-id`), `--secret`, `--access-token`.

Store credentials once so you do not pass flags on every command:

```bash
mkdir -p ~/.config/pco
cat > ~/.config/pco/env <<'EOF'
PCO_CLIENT_ID=...
PCO_SECRET=...
EOF
```

Then verify:

```bash
pco health
```

Expect `"auth": "basic"` (client id + secret) or `"auth": "bearer"` (access token). `"auth": "none"` means credentials were not loaded; stop and fix that before mutating anything.

## Operating rules

1. Run `pco health` first in a session if auth has not been confirmed.
2. Look up IDs before mutating. Typical order: `service-types list` → `songs search` / `people search` / `teams list` → create or assign. For tags, `tag-groups list --tags-for song --include tags` then `songs assign-tags` (the API **replaces** the full tag set).
3. Keys belong to an **arrangement**. After `songs create`, run `arrangements list <song-id>` (often a Default arrangement exists) before `keys create`.
4. Prefer `create-worship-plan` when the user wants a full service (songs + assignments + reminders). It resolves songs **before** creating the plan and fails closed if a title is missing or not unique.
5. Use composable commands for inspect/update of an existing plan.
6. Treat stdout JSON as the source of truth. On failure, stderr is JSON with `"ok": false`. Composite commands may include `"partial"` with whatever was created.
7. `--starts-at` / `--ends-at` must be ISO 8601 **with a timezone** (example `2026-08-30T10:00:00Z`). `--ends-at` requires `--starts-at` and must be later.
8. Song add-by-title and `create-worship-plan --songs` require **exactly one** library match for that title.
9. You cannot send Planning Center's Accept/Decline scheduling email via the API. Do not invent a command for it.

## Commands

Pagination on list/search commands: `--per-page` (default 25) and `--offset`.

| Goal | Command |
| --- | --- |
| Config check | `pco health` |
| Service types | `pco service-types list` |
| Songs | `pco songs search "<title>"` |
| Get/create/update song | `pco songs get` / `create` / `update` |
| Song tags | `pco songs tags <song-id>` / `pco songs assign-tags <song-id> --tag-ids 5,9` |
| Arrangements | `pco arrangements list <song-id>` (`--include keys`) |
| Create/update arrangement | `pco arrangements create` / `update` |
| Arrangement tags | `pco arrangements assign-tags <song-id> <arrangement-id> --tag-ids 12` |
| Keys | `pco keys list \| create <song-id> <arrangement-id> --starting-key G` |
| Tag groups | `pco tag-groups list --tags-for song` / `pco tag-groups tags <tag-group-id>` |
| People | `pco people search "<name>"` |
| Teams | `pco teams list <service-type-id>` |
| Team positions | `pco teams positions <team-id>` |
| List plans | `pco plans list <service-type-id> [--filter future] [--order sort_date]` |
| Get plan | `pco plans get <service-type-id> <plan-id>` |
| Create plan | `pco plans create <service-type-id> --title "..." [--series-title "..."] [--public] [--starts-at "..."] [--ends-at "..."] [--time-type service]` |
| Plan times | `pco plan-times list <service-type-id> <plan-id>` |
| Plan items | `pco plan-items list <service-type-id> <plan-id>` |
| Add song | `pco plan-items add-song <service-type-id> <plan-id> (--song-id <id> \| --title "<exact title>")` |
| Team members | `pco plan-team-members list <service-type-id> <plan-id>` |
| Who needs first email | `pco plan-team-members notify-status <service-type-id> <plan-id>` |
| Assign person | `pco plan-team-members assign <service-type-id> <plan-id> <person-id> <team-id> [--position "Worship Leader"] [--prepare-notification]` |
| Reminders | `pco plan-reminders set <service-type-id> <plan-time-id> --team-reminders '{"<team-id>": 7}'` |
| Full service | `pco create-worship-plan <service-type-id> --title "..." --starts-at "..." [options]` |

`--time-type` is `service`, `rehearsal`, or `other` (default `service`). `--team-reminders` values are integers **0–7** (days before the service time).

### `create-worship-plan`

```bash
pco create-worship-plan <service-type-id> \
  --title "Sunday Morning Service" \
  --starts-at "2026-08-30T10:00:00Z" \
  --ends-at "2026-08-30T11:30:00Z" \
  --series-title "Summer Worship" \
  --public \
  --songs "Amazing Grace" "How Great Thou Art" \
  --assignments '[{"person_id":"123","team_id":"10","position":"Worship Leader"}]' \
  --team-reminders '{"10": 7, "11": 3}'
```

`--assignments` is a JSON array of `{ "person_id", "team_id", "position?", "prepare_notification?" }`.

Success JSON includes `plan`, `plan_time`, `songs`, `assignments`, and `planning_center_url` (Services **web UI** URL, not the API `links.self`). Open that URL when the user needs to send Accept/Decline emails by hand.

## Limitations

Planning Center cannot send the in-app **Accept/Decline scheduling email** through the API ([planningcenter/developers#1475](https://github.com/planningcenter/developers/issues/1475)).

Workarounds:

1. `team_reminders` on create/update plan times (automated reminder emails)
2. Give the user `planning_center_url` to send scheduling emails in the UI
3. `plan-team-members notify-status` for `notification_sent_at` / `needs_scheduling_email`

## Errors

- Missing/invalid auth: fix env or `~/.config/pco/env`, then `pco health`
- Conflicting client id vs app id: keep one, or set them to the same value
- Song title not unique or not found: search, then pass `--song-id` (or pick a unique title)
- Partial create: read `partial` in the error JSON; do not assume the plan is absent; resume with composable commands using IDs already returned
