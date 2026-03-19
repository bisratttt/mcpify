/**
 * Runtime integration test: spawn the generated MCP server as a subprocess,
 * host a local HTTP recorder, and assert correct auth headers / URL building
 * / body serialization via the MCP protocol.
 *
 * What is tested:
 *   - Bearer auth header sent for Stripe endpoints (get_customer)
 *   - Basic auth header sent for Twilio endpoints (get_message)
 *   - API-key header sent for webhook endpoints (create_webhook)
 *   - Per-endpoint auth — bearer endpoint does NOT send basic header, and vice versa
 *   - Path param substitution ({id}, {AccountSid}, {MessageSid})
 *   - application/x-www-form-urlencoded body serialization (create_customer)
 *   - Pre-call validation error (missing required param, no HTTP request made)
 *   - Unknown endpoint_id returns helpful error listing Available IDs
 *
 * No real embedding model is needed: we insert endpoints into SQLite with
 * NULL embeddings. call_api only needs `SELECT endpoint_json WHERE id = ?`.
 *
 * Run with: npm run test:integration
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync, existsSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { DatabaseSync } from 'node:sqlite';
import { spawn, type ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parseSpec } from '../../src/parsers/index.js';
import {
  generateServerTs, generateTsConfig, generatePackageJson,
} from '../../src/generator/server-template.js';
import type { NormalizedSpec } from '../../src/types.js';

const FIXTURE  = join(process.cwd(), 'tests/fixtures/complex-api.json');
const NODE_MOD = join(process.cwd(), 'node_modules');
const TSX      = join(process.cwd(), 'node_modules/.bin/tsx');

// ── Shared state ──────────────────────────────────────────────────────────────

let spec: NormalizedSpec;
let httpPort: number;
let outDir: string;
let mcpProc: ChildProcess;
let mcpClient: Client;

/** Last request captured by the HTTP recorder. */
type CapturedRequest = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};
let lastRequest: CapturedRequest | null = null;

// ── HTTP recorder ─────────────────────────────────────────────────────────────

async function startHttpRecorder(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        lastRequest = {
          method: req.method ?? '',
          url: req.url ?? '',
          headers: req.headers as Record<string, string | string[] | undefined>,
          body,
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: 'test-response-id' }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve(port);
    });
  });
}

// ── SQLite DB builder ─────────────────────────────────────────────────────────

/**
 * Write a SQLite DB with all endpoints from the spec but NULL embeddings.
 * call_api only uses `SELECT endpoint_json WHERE id = ?`, so no embeddings needed.
 */
function buildTestDb(dbPath: string, s: NormalizedSpec): void {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS endpoints (
      id TEXT PRIMARY KEY, method TEXT NOT NULL, path TEXT NOT NULL,
      summary TEXT, description TEXT, tags TEXT,
      endpoint_json TEXT NOT NULL, embedding BLOB
    );
  `);
  db.prepare('INSERT OR REPLACE INTO meta VALUES (?, ?)').run('provider', 'local');

  const insert = db.prepare(
    'INSERT OR REPLACE INTO endpoints (id, method, path, summary, description, tags, endpoint_json, embedding) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );

  for (const ep of s.endpoints) {
    // Store a plain (non-circular) endpoint JSON — no simplification needed since
    // the test fixture uses a dereferenced format and has no circular refs in scalar fields.
    const epJson = JSON.stringify({
      id: ep.id,
      method: ep.method,
      path: ep.path,
      summary: ep.summary,
      description: ep.description,
      tags: ep.tags,
      parameters: ep.parameters.map(p => ({
        name: p.name, in: p.in, required: p.required,
        schema: p.schema ? { type: (p.schema as Record<string, unknown>).type, enum: (p.schema as Record<string, unknown>).enum } : undefined,
      })),
      requestBody: ep.requestBody
        ? { required: ep.requestBody.required, contentType: ep.requestBody.contentType }
        : undefined,
      security: ep.security,
      safetyLevel: ep.safetyLevel ?? 'read',
    });
    insert.run(ep.id, ep.method, ep.path, ep.summary ?? null, ep.description ?? null,
      JSON.stringify(ep.tags), epJson, null);
  }
  db.close();
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  spec = await parseSpec(FIXTURE);

  // 1. Start HTTP recorder — all generated server calls will hit this
  httpPort = await startHttpRecorder();

  // 2. Patch spec to point to the local recorder
  const patchedSpec: NormalizedSpec = {
    ...spec,
    servers: [{ url: `http://127.0.0.1:${httpPort}` }],
  };

  // 3. Build temp output dir
  outDir = mkdtempSync(join(tmpdir(), 'build-mcp-runtime-'));
  mkdirSync(join(outDir, 'src'));
  mkdirSync(join(outDir, 'db'));

  // 4. Generate server.ts targeting the recorder
  const serverTs = generateServerTs(patchedSpec, spec.auth, 'local', 'onnx-community/Qwen3-Embedding-0.6B-ONNX');
  writeFileSync(join(outDir, 'src', 'server.ts'), serverTs);
  writeFileSync(join(outDir, 'tsconfig.json'), generateTsConfig());
  writeFileSync(join(outDir, 'package.json'), generatePackageJson('complex-api-fixture', '1.0.0', 'local'));

  // 5. Symlink node_modules
  const nmLink = join(outDir, 'node_modules');
  if (!existsSync(nmLink)) symlinkSync(NODE_MOD, nmLink);

  // 6. Seed SQLite DB
  buildTestDb(join(outDir, 'db', 'api.sqlite'), spec);

  // 7. Spawn the MCP server
  mcpProc = spawn(TSX, ['src/server.ts'], {
    cwd: outDir,
    env: {
      ...process.env,
      COMPLEX_API_FIXTURE_BEARERAUTH:  'test-bearer-token',
      COMPLEX_API_FIXTURE_BASICAUTH:   'dGVzdC1iYXNpYy10b2tlbg==',  // base64(test-basic-token)
      COMPLEX_API_FIXTURE_APIKEYHEADER: 'test-apikey-value',
    },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  // 8. Connect MCP client
  const transport = new StdioClientTransport({
    command: TSX,
    args: ['src/server.ts'],
    env: {
      ...process.env,
      COMPLEX_API_FIXTURE_BEARERAUTH:  'test-bearer-token',
      COMPLEX_API_FIXTURE_BASICAUTH:   'dGVzdC1iYXNpYy10b2tlbg==',
      COMPLEX_API_FIXTURE_APIKEYHEADER: 'test-apikey-value',
    },
    cwd: outDir,
  });

  mcpClient = new Client({ name: 'runtime-test-client', version: '1.0.0' });
  await mcpClient.connect(transport);
}, 30_000);

afterAll(async () => {
  await mcpClient?.close().catch(() => {});
  mcpProc?.kill();
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

// ── Helper ────────────────────────────────────────────────────────────────────

async function callApi(args: {
  endpoint_id: string;
  params?: Record<string, unknown>;
  body?: unknown;
}): Promise<string> {
  const result = await mcpClient.callTool({ name: 'call_api', arguments: args });
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0]?.text ?? '';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Runtime MCP server — auth header injection', () => {
  it('get_customer sends Authorization: Bearer header (Stripe bearer auth)', async () => {
    lastRequest = null;
    await callApi({ endpoint_id: 'get_customer', params: { id: 'cus_123' } });
    expect(lastRequest).not.toBeNull();
    expect(lastRequest!.headers['authorization']).toBe('Bearer test-bearer-token');
  });

  it('get_message sends Authorization: Basic header (Twilio basic auth)', async () => {
    lastRequest = null;
    await callApi({ endpoint_id: 'get_message', params: { AccountSid: 'AC123', MessageSid: 'SM456' } });
    expect(lastRequest).not.toBeNull();
    expect(lastRequest!.headers['authorization']).toBe('Basic dGVzdC1iYXNpYy10b2tlbg==');
  });

  it('create_webhook sends X-API-Key header (apiKey auth)', async () => {
    lastRequest = null;
    await callApi({
      endpoint_id: 'create_webhook',
      body: { url: 'https://example.com/hook', enabled_events: ['charge.succeeded'] },
    });
    expect(lastRequest).not.toBeNull();
    expect(lastRequest!.headers['x-api-key']).toBe('test-apikey-value');
  });

  it('get_customer does NOT send Basic auth header (bearer-only endpoint)', async () => {
    lastRequest = null;
    await callApi({ endpoint_id: 'get_customer', params: { id: 'cus_456' } });
    expect(lastRequest).not.toBeNull();
    // Authorization should be Bearer, not Basic
    expect(lastRequest!.headers['authorization']).toMatch(/^Bearer /);
    expect(lastRequest!.headers['authorization']).not.toMatch(/^Basic /);
  });

  it('get_message does NOT send Bearer auth header (basic-only endpoint)', async () => {
    lastRequest = null;
    await callApi({ endpoint_id: 'get_message', params: { AccountSid: 'AC123', MessageSid: 'SM789' } });
    expect(lastRequest).not.toBeNull();
    expect(lastRequest!.headers['authorization']).toMatch(/^Basic /);
    expect(lastRequest!.headers['authorization']).not.toMatch(/^Bearer /);
  });
});

describe('Runtime MCP server — URL construction', () => {
  it('substitutes single path param ({id}) in get_customer', async () => {
    lastRequest = null;
    await callApi({ endpoint_id: 'get_customer', params: { id: 'cus_test_123' } });
    expect(lastRequest).not.toBeNull();
    expect(lastRequest!.url).toBe('/v1/customers/cus_test_123');
  });

  it('substitutes multiple path params ({AccountSid}/{MessageSid}) in get_message', async () => {
    lastRequest = null;
    await callApi({ endpoint_id: 'get_message', params: { AccountSid: 'AC_acct', MessageSid: 'SM_msg' } });
    expect(lastRequest).not.toBeNull();
    expect(lastRequest!.url).toBe('/2010-04-01/Accounts/AC_acct/Messages/SM_msg.json');
  });

  it('appends query params for list_customers', async () => {
    lastRequest = null;
    await callApi({ endpoint_id: 'list_customers', params: { limit: 10, starting_after: 'cus_prev' } });
    expect(lastRequest).not.toBeNull();
    expect(lastRequest!.url).toContain('/v1/customers');
    expect(lastRequest!.url).toContain('limit=10');
    expect(lastRequest!.url).toContain('starting_after=cus_prev');
  });

  it('preserves Twilio versioned path prefix /2010-04-01/', async () => {
    lastRequest = null;
    await callApi({ endpoint_id: 'list_messages', params: { AccountSid: 'AC999' } });
    expect(lastRequest).not.toBeNull();
    expect(lastRequest!.url).toMatch(/^\/2010-04-01\//);
  });
});

describe('Runtime MCP server — request body serialization', () => {
  it('serializes form-encoded body for create_customer (application/x-www-form-urlencoded)', async () => {
    lastRequest = null;
    await callApi({
      endpoint_id: 'create_customer',
      body: { email: 'test@example.com', name: 'Test User' },
    });
    expect(lastRequest).not.toBeNull();
    expect(lastRequest!.headers['content-type']).toMatch(/application\/x-www-form-urlencoded/);
    // Body should be URL-encoded, not JSON
    expect(lastRequest!.body).toContain('email=test%40example.com');
    expect(lastRequest!.body).toContain('name=Test+User');
    expect(lastRequest!.body).not.toMatch(/^\{/); // not JSON
  });

  it('serializes JSON body for create_webhook (application/json)', async () => {
    lastRequest = null;
    await callApi({
      endpoint_id: 'create_webhook',
      body: { url: 'https://example.com/hook', enabled_events: ['charge.succeeded'] },
    });
    expect(lastRequest).not.toBeNull();
    expect(lastRequest!.headers['content-type']).toMatch(/application\/json/);
    const parsed = JSON.parse(lastRequest!.body);
    expect(parsed.url).toBe('https://example.com/hook');
  });
});

describe('Runtime MCP server — validation and error handling', () => {
  it('returns validation error for missing required param without making HTTP request', async () => {
    lastRequest = null;
    const text = await callApi({ endpoint_id: 'get_customer' }); // missing required 'id'
    // Should not have made an HTTP call
    expect(lastRequest).toBeNull();
    expect(text).toContain('Validation failed');
    expect(text).toContain('id');
  });

  it('returns Available IDs error for unknown endpoint_id', async () => {
    const text = await callApi({ endpoint_id: 'nonexistent_endpoint_xyz' });
    expect(text).toContain('Unknown endpoint');
    expect(text).toContain('Available IDs');
    // Available IDs should include real endpoint IDs from the fixture
    expect(text).toContain('get_customer');
  });
});
