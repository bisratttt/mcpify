import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseOpenApi } from '../../src/parsers/openapi.js';

const fixtures = resolve(fileURLToPath(import.meta.url), '../../fixtures');

describe('OpenAPI v3 parser', () => {
  it('parses spec metadata', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    expect(spec.info.title).toBe('Petstore');
    expect(spec.info.version).toBe('1.0.0');
    expect(spec.rawFormat).toBe('openapi3');
  });

  it('extracts server URLs', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    expect(spec.servers).toHaveLength(1);
    expect(spec.servers[0].url).toBe('https://petstore.example.com/v1');
  });

  it('extracts all endpoints', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    expect(spec.endpoints).toHaveLength(4);
  });

  it('maps endpoint methods and paths correctly', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    const ids = spec.endpoints.map(e => e.operationId);
    expect(ids).toContain('listPets');
    expect(ids).toContain('createPet');
    expect(ids).toContain('getPet');
    expect(ids).toContain('deletePet');
  });

  it('preserves operationId as endpoint id', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    const list = spec.endpoints.find(e => e.operationId === 'listPets');
    expect(list?.id).toBe('listPets');
    expect(list?.method).toBe('GET');
    expect(list?.path).toBe('/pets');
  });

  it('extracts query parameters', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    const list = spec.endpoints.find(e => e.operationId === 'listPets')!;
    const limitParam = list.parameters.find(p => p.name === 'limit');
    expect(limitParam).toBeDefined();
    expect(limitParam?.in).toBe('query');
    expect(limitParam?.required).toBe(false);
    expect(limitParam?.schema?.type).toBe('integer');
  });

  it('extracts enum parameter schemas', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    const list = spec.endpoints.find(e => e.operationId === 'listPets')!;
    const statusParam = list.parameters.find(p => p.name === 'status');
    expect(statusParam?.schema?.enum).toEqual(['available', 'sold']);
  });

  it('extracts path parameters', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    const get = spec.endpoints.find(e => e.operationId === 'getPet')!;
    const petIdParam = get.parameters.find(p => p.name === 'petId');
    expect(petIdParam?.in).toBe('path');
    expect(petIdParam?.required).toBe(true);
  });

  it('extracts request body', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    const create = spec.endpoints.find(e => e.operationId === 'createPet')!;
    expect(create.requestBody).toBeDefined();
    expect(create.requestBody?.required).toBe(true);
    expect(create.requestBody?.contentType).toBe('application/json');
  });

  it('extracts tags', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    spec.endpoints.forEach(ep => {
      expect(ep.tags).toContain('pets');
    });
  });

  it('flags deprecated endpoints', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    const del = spec.endpoints.find(e => e.operationId === 'deletePet')!;
    expect(del.deprecated).toBe(true);
    const list = spec.endpoints.find(e => e.operationId === 'listPets')!;
    expect(list.deprecated).toBeFalsy();
  });

  it('extracts multiple responses', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    const list = spec.endpoints.find(e => e.operationId === 'listPets')!;
    const codes = list.responses.map(r => r.statusCode);
    expect(codes).toContain('200');
    expect(codes).toContain('400');
  });

  it('extracts apiKey auth scheme', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    const apiKey = spec.auth.find(a => a.name === 'apiKey');
    expect(apiKey?.type).toBe('apiKey');
    expect(apiKey?.in).toBe('header');
    expect(apiKey?.envVar).toMatch(/PETSTORE_APIKEY/i);
  });

  it('extracts bearer auth scheme', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    const bearer = spec.auth.find(a => a.name === 'bearerAuth');
    expect(bearer?.type).toBe('http');
    expect(bearer?.scheme).toBe('bearer');
  });

  it('attaches security requirements to endpoints', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v3.json'));
    const list = spec.endpoints.find(e => e.operationId === 'listPets')!;
    expect(list.security).toContain('apiKey');
  });
});

describe('OpenAPI v2 (Swagger) parser', () => {
  it('parses spec metadata', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v2.json'));
    expect(spec.info.title).toBe('Petstore V2');
    expect(spec.rawFormat).toBe('openapi2');
  });

  it('constructs base URL from host/basePath/schemes', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v2.json'));
    expect(spec.servers[0].url).toBe('https://petstore.example.com/api');
  });

  it('extracts body parameter as requestBody', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v2.json'));
    const update = spec.endpoints.find(e => e.operationId === 'updatePet')!;
    expect(update.requestBody).toBeDefined();
    expect(update.requestBody?.contentType).toBe('application/json');
    // body param should not appear in parameters list
    expect(update.parameters.find(p => p.name === 'body')).toBeUndefined();
  });

  it('extracts apiKey security definition', async () => {
    const spec = await parseOpenApi(resolve(fixtures, 'petstore-v2.json'));
    expect(spec.auth).toHaveLength(1);
    expect(spec.auth[0].type).toBe('apiKey');
  });
});
