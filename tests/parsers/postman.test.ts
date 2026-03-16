import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { parsePostman } from '../../src/parsers/postman.js';

const fixtures = resolve(fileURLToPath(import.meta.url), '../../fixtures');

function loadFixture(name: string) {
  return JSON.parse(readFileSync(resolve(fixtures, name), 'utf-8')) as unknown;
}

describe('Postman parser', () => {
  it('parses collection name', () => {
    const spec = parsePostman(loadFixture('postman.json'));
    expect(spec.info.title).toBe('Petstore API');
    expect(spec.rawFormat).toBe('postman');
  });

  it('flattens nested folders into endpoints', () => {
    const spec = parsePostman(loadFixture('postman.json'));
    // 2 items in Pets folder + 1 top-level item
    expect(spec.endpoints).toHaveLength(3);
  });

  it('tags endpoints with their folder name', () => {
    const spec = parsePostman(loadFixture('postman.json'));
    const listPets = spec.endpoints.find(e => e.summary === 'List Pets');
    expect(listPets?.tags).toContain('Pets');
  });

  it('extracts HTTP methods correctly', () => {
    const spec = parsePostman(loadFixture('postman.json'));
    const methods = spec.endpoints.map(e => e.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
  });

  it('extracts query parameters', () => {
    const spec = parsePostman(loadFixture('postman.json'));
    const list = spec.endpoints.find(e => e.summary === 'List Pets')!;
    const limit = list.parameters.find(p => p.name === 'limit');
    expect(limit?.in).toBe('query');
    expect(limit?.schema?.example).toBe('10');
  });

  it('extracts path variables as path parameters', () => {
    const spec = parsePostman(loadFixture('postman.json'));
    const getById = spec.endpoints.find(e => e.summary === 'Get Pet by ID')!;
    const idParam = getById.parameters.find(p => p.name === 'id');
    expect(idParam?.in).toBe('path');
    expect(idParam?.required).toBe(true);
  });

  it('converts :param path syntax to {param}', () => {
    const spec = parsePostman(loadFixture('postman.json'));
    const getById = spec.endpoints.find(e => e.summary === 'Get Pet by ID')!;
    expect(getById.path).toBe('/pets/{id}');
  });

  it('extracts base URL from items', () => {
    const spec = parsePostman(loadFixture('postman.json'));
    expect(spec.servers.length).toBeGreaterThan(0);
    expect(spec.servers[0].url).toBe('https://api.example.com');
  });

  it('marks POST request body', () => {
    const spec = parsePostman(loadFixture('postman.json'));
    const create = spec.endpoints.find(e => e.summary === 'Create Pet')!;
    expect(create.requestBody).toBeDefined();
  });

  it('generates unique endpoint IDs', () => {
    const spec = parsePostman(loadFixture('postman.json'));
    const ids = spec.endpoints.map(e => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
