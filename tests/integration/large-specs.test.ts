/**
 * Integration tests: parsing large, real-world API specs from public URLs.
 * No embedding model needed — these test only the parsing layer.
 *
 * Run with: npm run test:integration
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { parseSpec } from '../../src/parsers/index.js';
import type { NormalizedSpec } from '../../src/types.js';

// Stripe's official OpenAPI 3.x spec (~6MB, 400+ endpoints, complex $ref/circular structure)
const STRIPE_SPEC_URL =
  'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json';

describe('parseSpec — Stripe OpenAPI spec', () => {
  let spec: NormalizedSpec;

  beforeAll(async () => {
    console.log('Fetching Stripe OpenAPI spec (~6MB, may take a moment)...');
    spec = await parseSpec(STRIPE_SPEC_URL);
    console.log(`Stripe: ${spec.endpoints.length} endpoints, ${spec.auth.length} auth schemes`);
  }, 120_000);

  it('parses without crashing and extracts many endpoints', () => {
    expect(spec.endpoints.length).toBeGreaterThan(200);
  });

  it('populates title and version from info object', () => {
    expect(spec.info.title).toBeTruthy();
    expect(spec.info.version).toBeTruthy();
  });

  it('detects at least one auth scheme', () => {
    expect(spec.auth.length).toBeGreaterThan(0);
  });

  it('includes an HTTP bearer auth scheme (Stripe uses bearer tokens)', () => {
    const hasBearer = spec.auth.some(a => a.type === 'http' && a.scheme === 'bearer');
    expect(hasBearer).toBe(true);
  });

  it('all endpoints have a non-empty method, path starting with /, and unique id', () => {
    const ids = new Set<string>();
    for (const ep of spec.endpoints) {
      expect(ep.method).toBeTruthy();
      expect(ep.path).toMatch(/^\//);
      expect(ep.id).toBeTruthy();
      ids.add(ep.id);
    }
    // IDs must be unique
    expect(ids.size).toBe(spec.endpoints.length);
  });

  it('has a spread of HTTP methods including GET, POST, DELETE', () => {
    const methods = new Set(spec.endpoints.map(e => e.method));
    expect(methods.has('GET')).toBe(true);
    expect(methods.has('POST')).toBe(true);
    expect(methods.has('DELETE')).toBe(true);
  });

  it('POST endpoints have a requestBody defined', () => {
    const postWithBody = spec.endpoints.filter(e => e.method === 'POST' && e.requestBody);
    // Stripe has many POST endpoints that accept request bodies
    expect(postWithBody.length).toBeGreaterThan(50);
  });

  it('does not crash accessing endpoint fields — circular refs in raw schema are safe at the property level', () => {
    // swagger-parser.dereference() can introduce circular refs in nested schema objects.
    // Circular refs are sanitized by ApiIndexer.indexSpec (via sanitizeEndpoint).
    // This test verifies the parser-level fields (method, path, parameters) are always safe.
    for (const ep of spec.endpoints) {
      expect(typeof ep.method).toBe('string');
      expect(typeof ep.path).toBe('string');
      expect(Array.isArray(ep.parameters)).toBe(true);
      for (const p of ep.parameters) expect(typeof p.name).toBe('string');
    }
  });

  it('reports the correct spec format', () => {
    expect(spec.rawFormat).toBe('openapi3');
  });

  it('at least one server URL is present', () => {
    expect(spec.servers.length).toBeGreaterThan(0);
    expect(spec.servers[0].url).toMatch(/^https?:\/\//);
  });
});
