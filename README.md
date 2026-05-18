# Koulis MCP

The open restaurant reservations protocol for AI agents. A neutral aggregation layer between LLMs and reservation systems, starting with indie restaurants in France.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)
![MCP](https://img.shields.io/badge/MCP-2025--11--25-green.svg)
![Node 22+](https://img.shields.io/badge/node-22+-blue.svg)
[![smithery badge](https://smithery.ai/badge/koulis/koulis)](https://smithery.ai/servers/koulis/koulis)

## What is Koulis MCP

Koulis MCP is an [MCP server](https://modelcontextprotocol.io) that lets AI agents search, hold, and confirm restaurant reservations through natural conversation. It bridges LLMs (Claude, GPT, Mistral Le Chat) to the Koulis booking inventory — a live catalog of restaurants with real-time slot availability.

The server is a thin protocol adapter. It does not store data, run business logic, or hold restaurant inventory. All of that lives in the hosted Koulis API at `api.koulis.ai`. Koulis-MCP is the technology behind [Koulis](https://koulis.ai).

## Quick start

### Remote (HTTP) — Claude.ai, Le Chat, any MCP-over-HTTP client

The server is deployed at `mcp.koulis.ai`. Point your MCP client to:

```
https://mcp.koulis.ai/mcp
```

No local installation required. The server accepts Streamable HTTP transport (MCP 2025-11-25).

Authentication is handled via **OAuth 2.1** — the server returns `401` with a `WWW-Authenticate` header pointing to the authorization server. Spec-compliant MCP clients (Claude.ai, etc.) handle the OAuth flow automatically.

### Local (stdio) — Claude Desktop, Cursor, Windsurf

Requires an API token. API key self-service is not yet available — contact [hello@koulis.app](mailto:hello@koulis.app) to request one.

Add to your client config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "koulis": {
      "command": "npx",
      "args": ["-y", "koulis"],
      "env": {
        "KOULIS_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

Restart your client. The four Koulis tools appear in the agent's toolbox.

### From source

```bash
git clone https://github.com/la-kreme/koulis.git
cd koulis
npm install
cp .env.example .env   # add your KOULIS_API_TOKEN
npm run dev:http        # HTTP server on port 3000
# or
npm run dev:stdio       # stdio for Claude Desktop
```

## Tools

The server exposes a 2-step booking flow designed for safe, user-confirmed reservations.

| Tool | Step | Purpose |
|---|---|---|
| `find_bookable_restaurant` | Discovery | Search restaurants with available slots by city, date, party size. Supports cuisine and dietary filters. |
| `discover_slots` | Discovery | List all available time slots for a specific restaurant within a +/-2h window. |
| `propose_reservation` | Booking (1/2) | Create a 5-minute hold on a slot. Reversible — expires automatically if not confirmed. |
| `confirm_reservation` | Booking (2/2) | Finalize the reservation. Irreversible. Requires explicit user consent and customer details. |

The 2-step flow is intentional: `propose_reservation` holds the slot without commitment, giving the user time to review and confirm. The agent is instructed to never call `confirm_reservation` without an explicit "yes" from the user.

### Datetime handling

All slot times are returned as `LocalizedDateTime` objects with pre-formatted fields:

```json
{
  "iso_utc": "2026-05-14T19:00:00.000Z",
  "local_date": "2026-05-14",
  "local_time": "21:00",
  "local_datetime": "2026-05-14T21:00:00+02:00",
  "timezone": "Europe/Paris",
  "human_readable_fr": "mercredi 14 mai à 21h00",
  "human_readable_en": "Wednesday, May 14 at 9:00 PM"
}
```

Agents display `human_readable_fr` (or `_en`) to users and pass `iso_utc` to booking calls. No timezone conversion needed.

## Authentication

The HTTP transport uses **OAuth 2.1** via [WorkOS AuthKit](https://workos.com/docs/authkit/mcp) as the authorization server.

### How it works

1. Client sends a request to `/mcp` without a token
2. Server returns `401 Unauthorized` with `WWW-Authenticate: Bearer resource_metadata="https://mcp.koulis.ai/.well-known/oauth-protected-resource"`
3. Client fetches the protected resource metadata to discover the authorization server
4. OAuth 2.1 flow (PKCE, authorization code) proceeds via WorkOS AuthKit
5. Client retries with the issued Bearer token

### Well-known endpoints

| Path | Description |
|---|---|
| `/.well-known/oauth-protected-resource` | RFC 9728 Protected Resource Metadata |
| `/.well-known/oauth-authorization-server` | Authorization Server Metadata (proxy to WorkOS) |
| `/.well-known/mcp/server-card.json` | MCP server card for registry discovery |

### Token verification

Access tokens are verified via JWKS from WorkOS. The server validates the `issuer` and `audience` claims to ensure tokens are specifically issued for `https://mcp.koulis.ai`.

The stdio transport does not use OAuth — it authenticates via `KOULIS_API_TOKEN` in the environment.

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `KOULIS_API_TOKEN` | Yes | — | Bearer token for the Koulis API |
| `KOULIS_API_URL` | No | `https://api.koulis.ai` | API base URL |
| `PORT` | No | `3000` | HTTP server port |
| `RATE_LIMIT_MAX` | No | `60` | Max requests per window per IP |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window in milliseconds |
| `WORKOS_DOMAIN` | No | — | WorkOS AuthKit domain (required for HTTP OAuth) |
| `MCP_RESOURCE_URL` | No | `https://mcp.koulis.ai` | Canonical resource URL for token audience validation |
| `DEBUG` | No | — | Set to `koulis-mcp` for verbose logging |

## Architecture

```
┌──────────────┐     HTTP or stdio      ┌──────────────┐      HTTPS       ┌────────────────┐
│   AI agent   │ ────────────────────▶  │  koulis-mcp  │ ──────────────▶  │  Koulis API    │
│ (Claude, …)  │     MCP protocol       │  (this repo) │                  │ api.koulis.ai  │
└──────────────┘                        └──────────────┘                  └────────────────┘
                                               │
                                               │ JWT verification (JWKS)
                                               ▼
                                        ┌──────────────┐
                                        │   WorkOS     │
                                        │   AuthKit    │
                                        └──────────────┘
```

```
src/
├── index.ts                  # Default entry (HTTP)
├── server.ts                 # Transport-agnostic McpServer factory
├── transports/
│   ├── http.ts               # Hono + WebStandardStreamableHTTPServerTransport
│   └── stdio.ts              # Stdio for Claude Desktop
├── tools/
│   ├── index.ts              # Barrel re-export
│   ├── helpers.ts            # jsonContent, handleApiError
│   ├── find-bookable-restaurant.ts
│   ├── discover-slots.ts
│   ├── propose-reservation.ts
│   └── confirm-reservation.ts
├── lib/
│   ├── api-client.ts         # HTTP client with retry + timeout
│   ├── auth.ts               # OAuth 2.1 token verification (WorkOS JWKS)
│   ├── errors.ts             # Standardized error codes
│   └── rate-limit.ts         # In-memory IP rate limiter
├── mappers/
│   └── restaurantToMcp.ts    # Restaurant model → MCP summary
└── types/
    ├── api.ts                # Koulis API response types
    ├── mcp.ts                # RestaurantSummary
    ├── restaurant.ts         # Full restaurant model (mirrors DB schema)
    ├── tool.ts               # ToolDefinition, ToolContext
    └── schemas.ts            # Shared Zod schemas (LocalizedDateTime)
```

The server factory (`server.ts`) is transport-agnostic. It receives an `apiClient` via dependency injection and registers all tools in a loop. Both HTTP and stdio entries are thin wrappers around this factory.

### HTTP transport

- Hono + `WebStandardStreamableHTTPServerTransport` (MCP SDK 1.29)
- Stateless: one `McpServer` instance per request, no session management
- OAuth 2.1 via WorkOS AuthKit — all `/mcp` requests require a valid Bearer token
- CORS enabled on `/mcp` for cross-origin clients
- Rate limiting per IP on `/mcp` (configurable, in-memory)
- `GET /health` returns `{ status, version, uptime_seconds }`

### Structured output

All tools define a Zod `outputSchema`. Success responses include both:
- `content[0].text`: JSON string (LLM retrocompat)
- `structuredContent`: native object (SDK clients)

Errors use standardized codes (`restaurant_not_found`, `hold_expired`, `upstream_timeout`, etc.) in a consistent `{ error: { code, message } }` envelope.

## Development

```bash
npm install
npm run dev:http          # HTTP server with hot reload
npm run dev:stdio         # stdio server with hot reload
npm run inspect           # MCP Inspector (interactive tool testing)
npm test                  # 162 tests
npm run typecheck         # tsc --noEmit
npm run lint              # eslint
```

Test coverage thresholds: 80% statements, branches, functions, and lines.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/mcp` | MCP Streamable HTTP endpoint (Bearer token required) |
| `GET` | `/mcp` | SSE stream (Bearer token required) |
| `DELETE` | `/mcp` | Session termination (Bearer token required) |
| `GET` | `/health` | Healthcheck (no auth, no rate limit) |
| `GET` | `/.well-known/oauth-protected-resource` | RFC 9728 Protected Resource Metadata |
| `GET` | `/.well-known/oauth-authorization-server` | Authorization Server Metadata (proxy) |
| `GET` | `/.well-known/mcp/server-card.json` | MCP server card |

## Related projects

- [koulis.ai](https://koulis.ai) — Hosted Koulis API, dashboard, restaurant onboarding
- [lakreme.fr](https://lakreme.fr) — The consumer-facing brunch directory (~1,700 restaurants in France)

## Contributing

Issues and PRs welcome. Please open an issue first for substantial changes.

This server is intentionally minimal: business logic, data, and inventory live in the Koulis API, not here. PRs that add discovery features, restaurant data, or storage will be redirected to the API layer.

## License

MIT — see [LICENSE](./LICENSE).

---

Built in France by [La Kreme](https://lakreme.fr).
