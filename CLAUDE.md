# mcpify — project context for Claude

## README maintenance

After any change that affects user-facing behaviour, **always update README.md** to reflect the current state. Do not wait to be asked.

Sections to keep in sync:

- **"Why 2 tools, not 500"** — reflects the actual generated tool count from `src/generator/server-template.ts`
- **Supported input formats table** — mirrors the parsers in `src/parsers/`
- **CLI flags** — must match the actual options in `src/cli.ts`
- **Embeddings section** — lists all providers in `EmbeddingProvider` (`src/types.ts`) with accurate setup instructions and the correct default
- **Generated server structure** — reflects what `src/generator/index.ts` actually writes to disk

Rules:
- Keep the playful tone ("Your API spec walked in. An MCP server walked out.")
- Describe current state only — no changelogs, no "what's new" sections
- Only update sections that are out of date; leave accurate ones alone

## Architecture

- **2-tool generated servers**: every generated MCP server exposes exactly `search_api_docs` (semantic search) and `call_api` (dynamic HTTP executor). Never go back to one-tool-per-endpoint.
- **Embedding providers**: `local` (Qwen3-Embedding-0.6B, default, no API key), `openai`, `ollama`. `local` must always remain the default.
- **SQLite via `node:sqlite`** (built-in, Node 22+). No native addons — do not reintroduce `better-sqlite3` or `sqlite-vec`.
- **`isQuery` flag on `embed()`**: endpoints are indexed as documents (no prefix), search queries use the Qwen3 instruct prefix. Preserve this distinction.

## Testing

- Run `npm test` after every change
- Tests live in `tests/` mirroring `src/` structure with fixtures in `tests/fixtures/`
- The indexer tests mock `src/indexer/embed.js` — do not make real embedding API calls in tests
