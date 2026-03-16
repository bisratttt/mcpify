#!/usr/bin/env node
/**
 * mcpify as an MCP server — so AI agents can call it directly.
 * Tools exposed:
 *   - convert_spec: Parse + generate an MCP server from a spec URL/path
 *   - inspect_spec: Parse and summarize a spec without generating
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { parseSpec } from './parsers/index.js';
import { generateMcpServer } from './generator/index.js';
import type { EmbeddingProvider } from './types.js';

const server = new McpServer({
  name: 'mcpify',
  version: '0.1.0',
});

server.tool(
  'inspect_spec',
  'Parse an API spec and return a summary of its endpoints, auth requirements, and format. Supports OpenAPI 2/3 (JSON or YAML), Postman collections, HAR files, and GraphQL schemas.',
  {
    input: z.string().describe('File path or URL to the API spec'),
  },
  async ({ input }) => {
    const spec = await parseSpec(input);
    const summary = {
      title: spec.info.title,
      version: spec.info.version,
      format: spec.rawFormat,
      endpointCount: spec.endpoints.length,
      servers: spec.servers.map(s => s.url),
      auth: spec.auth.map(a => ({ name: a.name, type: a.type, envVar: a.envVar })),
      endpoints: spec.endpoints.map(ep => ({
        id: ep.id,
        method: ep.method,
        path: ep.path,
        summary: ep.summary,
        tags: ep.tags,
        deprecated: ep.deprecated ?? false,
      })),
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  },
);

server.tool(
  'convert_spec',
  'Convert an API spec into a fully working MCP server. Parses the spec, builds a sqlite-vec search index, generates TypeScript MCP server code with one tool per endpoint plus a RAG search tool. Returns the output directory path and required environment variables.',
  {
    input: z.string().describe('File path or URL to the API spec'),
    outputDir: z.string().describe('Directory where the generated MCP server will be written'),
    name: z.string().optional().describe('Override the generated server name'),
    baseUrl: z.string().optional().describe('Override the API base URL from the spec'),
    embeddingProvider: z.enum(['local', 'openai', 'ollama']).optional().default('local').describe('Embedding provider: local (default, no API key needed), openai, or ollama'),
    embeddingModel: z.string().optional().describe('Embedding model (e.g. text-embedding-3-small or nomic-embed-text)'),
  },
  async ({ input, outputDir, name, baseUrl, embeddingProvider, embeddingModel }) => {
    const spec = await parseSpec(input);
    const result = await generateMcpServer(spec, {
      outputDir,
      name,
      baseUrl,
      embeddingProvider: (embeddingProvider ?? 'openai') as EmbeddingProvider,
      embeddingModel,
    });

    const output = {
      success: true,
      outputDir: result.outputDir,
      endpointsIndexed: result.endpointsIndexed,
      requiredEnvVars: result.envVars,
      nextSteps: [
        `cd ${result.outputDir}`,
        'npm install',
        ...(result.envVars.length > 0 ? ['cp .env.example .env  # fill in your API credentials'] : []),
        'npm run dev',
      ],
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
