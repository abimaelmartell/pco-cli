# pco-cli

Agent-friendly TypeScript CLI for the Planning Center API, intended for npm publishing.

Planning Center exposes APIs for products including Calendar, Check-Ins, Giving, Groups, People, and Services. This repository currently contains only the base CLI and client structure; endpoint-specific commands will be added later.

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

## Usage

```bash
npm run dev -- health
```

The CLI prints JSON so automation agents can parse output reliably.

## Project layout

- `src/cli.ts` wires the command-line interface.
- `src/client.ts` contains the reusable Planning Center API client.
- `src/config.ts` loads and validates environment configuration.
- `src/index.ts` exports library primitives for programmatic use.

## Publishing checklist

```bash
npm run check
npm run build
npm pack --dry-run
```
