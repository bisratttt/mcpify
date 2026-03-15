# mcpify

> Turn any API docs into an MCP server — on demand, without clogging your context.

## What it does

**mcpify** takes a developer documentation URL, extracts API definitions, and generates a queryable MCP (Model Context Protocol) server backed by a local index. Tools are served lazily — only what's needed is loaded into context.

## How it works

1. **Ingest** — Point mcpify at a docs page (e.g. `https://docs.stripe.com/api`)
2. **Extract** — Crawls and parses API endpoints, parameters, and descriptions
3. **Index** — Stores structured API definitions in a local DB
4. **Serve** — Exposes an MCP server that surfaces tools on demand

## Status

Early development. Contributions welcome.

## License

MIT
