---
name: pco-cli
description: Use the pco CLI (@abimaelmartell/pco-cli) to plan worship services in Planning Center Services. Use when creating or listing service plans, searching or creating songs, adding arrangement keys, tagging songs, assigning teams, setting reminders, building a setlist with keys and musicians, or when the user mentions Planning Center, PCO, or pco-cli.
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

`songs create`, `keys create`, and `plan-items add-song --key-id` need `@abimaelmartell/pco-cli@0.1.2` or later. If `pco keys --help` is unknown, upgrade or use this repository (`npm run build && npm link`).

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

Expect `"auth": "basic"` (client id + secret) or `"auth": "bearer"` (access token). `"auth": "none"` means credentials were not loaded; stop and fix that before mutating anything. `"version"` is the installed CLI version.

## Operating rules

1. Run `pco health` first in a session if auth has not been confirmed.
2. Look up IDs before mutating. Typical order: `service-types list` → `songs search` / `people search` / `teams list` → create or assign. For tags, `tag-groups list --tags-for song --include tags` then `songs assign-tags` (the API **replaces** the full tag set).
3. Keys belong to an **arrangement**, not the song. After `songs create`, run `arrangements list <song-id>` (often a Default arrangement exists) before `keys list` / `keys create`.
4. If the user gives **songs with keys** (and usually musicians), do **not** use `create-worship-plan` to add items. That composite POSTs `song_id` and `title` (PCO default arrangement/key). Follow **Worship plan with keys and musicians** below.
5. Use `create-worship-plan` only when songs are titles with **no** required keys and you want fail-closed title resolution before the plan exists.
6. Treat stdout JSON as the source of truth. On failure, stderr is JSON with `"ok": false`. Composite commands may include `"partial"` with whatever was created.
7. `--starts-at` / `--ends-at` must be ISO 8601 **with a timezone** (example `2026-08-30T10:00:00Z`). `--ends-at` requires `--starts-at` and must be later.
8. Song titles and people names must resolve to **exactly one** match. If search returns 0 or 2+, stop and ask; do not pick the first row.
9. `--starting-key` must be a Planning Center value (`C`, `G`, `F#`, `Eb`, `Cm`, `Am`, …). Do not send `G major` or `key of G`.
10. You cannot send Planning Center's Accept/Decline scheduling email via the API. After `plan-team-members assign`, use `plan-reminders set` and `plan-team-members notify-status`. Return `planning_center_url` from `plans get`.

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
| Keys | `pco keys list <song-id> <arrangement-id>` / `pco keys create <song-id> <arrangement-id> --starting-key G` |
| Tag groups | `pco tag-groups list --tags-for song` / `pco tag-groups tags <tag-group-id>` |
| People | `pco people search "<name>"` |
| Teams | `pco teams list <service-type-id>` |
| Team positions | `pco teams positions <team-id>` |
| List plans | `pco plans list <service-type-id> [--filter future] [--order sort_date]` |
| Get plan | `pco plans get <service-type-id> <plan-id>` |
| Create plan | `pco plans create <service-type-id> --title "..." [--series-title "..."] [--public] [--starts-at "..."] [--ends-at "..."] [--time-type service]` |
| Plan times | `pco plan-times list <service-type-id> <plan-id>` |
| Plan items | `pco plan-items list <service-type-id> <plan-id>` |
| Add song | `pco plan-items add-song <service-type-id> <plan-id> --song-id <id> [--arrangement-id <id>] [--key-id <id>]` (or `--title "<exact title>"` instead of `--song-id`; `--title` cannot select a key) |
| Team members | `pco plan-team-members list <service-type-id> <plan-id>` |
| Who needs first email | `pco plan-team-members notify-status <service-type-id> <plan-id>` |
| Assign person | `pco plan-team-members assign <service-type-id> <plan-id> <person-id> <team-id> [--position "Worship Leader"] [--prepare-notification]` |
| Reminders | `pco plan-reminders set <service-type-id> <plan-time-id> --team-reminders '{"<team-id>": 7}'` |
| Full service (titles only) | `pco create-worship-plan <service-type-id> --title "..." --starts-at "..." [options]` — do **not** use this when the user named keys |

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

`--songs` is resolved **before** `plans create`. A missing or ambiguous title fails with no plan created. Added items POST `song_id` and `title` (PCO default arrangement/key). If the user named keys, skip this command and follow the playbook below.

## Typical flows

### Worship plan with keys and musicians (default)

Use this when the user gives songs **with keys** and people to schedule. Keep using composable commands.

1. `pco health` — stop if `"auth": "none"`.
2. Resolve the service type: `pco service-types list`. Match `attributes.name` in JSON. Need **one** `id`.
3. Resolve teams: `pco teams list <service-type-id>`. For a named position, `pco teams positions <team-id>`.
4. Resolve each person: `pco people search "..."`. Require exactly one match; store `id`.
5. For **each** song + requested key, in setlist order:
   - `pco songs search "..."` — 0 hits → `pco songs create --title "..."`; 2+ hits → stop.
   - `pco arrangements list <song-id>` — use Default unless the user named another arrangement; 0 rows → `pco arrangements create <song-id> --name Default`.
   - `pco keys list <song-id> <arrangement-id>` — match `attributes.starting_key` to the requested PCO key.
   - If that key is missing: `pco keys create <song-id> <arrangement-id> --starting-key G` (use the user's key). Capture the new `id`.
6. Create the plan **after** songs/keys resolve:

```bash
pco plans create <service-type-id> --title "Sunday Morning" --starts-at 2026-08-30T10:00:00Z
```

Capture `data.id` (plan) and `plan_time.id` (needed for reminders).

7. Add items **in order**, each with the resolved key:

```bash
pco plan-items add-song <service-type-id> <plan-id> \
  --song-id <song-id> \
  --arrangement-id <arrangement-id> \
  --key-id <key-id>
```

8. Assign people:

```bash
pco plan-team-members assign <service-type-id> <plan-id> <person-id> <team-id> \
  --position "Acoustic Guitar"
```

9. Optional reminders (days before the service time, 0–7):

```bash
pco plan-reminders set <service-type-id> <plan-time-id> \
  --team-reminders '{"<team-id>": 7}'
```

10. Return JSON ids plus `pco plans get <service-type-id> <plan-id>` → `planning_center_url`.

If a later step fails, report `"partial"`: plan id, items already added, assignments already made. Do not silently retry `plans create`.

### Inspect or update an existing plan

`plans get`, `plan-items list`, `plan-team-members list`, `plan-team-members notify-status`.

## Limitations

Planning Center cannot send the in-app **Accept/Decline scheduling email** through the API ([planningcenter/developers#1475](https://github.com/planningcenter/developers/issues/1475)).

Workarounds:

1. `team_reminders` on create/update plan times (automated reminder emails)
2. Give the user `planning_center_url` to send scheduling emails in the UI
3. `plan-team-members notify-status` for `notification_sent_at` / `needs_scheduling_email`

## Errors

- Missing/invalid auth: fix env or `~/.config/pco/env`, then `pco health`
- Conflicting client id vs app id: keep one, or set them to the same value
- Song title or person name not unique or not found: stop and ask; do not pick the first row. For songs, pass `--song-id` after the user chooses.
- Partial create: read `partial` in the error JSON; do not assume the plan is absent; resume with composable commands using IDs already returned
