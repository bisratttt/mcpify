/**
 * Integration test: generated server.ts must compile cleanly with tsc.
 *
 * Generates from complex-api.json (Stripe+Twilio patterns), writes to a temp
 * dir with a symlinked node_modules, then runs tsc --noEmit. Covers all three
 * embedding providers and all auth scheme combinations.
 *
 * No embedding model required.
 * Run with: npm run test:integration
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, symlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { parseSpec } from '../../src/parsers/index.js';
import { generateServerTs, generateTsConfig, generatePackageJson } from '../../src/generator/server-template.js';
import type { NormalizedSpec, EmbeddingProvider } from '../../src/types.js';

const FIXTURE  = join(process.cwd(), 'tests/fixtures/complex-api.json');
const TSC      = join(process.cwd(), 'node_modules/.bin/tsc');
const NODE_MOD = join(process.cwd(), 'node_modules');

let spec: NormalizedSpec;
const tmpDirs: string[] = [];

function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'build-mcp-compile-'));
  tmpDirs.push(d);
  return d;
}

/** Write server.ts + tsconfig.json + package.json and symlink node_modules, then run tsc --noEmit. */
function compileCheck(serverTs: string): { ok: boolean; output: string } {
  const outDir = freshDir();
  mkdirSync(join(outDir, 'src'));
  writeFileSync(join(outDir, 'src', 'server.ts'), serverTs);
  writeFileSync(join(outDir, 'tsconfig.json'), generateTsConfig());
  // tsc uses the nearest package.json "type" field to decide ESM vs CJS.
  // Without "type": "module", NodeNext module mode treats .ts as CJS,
  // rejecting import.meta.url and top-level await.
  writeFileSync(join(outDir, 'package.json'), generatePackageJson('test', '1.0.0', 'local'));

  const nmLink = join(outDir, 'node_modules');
  if (!existsSync(nmLink)) symlinkSync(NODE_MOD, nmLink);

  const result = spawnSync(TSC, ['--project', join(outDir, 'tsconfig.json'), '--noEmit'], {
    encoding: 'utf8',
    cwd: outDir,
  });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  return { ok: result.status === 0, output };
}

beforeAll(async () => {
  spec = await parseSpec(FIXTURE);
});

afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

// ── Provider variants ─────────────────────────────────────────────────────────

describe('Generated server.ts compiles — embedding provider variants', () => {
  const cases: Array<[EmbeddingProvider, string]> = [
    ['local',  'onnx-community/Qwen3-Embedding-0.6B-ONNX'],
    ['openai', 'text-embedding-3-small'],
    ['ollama', 'nomic-embed-text'],
  ];

  for (const [provider, model] of cases) {
    it(`provider=${provider}`, () => {
      const serverTs = generateServerTs(spec, spec.auth, provider, model, '');
      const { ok, output } = compileCheck(serverTs);
      if (!ok) throw new Error(`tsc failed for provider=${provider}:\n${output}`);
    });
  }
});

// ── Auth scheme combinations ──────────────────────────────────────────────────

describe('Generated server.ts compiles — auth scheme combinations', () => {
  it('no auth schemes', () => {
    const serverTs = generateServerTs({ ...spec, auth: [] }, [], 'local', 'model', '');
    const { ok, output } = compileCheck(serverTs);
    if (!ok) throw new Error(`tsc failed with no auth:\n${output}`);
  });

  it('bearer auth only', () => {
    const bearer = spec.auth.filter(a => a.type === 'http' && a.scheme === 'bearer');
    const serverTs = generateServerTs(spec, bearer, 'local', 'model', '');
    const { ok, output } = compileCheck(serverTs);
    if (!ok) throw new Error(`tsc failed with bearer-only:\n${output}`);
  });

  it('HTTP basic auth only', () => {
    const basic = spec.auth.filter(a => a.type === 'http' && a.scheme === 'basic');
    const serverTs = generateServerTs(spec, basic, 'local', 'model', '');
    const { ok, output } = compileCheck(serverTs);
    if (!ok) throw new Error(`tsc failed with basic-only:\n${output}`);
  });

  it('API key in header only', () => {
    const apiKey = spec.auth.filter(a => a.type === 'apiKey');
    const serverTs = generateServerTs(spec, apiKey, 'local', 'model', '');
    const { ok, output } = compileCheck(serverTs);
    if (!ok) throw new Error(`tsc failed with apiKey-only:\n${output}`);
  });

  it('all 3 auth schemes simultaneously (bearer + basic + apiKey)', () => {
    const serverTs = generateServerTs(spec, spec.auth, 'local', 'model', '');
    const { ok, output } = compileCheck(serverTs);
    if (!ok) throw new Error(`tsc failed with all-auth:\n${output}`);
  });
});

// ── Spec variants ─────────────────────────────────────────────────────────────

describe('Generated server.ts compiles — spec content variants', () => {
  it('spec with workflows markdown embedded', () => {
    const workflowsMd = '# API Workflows\n\n## CRUD: `v1/customers`\nSteps:\n1. list_customers\n2. create_customer\n';
    const serverTs = generateServerTs(spec, spec.auth, 'local', 'model', workflowsMd);
    const { ok, output } = compileCheck(serverTs);
    if (!ok) throw new Error(`tsc failed with workflows embedded:\n${output}`);
  });

  it('spec with zero endpoints', () => {
    const empty = { ...spec, endpoints: [] };
    const serverTs = generateServerTs(empty, [], 'local', 'model', '');
    const { ok, output } = compileCheck(serverTs);
    if (!ok) throw new Error(`tsc failed with empty endpoints:\n${output}`);
  });

  it('spec with special characters in title (sanitised to valid identifier)', () => {
    const weirdTitle = { ...spec, info: { ...spec.info, title: 'Foo & Bar / Baz 2.0!' } };
    const serverTs = generateServerTs(weirdTitle, [], 'local', 'model', '');
    const { ok, output } = compileCheck(serverTs);
    if (!ok) throw new Error(`tsc failed with special-char title:\n${output}`);
  });
});
