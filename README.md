# build-mcp

> Your API spec walked in. An MCP server walked out.

**build-mcp** turns any API spec into a production-ready [MCP](https://modelcontextprotocol.io) server in one command. Point it at an OpenAPI file, a Postman collection, a HAR capture, or a GraphQL schema — and get a fully working MCP server with semantic search, pre-call validation, and smart response trimming.

No boilerplate. No copy-pasting. No accidental charges. Just tools.

```bash
npx build-mcp convert ./stripe-openapi.yaml -o ./stripe-mcp
cd stripe-mcp && npm install && npm start
```

That's it. Your agent can now search and call the entire Stripe API.

---

## The problem with naive API → MCP conversion

The obvious approach — one MCP tool per endpoint — falls apart fast.

Connect an agent to an API with 200 endpoints and 200 tool schemas land in context before the agent asks anything. Connect it to 10 APIs and you've built a context bonfire. Cursor has a hard cap of 40 tools. One busy MCP server can eat 70%+ of your context window before your agent says hello.

**build-mcp generates exactly 2 tools, no matter the API size:**

| Tool | What it does |
|---|---|
| `search_docs` | Semantic search over all endpoints — returns IDs, safety badges, param types, and body fields on demand |
| `call_api` | Validates params, then executes any endpoint by ID — returns trimmed, agent-readable output |

The agent searches first, gets back exactly what it needs, then calls. Context stays clean whether the API has 10 endpoints or 10,000. And since every generated server has the same two tool names, MCP clients namespace by server — so `stripe-api › search_docs` and `jira › search_docs` never collide.

---

## Features

### Semantic search — find the right endpoint without knowing its name

Every endpoint is embedded with [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) at conversion time and stored in a local SQLite index. At runtime, `search_docs` does vector similarity search — so "charge a customer" finds `POST /v1/charges` even if the agent doesn't know the exact endpoint name.

No API key required. Runs entirely on your machine.

### Safety classification — agents know what they're about to do

Every endpoint is automatically classified and badged in search results:

| Badge | Meaning |
|---|---|
| *(none)* | Safe read — GET / HEAD / OPTIONS |
| `[WRITE]` | State-mutating — POST / PUT / PATCH |
| `⚠️ DESTRUCTIVE` | Irreversible — DELETE, cancel, revoke, purge, archive |
| `💸 BILLABLE` | Costs money or fires side effects — charges, payments, SMS / email sends |

The agent sees these badges before deciding what to call. A charge endpoint never looks the same as a list endpoint.

### Pre-call validation — catch mistakes before they hit the API

Before any HTTP request leaves the machine, `call_api` validates the agent's params against the spec:

- Missing required params → rejected with a plain-English error
- Wrong enum value → lists the valid options
- Wrong type (string where integer expected, etc.) → caught immediately

No wasted API calls. No cryptic 400 responses to debug.

### Smart response trimming — large responses don't wreck context

API responses can be enormous. The generated server automatically summarizes:

- **Paginated lists** (`{ data: [...], has_more }`) — count, first + last item, pagination hint
- **Top-level arrays** — count and first item, notes how many are hidden
- **Large arbitrary objects** — structural summary of top-level keys
- **Anything under 8KB** — returned as-is, untouched

### Works with every spec format

| Format | Notes |
|---|---|
| OpenAPI 3.x (JSON or YAML) | Full $ref dereferencing, handles Stripe-scale specs |
| Swagger 2.x (JSON or YAML) | Complete v2 support |
| Postman Collection v2.1 | Any file extension, including `.txt` |
| HAR (HTTP Archive) | Captured traffic → MCP server |
| GraphQL Schema | Queries and mutations become tools |

---

## Quick start

```bash
# Install globally
npm install -g build-mcp

# Or just run with npx
npx build-mcp convert ./openapi.yaml -o ./my-api-mcp
```

```bash
# Preview what build-mcp sees before converting
build-mcp inspect ./openapi.yaml

# Convert with local embeddings (default — no API key needed)
build-mcp convert ./openapi.yaml -o ./my-api-mcp

# Convert from a remote spec URL
build-mcp convert https://petstore3.swagger.io/api/v3/openapi.json -o ./petstore-mcp

# Use OpenAI embeddings
build-mcp convert ./openapi.yaml -o ./my-api-mcp --embedding-provider openai

# Use Ollama
build-mcp convert ./openapi.yaml -o ./my-api-mcp --embedding-provider ollama
```

### Run the generated server

```bash
cd my-api-mcp
npm install
cp .env.example .env   # fill in your API credentials
npm start
```

### Add it to Claude Desktop

```json
{
  "mcpServers": {
    "stripe-api": {
      "command": "node",
      "args": ["/path/to/stripe-mcp/node_modules/.bin/tsx", "/path/to/stripe-mcp/src/server.ts"]
    }
  }
}
```

---

## Let your agent run build-mcp directly

build-mcp is itself an MCP server — so an AI agent can convert specs without dropping to a shell.

```json
{
  "mcpServers": {
    "build-mcp": {
      "command": "npx",
      "args": ["build-mcp", "mcp"]
    }
  }
}
```

Tools exposed to the agent:

- **`inspect_spec`** — parse a spec and return a summary of endpoints, auth, and format
- **`convert_spec`** — full conversion: parse → embed → index → generate, returns the output path and required env vars

---

## Use as a library

```typescript
import { parseSpec, generateMcpServer } from 'build-mcp';

const spec = await parseSpec('./openapi.yaml');
const result = await generateMcpServer(spec, {
  outputDir: './my-api-mcp',
  // embeddingProvider: 'local' is the default — no API key needed
});

console.log(`Indexed ${result.endpointsIndexed} endpoints`);
console.log('Set these env vars:', result.envVars.map(v => v.name));
```

---

## What gets generated

```
my-api-mcp/
├── src/
│   └── server.ts        # 2-tool MCP server (search_docs + call_api)
├── db/
│   └── api.sqlite       # Pre-built semantic search index
├── .env.example         # Required auth credentials
├── package.json
├── tsconfig.json
└── README.md
```

---

## Embedding providers

Search is powered by vector similarity. Three providers — the default needs nothing installed.

### Local — Qwen3-Embedding-0.6B (default)

No API key. No external service. ~614MB download on first use, cached to `~/.cache/huggingface/`. Subsequent runs are instant.

```bash
build-mcp convert ./spec.yaml -o ./output
# that's it — embeddings run locally
```

Uses [`onnx-community/Qwen3-Embedding-0.6B-ONNX`](https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX) via `@huggingface/transformers`. 1024-dim, q8 quantized, last-token pooling.

### OpenAI

```bash
export OPENAI_API_KEY=sk-...
build-mcp convert ./spec.yaml -o ./output --embedding-provider openai
```

### Ollama

```bash
ollama pull nomic-embed-text
build-mcp convert ./spec.yaml -o ./output --embedding-provider ollama
```

---

## Contributing

Early days — pull requests, issues, and ideas are all welcome. Check [issues](https://github.com/bisratttt/build-mcp/issues) for what's cooking.

## License

MIT
