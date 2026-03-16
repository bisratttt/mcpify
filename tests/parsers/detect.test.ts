import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseSpec } from '../../src/parsers/index.js';

const fixtures = resolve(fileURLToPath(import.meta.url), '../../fixtures');

describe('Format auto-detection', () => {
  it('detects OpenAPI v3 from JSON', async () => {
    const spec = await parseSpec(resolve(fixtures, 'petstore-v3.json'));
    expect(spec.rawFormat).toBe('openapi3');
  });

  it('detects Swagger v2 from JSON', async () => {
    const spec = await parseSpec(resolve(fixtures, 'petstore-v2.json'));
    expect(spec.rawFormat).toBe('openapi2');
  });

  it('detects Postman collection from JSON', async () => {
    const spec = await parseSpec(resolve(fixtures, 'postman.json'));
    expect(spec.rawFormat).toBe('postman');
  });

  it('detects HAR from JSON', async () => {
    const spec = await parseSpec(resolve(fixtures, 'sample.har'));
    expect(spec.rawFormat).toBe('har');
  });

  it('detects GraphQL from .graphql extension', async () => {
    const spec = await parseSpec(resolve(fixtures, 'schema.graphql'));
    expect(spec.rawFormat).toBe('graphql');
  });

  it('throws on unrecognized format', async () => {
    await expect(parseSpec(resolve(fixtures, 'unknown.json'))).rejects.toThrow();
  });
});
