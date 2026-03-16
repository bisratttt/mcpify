# mcpify

> Your API spec walked in. An MCP server walked out.

**mcpify** converts API specs into fully working [MCP](https://modelcontextprotocol.io) servers — complete with one tool per endpoint, a RAG-powered search tool backed by SQLite, and auto-extracted auth config. Feed it a spec, point an AI agent at the output, and get to work.

No boilerplate. No copy-pasting curl examples. Just tools.

## What it does

1. **Parse** your spec (OpenAPI 2/3, Postman, HAR, GraphQL)
2. **Index** every endpoint into a local SQLite database with vector embeddings
3. **Generate** a self-contained TypeScript MCP server with:
   - One tool per API endpoint, input schema derived from the spec
   - A `search_api_docs` tool for RAG-powered endpoint discovery
   - A `.env.example` listing every auth credential the API needs
4. **Run** the server — your AI agent can now call any endpoint directly

The `search_api_docs` tool means the agent never has to load your entire API into context. It searches, finds what it needs, then calls it. Clean context, useful tools.

## Supported input formats

| Format | Example |
|---|---|
| OpenAPI 3.x (JSON or YAML) | `openapi.yaml`, `https://api.example.com/openapi.json` |
| Swagger 2.x (JSON or YAML) | `swagger.json` |
| Postman Collection v2.1 | `collection.json` |
| HAR (HTTP Archive) | `captured.har` |
| GraphQL Schema | `schema.graphql` |

## Installation

```bash
npm install -g mcpify
```

Or run directly:

```bash
npx mcpify convert ./openapi.yaml -o ./my-api-mcp
```

## Usage

### CLI

```bash
# Preview what mcpify sees in a spec
mcpify inspect ./openapi.yaml

# Convert to a working MCP server
mcpify convert ./openapi.yaml -o ./my-api-mcp

# Use a remote spec
mcpify convert https://petstore3.swagger.io/api/v3/openapi.json -o ./petstore-mcp

# Use Ollama for embeddings instead of OpenAI
mcpify convert ./openapi.yaml -o ./my-api-mcp --embedding-provider ollama
```

### As an MCP server (for AI agents)

mcpify itself is an MCP server — so your AI agent can call it directly without dropping to a shell.

Add to your MCP config:

```json
{
  "mcpServers": {
    "mcpify": {
      "command": "npx",
      "args": ["mcpify", "mcp"]
    }
  }
}
```

Available tools:

- **`inspect_spec`** — parse a spec and return a summary of endpoints, auth, and format
- **`convert_spec`** — full conversion: parse → index → generate MCP server, returns output path and required env vars

### As a library

```typescript
import { parseSpec, generateMcpServer } from 'mcpify';

const spec = await parseSpec('./openapi.yaml');
const result = await generateMcpServer(spec, {
  outputDir: './my-api-mcp',
  embeddingProvider: 'openai',
});

console.log(`Generated ${result.endpointsIndexed} tools`);
console.log('Set these env vars:', result.envVars.map(v => v.name));
```

## Generated server

Running `mcpify convert` creates a directory like this:

```
my-api-mcp/
├── src/
│   └── server.ts        # MCP server — one tool per endpoint + search
├── db/
│   └── api.sqlite       # Pre-built search index with embeddings
├── .env.example         # Required auth credentials
├── package.json
├── tsconfig.json
└── README.md
```

Run it:

```bash
cd my-api-mcp
npm install
cp .env.example .env   # fill in your credentials
npm run dev
```

## Embeddings

The `search_api_docs` tool uses vector similarity to find relevant endpoints. You need an embedding provider:

**OpenAI (default)**
```bash
export OPENAI_API_KEY=sk-...
mcpify convert ./spec.yaml -o ./output
```

**Ollama (fully local, no API key)**
```bash
ollama pull nomic-embed-text
mcpify convert ./spec.yaml -o ./output --embedding-provider ollama
```

## Contributing

Early days — all contributions welcome. Check [issues](https://github.com/bisratttt/mcpify/issues) for what's cooking.

## License

MIT
