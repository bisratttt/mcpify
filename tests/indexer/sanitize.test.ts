import { describe, it, expect, vi } from 'vitest';
import { ApiIndexer } from '../../src/indexer/index.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { NormalizedSpec } from '../../src/types.js';

vi.mock('../../src/indexer/embed.js', () => ({
  embed: vi.fn(async () => ({ embedding: new Array(8).fill(0.1), dimensions: 8 })),
  buildEndpointText: vi.fn(() => 'test text'),
}));

describe('sanitizeEndpoint — schema preservation', () => {
  it('preserves nested object properties in parameter schemas', async () => {
    const spec: NormalizedSpec = {
      info: { title: 'Schema Test', version: '1.0.0' },
      servers: [],
      auth: [],
      rawFormat: 'openapi3',
      endpoints: [{
        id: 'createOrder',
        method: 'POST',
        path: '/orders',
        tags: [],
        parameters: [{
          name: 'filter',
          in: 'query',
          required: false,
          schema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['pending', 'complete'] },
              amount: { type: 'number', minimum: 0, maximum: 10000 },
            },
            required: ['status'],
          },
        }],
        requestBody: {
          required: true,
          contentType: 'application/json',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 100 },
              quantity: { type: 'integer', minimum: 1 },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['name', 'quantity'],
          },
        },
        responses: [],
      }],
    };

    const indexer = new ApiIndexer(join(tmpdir(), `build-mcp-schema-${randomUUID()}.sqlite`));
    await indexer.indexSpec(spec, { provider: 'openai' });
    const all = indexer.getAll();
    const ep = all[0];

    // Nested properties preserved in param schema
    const filterSchema = ep.parameters[0].schema as Record<string, unknown>;
    expect(filterSchema.type).toBe('object');
    expect((filterSchema.properties as Record<string, unknown>)['status']).toEqual({ type: 'string', enum: ['pending', 'complete'] });
    expect((filterSchema.properties as Record<string, unknown>)['amount']).toEqual({ type: 'number', minimum: 0, maximum: 10000 });
    expect(filterSchema.required).toEqual(['status']);

    // Body schema: nested properties, required array, array items — all preserved
    const bodySchema = ep.requestBody?.schema as Record<string, unknown>;
    expect(bodySchema.required).toEqual(['name', 'quantity']);
    const bodyProps = bodySchema.properties as Record<string, Record<string, unknown>>;
    expect(bodyProps['name']).toEqual({ type: 'string', minLength: 1, maxLength: 100 });
    expect(bodyProps['quantity']).toEqual({ type: 'integer', minimum: 1 });
    expect(bodyProps['tags']).toEqual({ type: 'array', items: { type: 'string' } });

    indexer.close();
  });
});

describe('sanitizeEndpoint — response schema preservation', () => {
  function makeSpec(responses: NormalizedSpec['endpoints'][0]['responses']): NormalizedSpec {
    return {
      info: { title: 'Resp Test', version: '1.0.0' },
      servers: [],
      auth: [],
      rawFormat: 'openapi3',
      endpoints: [{
        id: 'getItem',
        method: 'GET',
        path: '/items/{id}',
        tags: [],
        parameters: [],
        responses,
      }],
    };
  }

  it('preserves 2xx responses with object schemas', async () => {
    const spec = makeSpec([
      { statusCode: '200', schema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } }, required: ['id'] } },
      { statusCode: '201', schema: { type: 'object', properties: { created: { type: 'boolean' } } } },
    ]);
    const indexer = new ApiIndexer(join(tmpdir(), `build-mcp-resp-${randomUUID()}.sqlite`));
    await indexer.indexSpec(spec, { provider: 'openai' });
    const [ep] = indexer.getAll();
    expect(ep.responses).toHaveLength(2);
    expect((ep.responses[0].schema as Record<string, unknown>)['properties']).toMatchObject({ id: { type: 'string' }, name: { type: 'string' } });
    expect((ep.responses[0].schema as Record<string, unknown>)['required']).toEqual(['id']);
    indexer.close();
  });

  it('discards non-2xx responses', async () => {
    const spec = makeSpec([
      { statusCode: '200', schema: { type: 'object', properties: { id: { type: 'string' } } } },
      { statusCode: '400', schema: { type: 'object', properties: { error: { type: 'string' } } } },
      { statusCode: '500' },
    ]);
    const indexer = new ApiIndexer(join(tmpdir(), `build-mcp-resp-${randomUUID()}.sqlite`));
    await indexer.indexSpec(spec, { provider: 'openai' });
    const [ep] = indexer.getAll();
    expect(ep.responses).toHaveLength(1);
    expect(ep.responses[0].statusCode).toBe('200');
    indexer.close();
  });

  it('caps responses at 2 entries', async () => {
    const spec = makeSpec([
      { statusCode: '200', schema: { type: 'object' } },
      { statusCode: '201', schema: { type: 'object' } },
      { statusCode: '202', schema: { type: 'object' } },
    ]);
    const indexer = new ApiIndexer(join(tmpdir(), `build-mcp-resp-${randomUUID()}.sqlite`));
    await indexer.indexSpec(spec, { provider: 'openai' });
    const [ep] = indexer.getAll();
    expect(ep.responses).toHaveLength(2);
    indexer.close();
  });

  it('stores 204 with no schema without crashing', async () => {
    const spec = makeSpec([{ statusCode: '204' }]);
    const indexer = new ApiIndexer(join(tmpdir(), `build-mcp-resp-${randomUUID()}.sqlite`));
    await indexer.indexSpec(spec, { provider: 'openai' });
    const [ep] = indexer.getAll();
    expect(ep.responses).toHaveLength(1);
    expect(ep.responses[0].schema).toBeUndefined();
    indexer.close();
  });
});

describe('sanitizeEndpoint — circular schema handling', () => {
  it('indexes an endpoint whose schema contains circular references', async () => {
    // Simulate what swagger-parser produces after dereferencing Stripe-like specs:
    // schema objects that reference each other circularly
    const circular: Record<string, unknown> = { type: 'object' };
    circular['self'] = circular; // circular reference

    const spec: NormalizedSpec = {
      info: { title: 'Circular Test', version: '1.0.0' },
      servers: [],
      auth: [],
      rawFormat: 'openapi3',
      endpoints: [{
        id: 'createCharge',
        method: 'POST',
        path: '/v1/charges',
        summary: 'Create a charge',
        tags: ['charges'],
        parameters: [
          { name: 'amount', in: 'query', required: true, schema: circular },
        ],
        requestBody: {
          required: true,
          contentType: 'application/x-www-form-urlencoded',
          schema: circular,
        },
        responses: [{ statusCode: '200', schema: circular }],
      }],
    };

    const indexer = new ApiIndexer(join(tmpdir(), `build-mcp-circ-${randomUUID()}.sqlite`));
    // Should not throw "Converting circular structure to JSON"
    await expect(indexer.indexSpec(spec, { provider: 'openai' })).resolves.not.toThrow();

    const all = indexer.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('createCharge');
    // Parameter structure and safe scalar values (type) are preserved
    expect(all[0].parameters[0].name).toBe('amount');
    expect(all[0].parameters[0].schema).toEqual({ type: 'object' });
    expect(all[0].requestBody?.contentType).toBe('application/x-www-form-urlencoded');
    // Circular body schema: type is preserved, circular properties are not traversed
    expect(all[0].requestBody?.schema).toEqual({ type: 'object' });
    // The circular reference itself must not be stored
    expect(JSON.stringify(all[0])).not.toContain('self');
    expect(all[0].responses).toHaveLength(1);
    expect(all[0].responses[0].statusCode).toBe('200');
    expect(all[0].responses[0].schema).toEqual({ type: 'object' });
    indexer.close();
  });
});
