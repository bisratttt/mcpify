import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseHar } from '../../src/parsers/har.js';

const fixtures = resolve(fileURLToPath(import.meta.url), '../../fixtures');

function loadFixture(name: string) {
  return JSON.parse(readFileSync(resolve(fixtures, name), 'utf-8')) as unknown;
}

describe('HAR parser', () => {
  it('returns correct format', () => {
    const spec = parseHar(loadFixture('sample.har'));
    expect(spec.rawFormat).toBe('har');
  });

  it('deduplicates entries with same method+path', () => {
    // GET /users appears twice in HAR (page=1 and page=2) — should be one endpoint
    const spec = parseHar(loadFixture('sample.har'));
    const getUsers = spec.endpoints.filter(e => e.method === 'GET' && e.path === '/users');
    expect(getUsers).toHaveLength(1);
  });

  it('creates one endpoint per unique method+path', () => {
    const spec = parseHar(loadFixture('sample.har'));
    // GET /users and POST /users
    expect(spec.endpoints).toHaveLength(2);
  });

  it('extracts correct HTTP methods', () => {
    const spec = parseHar(loadFixture('sample.har'));
    const methods = spec.endpoints.map(e => e.method).sort();
    expect(methods).toEqual(['GET', 'POST']);
  });

  it('extracts query parameters', () => {
    const spec = parseHar(loadFixture('sample.har'));
    const get = spec.endpoints.find(e => e.method === 'GET')!;
    const page = get.parameters.find(p => p.name === 'page');
    expect(page?.in).toBe('query');
  });

  it('filters out sensitive headers (Authorization, Cookie)', () => {
    const spec = parseHar(loadFixture('sample.har'));
    const get = spec.endpoints.find(e => e.method === 'GET')!;
    const headerNames = get.parameters.filter(p => p.in === 'header').map(p => p.name.toLowerCase());
    expect(headerNames).not.toContain('authorization');
    expect(headerNames).not.toContain('cookie');
    expect(headerNames).not.toContain('content-length');
  });

  it('preserves non-sensitive headers', () => {
    const spec = parseHar(loadFixture('sample.har'));
    const get = spec.endpoints.find(e => e.method === 'GET')!;
    const headerNames = get.parameters.filter(p => p.in === 'header').map(p => p.name);
    expect(headerNames).toContain('X-Request-Id');
  });

  it('marks POST request body from postData', () => {
    const spec = parseHar(loadFixture('sample.har'));
    const post = spec.endpoints.find(e => e.method === 'POST')!;
    expect(post.requestBody).toBeDefined();
    expect(post.requestBody?.contentType).toBe('application/json');
  });

  it('extracts base URL from entries', () => {
    const spec = parseHar(loadFixture('sample.har'));
    expect(spec.servers[0].url).toBe('https://api.example.com');
  });

  it('captures response status code', () => {
    const spec = parseHar(loadFixture('sample.har'));
    const get = spec.endpoints.find(e => e.method === 'GET')!;
    expect(get.responses[0].statusCode).toBe('200');
  });
});
