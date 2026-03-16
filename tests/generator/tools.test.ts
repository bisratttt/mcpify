import { describe, it, expect } from 'vitest';
import { endpointToTool } from '../../src/generator/tools.js';
import type { Endpoint } from '../../src/types.js';

const BASE_URL = 'https://api.example.com';
const AUTH_HEADERS = "{ 'X-API-Key': process.env.MY_API_KEY ?? '' }";
const NO_AUTH = '{}';

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

describe('endpointToTool', () => {
  it('uses operationId as tool name', () => {
    const tool = endpointToTool(makeEndpoint({ id: 'listPets' }), BASE_URL, NO_AUTH, '');
    expect(tool.name).toBe('listPets');
  });

  it('uses summary as description', () => {
    const tool = endpointToTool(makeEndpoint({ summary: 'List all pets' }), BASE_URL, NO_AUTH, '');
    expect(tool.description).toContain('List all pets');
  });

  it('appends deprecation warning to description', () => {
    const tool = endpointToTool(makeEndpoint({ deprecated: true, summary: 'Old endpoint' }), BASE_URL, NO_AUTH, '');
    expect(tool.description).toContain('DEPRECATED');
  });

  it('appends tags to description', () => {
    const tool = endpointToTool(makeEndpoint({ tags: ['pets', 'animals'] }), BASE_URL, NO_AUTH, '');
    expect(tool.description).toContain('pets');
    expect(tool.description).toContain('animals');
  });

  it('generates zod field for string query param', () => {
    const tool = endpointToTool(makeEndpoint({
      parameters: [{ name: 'status', in: 'query', required: false, schema: { type: 'string' } }],
    }), BASE_URL, NO_AUTH, '');
    const field = tool.inputSchema.fields.find(f => f.name === 'status')!;
    expect(field).toBeDefined();
    expect(field.zodType).toBe('z.string()');
    expect(field.optional).toBe(true);
  });

  it('marks required parameters as non-optional', () => {
    const tool = endpointToTool(makeEndpoint({
      parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }],
    }), BASE_URL, NO_AUTH, '');
    const field = tool.inputSchema.fields.find(f => f.name === 'petId')!;
    expect(field.optional).toBe(false);
  });

  it('maps integer schema to z.number()', () => {
    const tool = endpointToTool(makeEndpoint({
      parameters: [{ name: 'limit', in: 'query', required: false, schema: { type: 'integer' } }],
    }), BASE_URL, NO_AUTH, '');
    const field = tool.inputSchema.fields.find(f => f.name === 'limit')!;
    expect(field.zodType).toBe('z.number()');
  });

  it('maps boolean schema to z.boolean()', () => {
    const tool = endpointToTool(makeEndpoint({
      parameters: [{ name: 'active', in: 'query', required: false, schema: { type: 'boolean' } }],
    }), BASE_URL, NO_AUTH, '');
    const field = tool.inputSchema.fields.find(f => f.name === 'active')!;
    expect(field.zodType).toBe('z.boolean()');
  });

  it('maps enum schema to z.enum()', () => {
    const tool = endpointToTool(makeEndpoint({
      parameters: [{ name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['open', 'closed'] } }],
    }), BASE_URL, NO_AUTH, '');
    const field = tool.inputSchema.fields.find(f => f.name === 'status')!;
    expect(field.zodType).toContain('z.enum');
    expect(field.zodType).toContain('open');
    expect(field.zodType).toContain('closed');
  });

  it('adds body field when requestBody is present', () => {
    const tool = endpointToTool(makeEndpoint({
      method: 'POST',
      requestBody: { required: true, contentType: 'application/json', schema: { type: 'object' } },
    }), BASE_URL, NO_AUTH, '');
    const bodyField = tool.inputSchema.fields.find(f => f.name === 'body');
    expect(bodyField).toBeDefined();
    expect(bodyField?.optional).toBe(false);
  });

  it('generates implementation with correct HTTP method', () => {
    const tool = endpointToTool(makeEndpoint({ method: 'DELETE', path: '/pets/{id}' }), BASE_URL, NO_AUTH, '');
    expect(tool.implementation).toContain("method: 'DELETE'");
  });

  it('interpolates path params into URL', () => {
    const tool = endpointToTool(makeEndpoint({
      method: 'GET',
      path: '/pets/{petId}',
      parameters: [{ name: 'petId', in: 'path', required: true }],
    }), BASE_URL, NO_AUTH, '');
    expect(tool.implementation).toContain('${petId}');
  });

  it('includes auth headers in implementation', () => {
    const tool = endpointToTool(makeEndpoint({}), BASE_URL, AUTH_HEADERS, '');
    expect(tool.implementation).toContain(AUTH_HEADERS);
  });

  it('generates GraphQL implementation for GRAPHQL_QUERY', () => {
    const tool = endpointToTool(makeEndpoint({
      id: 'query_user',
      operationId: 'query_user',
      method: 'GRAPHQL_QUERY',
      path: 'https://api.example.com/graphql',
      parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
    }), BASE_URL, NO_AUTH, '');
    expect(tool.implementation).toContain('query');
    expect(tool.implementation).toContain('variables');
  });

  it('sanitizes hyphenated parameter names to camelCase', () => {
    const tool = endpointToTool(makeEndpoint({
      parameters: [{ name: 'user-id', in: 'query', required: false }],
    }), BASE_URL, NO_AUTH, '');
    const field = tool.inputSchema.fields.find(f => f.name === 'userId');
    expect(field).toBeDefined();
  });
});
