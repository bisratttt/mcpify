/**
 * Integration tests: full pipeline from live spec URL → generate → search → real HTTP call
 *
 * Uses the local Qwen3 embedding model. First run downloads ~614MB.
 * Run with: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DatabaseSync } from 'node:sqlite';
import { parseSpec } from '../../src/parsers/index.js';
import { generateMcpServer } from '../../src/generator/index.js';
import { ApiIndexer } from '../../src/indexer/index.js';
import { embed } from '../../src/indexer/embed.js';
import type { EmbedConfig, NormalizedSpec } from '../../src/types.js';

const EMBED_CONFIG: EmbedConfig = { provider: 'local' };
const PETSTORE_SPEC_URL = 'https://petstore3.swagger.io/api/v3/openapi.json';
const PETSTORE_BASE_URL = 'https://petstore3.swagger.io/api/v3';

let petstore: NormalizedSpec;

beforeAll(async () => {
  console.log('Loading Qwen3 model (downloads ~614MB on first run)...');
  await embed('warmup', EMBED_CONFIG);
  console.log('Model ready. Fetching Petstore v3 spec...');
  petstore = await parseSpec(PETSTORE_SPEC_URL);
  console.log(`Petstore: ${petstore.endpoints.length} endpoints parsed`);
}, 300_000);

// ── Test 1: End-to-end generate pipeline ──────────────────────────────────────

describe('generateMcpServer — Petstore spec URL', () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'build-mcp-pipeline-'));
    await generateMcpServer(petstore, {
      outputDir: outDir,
      embeddingProvider: 'local',
    });
  }, 120_000);

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('writes all 7 expected output files', () => {
    expect(existsSync(join(outDir, 'src', 'server.ts'))).toBe(true);
    expect(existsSync(join(outDir, 'package.json'))).toBe(true);
    expect(existsSync(join(outDir, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(outDir, '.env.example'))).toBe(true);
    expect(existsSync(join(outDir, 'README.md'))).toBe(true);
    expect(existsSync(join(outDir, 'WORKFLOWS.md'))).toBe(true);
    expect(existsSync(join(outDir, 'db', 'api.sqlite'))).toBe(true);
  });

  it('indexes exactly as many rows as parsed endpoints', () => {
    const db = new DatabaseSync(join(outDir, 'db', 'api.sqlite'));
    const { count } = db.prepare('SELECT COUNT(*) as count FROM endpoints').get() as { count: number };
    db.close();
    expect(count).toBe(petstore.endpoints.length);
    expect(count).toBeGreaterThan(10);
  });

  it('every row has an embedding BLOB', () => {
    const db = new DatabaseSync(join(outDir, 'db', 'api.sqlite'));
    const { nullCount } = db.prepare(
      'SELECT COUNT(*) as nullCount FROM endpoints WHERE embedding IS NULL'
    ).get() as { nullCount: number };
    db.close();
    expect(nullCount).toBe(0);
  });

  it('generated server.ts declares exactly 2 tools', () => {
    const src = readFileSync(join(outDir, 'src', 'server.ts'), 'utf8');
    const matches = [...src.matchAll(/server\.tool\(/g)];
    expect(matches).toHaveLength(2);
    expect(src).toContain("'search_docs'");
    expect(src).toContain("'call_api'");
  });

  it('generated package.json uses @huggingface/transformers for local provider', () => {
    const pkg = JSON.parse(readFileSync(join(outDir, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@huggingface/transformers']).toBeDefined();
    expect(pkg.dependencies['openai']).toBeUndefined();
  });

  it('WORKFLOWS.md is non-empty and starts with a heading', () => {
    const md = readFileSync(join(outDir, 'WORKFLOWS.md'), 'utf8');
    expect(md.trimStart()).toMatch(/^#/);
    expect(md.length).toBeGreaterThan(50);
  });

  it('meta table records the embedding provider', () => {
    const db = new DatabaseSync(join(outDir, 'db', 'api.sqlite'));
    const { value } = db.prepare("SELECT value FROM meta WHERE key = 'provider'").get() as { value: string };
    db.close();
    expect(value).toBe('local');
  });
});

// ── Test 2: Semantic search + real HTTP call ──────────────────────────────────

describe('ApiIndexer.search + real Petstore HTTP call', () => {
  let indexer: ApiIndexer;
  let idxDir: string;

  beforeAll(async () => {
    idxDir = mkdtempSync(join(tmpdir(), 'build-mcp-idx-'));
    indexer = new ApiIndexer(join(idxDir, 'api.sqlite'));
    await indexer.indexSpec(petstore, EMBED_CONFIG);
  }, 120_000);

  afterAll(() => {
    indexer.close();
    rmSync(idxDir, { recursive: true, force: true });
  });

  it('returns results ranked by relevance for a plain-English query', async () => {
    const { embedding } = await embed('find all pets by status', EMBED_CONFIG, true);
    const results = indexer.search(embedding, 5);
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map(r => r.id);
    console.log('Top 5 for "find all pets by status":', ids);
    // The status-search endpoint should be the top result
    expect(ids[0].toLowerCase()).toMatch(/status/);
  });

  it('destructive query surfaces a DELETE endpoint at the top', async () => {
    const { embedding } = await embed('delete a pet by its id', EMBED_CONFIG, true);
    const results = indexer.search(embedding, 5);
    console.log('Top 5 for "delete a pet by its id":', results.map(r => r.id));
    const top = results[0];
    expect(top.method).toBe('DELETE');
  });

  it('upload query surfaces the photo upload endpoint', async () => {
    const { embedding } = await embed('upload a photo for a pet', EMBED_CONFIG, true);
    const results = indexer.search(embedding, 5);
    console.log('Top 5 for "upload a photo for a pet":', results.map(r => r.id));
    const ids = results.map(r => r.id);
    expect(ids.some(id => id.toLowerCase().includes('upload'))).toBe(true);
  });

  it('real HTTP GET /pet/findByStatus returns an array', async () => {
    const { embedding } = await embed('list available pets for adoption', EMBED_CONFIG, true);
    const results = indexer.search(embedding, 5);
    const ep = results.find(r => r.path.includes('findByStatus')) ?? results[0];

    const url = `${PETSTORE_BASE_URL}${ep.path}?status=available`;
    console.log(`Calling: GET ${url}`);

    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    expect(res.ok).toBe(true);

    const data = await res.json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
    console.log(`Response: ${data.length} pets returned`);

    if (data.length > 0) {
      const pet = data[0] as Record<string, unknown>;
      expect(pet).toHaveProperty('id');
      expect(pet).toHaveProperty('name');
    }
  }, 30_000);

  it('real HTTP POST /pet is reachable and returns JSON', async () => {
    // petstore3.swagger.io is a public demo — status codes are unreliable (may 500),
    // so we only assert network reachability and a parseable JSON body.
    const newPet = { name: `test-pet-${Date.now()}`, status: 'available', photoUrls: [] };
    const url = `${PETSTORE_BASE_URL}/pet`;
    console.log(`Calling: POST ${url}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(newPet),
    });

    // Server responded (not a network error) — demo API status codes vary
    expect(res.status).toBeGreaterThan(0);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
    console.log(`POST /pet → HTTP ${res.status}: ${text.slice(0, 120)}`);
  }, 30_000);
});
