# pco-cli

Agent-friendly TypeScript CLI for the Planning Center API, intended for npm publishing.

Planning Center exposes APIs for products including Calendar, Check-Ins, Giving, Groups, People, and Services. This CLI focuses on the **Services** product for worship planning workflows.

## Install

```bash
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and set credentials:

```bash
cp .env.example .env
```

Supported authentication inputs:

- `PCO_ACCESS_TOKEN` for bearer token flows.
- `PCO_APP_ID` and `PCO_SECRET` for basic auth flows.

You can also pass credentials via CLI flags: `--access-token`, `--app-id`, and `--secret`.

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

# Create a plan with optional service time
pco plans create <service-type-id> \
  --title "Sunday Worship" \
  --series-title "Summer Series" \
  --public \
  --starts-at "2026-08-30T10:00:00Z" \
  --ends-at "2026-08-30T11:30:00Z"
```

### Plan Items (Songs)

Add songs to a plan:

```bash
# List items in a plan
pco plan-items list <service-type-id> <plan-id>

# Add a song by ID
pco plan-items add-song <service-type-id> <plan-id> --song-id <song-id>

# Add a song by title (must match exactly one song)
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

# See who still needs the first Accept/Decline scheduling email
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
pco plan-reminders set <service-type-id> <plan-id> <plan-time-id> \
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

Planning Center's "Send scheduling email" button (the one that sends Accept/Decline links to team members) is **NOT available via the API**. This was confirmed by Planning Center in [planningcenteronline/developers#1475](https://github.com/planningcenteronline/developers/discussions/1475).

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

## Publishing checklist

```bash
npm run check
npm run build
npm pack --dry-run
```
