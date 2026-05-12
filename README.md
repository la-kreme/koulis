# koulis-mcp

> Model Context Protocol server for the **Koulis** restaurant reservation API.

Lets AI agents (Claude, ChatGPT, Mistral Le Chat, etc.) search and book
restaurants in the Koulis network using natural language. Implements the
[MCP specification](https://modelcontextprotocol.io) and bridges to the
hosted Koulis API at `https://api.koulis.ai`.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node 20+](https://img.shields.io/badge/node-20+-blue.svg)

## What this is (and what it isn't)

This repository contains the **MCP server**: the protocol adapter that
exposes Koulis reservation primitives as tools to AI agents. It is a
thin client of the Koulis API — it does not store data, run business
logic, or hold restaurant inventory. All of that lives in the hosted
Koulis API.

You need an `KOULIS_API_TOKEN` to use this server in production. Get
one at [koulis.app](https://koulis.app).

## Tools exposed to the agent

| Tool | Purpose |
|---|---|
| `find_bookable_restaurant` | Search restaurants with available slots in a city and time window |
| `discover_slots` | List available slots for one restaurant |
| `book_reservation` | Confirm a reservation from a slot |

The MCP server intentionally exposes a **transaction-first** surface,
not a discovery-first one: the agent is expected to use its native
web search and reasoning to narrow down candidates, then use
`find_bookable_restaurant` only on the shortlist.

## Installation

### Claude Desktop / Cursor / any MCP-compatible client

Add to your client config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "koulis": {
      "command": "npx",
      "args": ["-y", "@koulis/mcp"],
      "env": {
        "KOULIS_API_TOKEN": "sk_..."
      }
    }
  }
}
```

Restart your MCP client. The Koulis tools become available to the agent.

### From source

```bash
git clone git@github.com:koulis-app/koulis-mcp.git
cd koulis-mcp
npm install
npm run build
KOULIS_API_TOKEN=sk_... node dist/index.js
```

## Configuration

| Env var | Required | Default | Description |
|---|---|---|---|
| `KOULIS_API_TOKEN` | yes | — | Bearer token for the Koulis API |
| `KOULIS_API_URL` | no | `https://api.koulis.ai` | Override for staging / self-hosted |

## How it fits together

┌─────────────────┐      stdio MCP       ┌──────────────┐      HTTPS      ┌────────────────┐
│   AI agent      │ ───────────────────▶ │  koulis-mcp  │ ──────────────▶ │  koulis-api    │
│ (Claude, etc.)  │                      │  (this repo) │                 │ (api.koulis.ai)│
└─────────────────┘                      └──────────────┘                 └────────────────┘

This server runs locally on the user's machine (stdio transport) or
remotely as an HTTP/SSE endpoint (deployed mode). Either way, it
authenticates to the hosted Koulis API with the user's token and
forwards typed requests.

## Related projects

- **[koulis-app/koulis.sdk_python](https://github.com/koulis-app/koulis.sdk_python)** — Python SDK for direct API access (consumers building backends, not MCP integrations)
- **[koulis.app](https://koulis.app)** — Hosted Koulis API, dashboard, restaurant onboarding
- **[lakreme.fr](https://lakreme.fr)** — The consumer-facing brunch directory powered by Koulis

## Development

```bash
npm install
npm run dev     # watch mode with tsx
npm test        # vitest suite
npm run build   # tsc compile to dist/
```

## Contributing

Issues and PRs welcome. Please open an issue first for substantial
changes so we can align on direction.

This server is intentionally minimal: business logic, data, and
inventory live in the Koulis API, not here. PRs that add discovery
features, restaurant data, or storage will be redirected to the API
layer (where they belong).

## License

MIT — see [LICENSE](./LICENSE).