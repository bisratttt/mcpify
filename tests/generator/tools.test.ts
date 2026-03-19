import { describe, it, expect } from 'vitest';
import { formatEndpointForSearch } from '../../src/generator/tools.js';
import type { Endpoint } from '../../src/types.js';

function makeEndpoint(overrides: Partial<Endpoint>): Endpoint {
  return {
    id: 'testOp',
    method: 'GET',
    path: '/test',
    tags: [],
    parameters: [],
    responses: [],
    ...overrides,
  };
}

describe('formatEndpointForSearch', () => {
  it('includes endpoint ID, method, and path on first line', () => {
    const result = formatEndpointForSearch(makeEndpoint({ id: 'listPets', method: 'GET', path: '/pets' }));
    expect(result).toContain('listPets (GET /pets)');
  });

  it('includes summary', () => {
    const result = formatEndpointForSearch(makeEndpoint({ summary: 'List all pets' }));
    expect(result).toContain('List all pets');
  });

  it('falls back to description when no summary', () => {
    const result = formatEndpointForSearch(makeEndpoint({ description: 'Returns pets from the store' }));
    expect(result).toContain('Returns pets from the store');
  });

  it('marks deprecated endpoints', () => {
    const result = formatEndpointForSearch(makeEndpoint({ deprecated: true }));
    expect(result).toContain('DEPRECATED');
  });

  it('lists query parameters with type and required status', () => {
    const result = formatEndpointForSearch(makeEndpoint({
      parameters: [
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
        { name: 'status', in: 'query', required: true, schema: { type: 'string' } },
      ],
    }));
    expect(result).toContain('limit (query, optional, integer)');
    expect(result).toContain('status (query, required, string)');
  });

  it('lists path parameters', () => {
    const result = formatEndpointForSearch(makeEndpoint({
      parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }],
    }));
    expect(result).toContain('petId (path, required, string)');
  });

  it('shows enum values in type description', () => {
    const result = formatEndpointForSearch(makeEndpoint({
      parameters: [{ name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['active', 'inactive'] } }],
    }));
    expect(result).toContain('string: active|inactive');
  });

  it('omits header parameters from param list', () => {
    const result = formatEndpointForSearch(makeEndpoint({
      parameters: [
        { name: 'X-Custom', in: 'header', required: false },
        { name: 'limit', in: 'query', required: false },
      ],
    }));
    expect(result).not.toContain('X-Custom');
    expect(result).toContain('limit');
  });

  it('shows request body line with content type', () => {
    const result = formatEndpointForSearch(makeEndpoint({
      requestBody: { required: true, contentType: 'application/json', schema: {} },
    }));
    expect(result).toContain('Body: required (application/json)');
  });

  it('shows body schema properties when present', () => {
    const result = formatEndpointForSearch(makeEndpoint({
      requestBody: {
        required: true,
        contentType: 'application/json',
        schema: { properties: { name: { type: 'string' }, age: { type: 'integer' } } },
      },
    }));
    expect(result).toContain('name: string');
    expect(result).toContain('age: integer');
  });

  it('caps body schema properties at 8 fields', () => {
    const properties = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`field${i}`, { type: 'string' }])
    );
    const result = formatEndpointForSearch(makeEndpoint({
      requestBody: { required: true, contentType: 'application/json', schema: { properties } },
    }));
    expect(result).toContain('field0: string');
    expect(result).not.toContain('field8: string');
  });

  it('shows optional body', () => {
    const result = formatEndpointForSearch(makeEndpoint({
      requestBody: { required: false, contentType: 'application/json' },
    }));
    expect(result).toContain('Body: optional');
  });

  it('includes tags', () => {
    const result = formatEndpointForSearch(makeEndpoint({ tags: ['pets', 'animals'] }));
    expect(result).toContain('pets');
    expect(result).toContain('animals');
  });

  it('omits params/body/tags lines when absent', () => {
    const result = formatEndpointForSearch(makeEndpoint({ summary: 'Simple' }));
    expect(result).not.toContain('Params:');
    expect(result).not.toContain('Body:');
    expect(result).not.toContain('Tags:');
  });

  it('shows Returns line for 200 response with object schema', () => {
    const result = formatEndpointForSearch(makeEndpoint({
      responses: [{ statusCode: '200', schema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } }],
    }));
    expect(result).toContain('Returns (200): { id: string, name: string }');
  });

  it('shows Returns line for array response with items', () => {
    const result = formatEndpointForSearch(makeEndpoint({
      responses: [{ statusCode: '200', schema: { type: 'array', items: { properties: { id: { type: 'string' }, status: { type: 'string' } } } } }],
    }));
    expect(result).toContain('Returns (200): array of { id: string, status: string }');
  });

  it('shows bare "array" when no items schema', () => {
    const result = formatEndpointForSearch(makeEndpoint({
      responses: [{ statusCode: '200', schema: { type: 'array' } }],
    }));
    expect(result).toContain('Returns (200): array');
  });

  it('omits Returns line when responses is empty', () => {
    const result = formatEndpointForSearch(makeEndpoint({ responses: [] }));
    expect(result).not.toContain('Returns');
  });

  it('omits Returns line when response schema has no properties or type', () => {
    const result = formatEndpointForSearch(makeEndpoint({
      responses: [{ statusCode: '200', schema: { description: 'ok' } }],
    }));
    expect(result).not.toContain('Returns');
  });

  it('caps Returns properties at 8 fields', () => {
    const properties = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i}`, { type: 'string' }]));
    const result = formatEndpointForSearch(makeEndpoint({
      responses: [{ statusCode: '200', schema: { type: 'object', properties } }],
    }));
    expect(result).toContain('f0: string');
    expect(result).not.toContain('f8: string');
  });
});
