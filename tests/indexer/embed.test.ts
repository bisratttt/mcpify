import { describe, it, expect } from 'vitest';
import { buildEndpointText } from '../../src/indexer/embed.js';

describe('buildEndpointText', () => {
  it('includes method, path, summary, description, tags, and param names', () => {
    const text = buildEndpointText({
      method: 'GET',
      path: '/pets',
      summary: 'List pets',
      description: 'Returns all pets',
      tags: ['pets'],
      parameters: [{ name: 'limit', description: 'Max results' }],
    });
    expect(text).toContain('GET /pets');
    expect(text).toContain('List pets');
    expect(text).toContain('Returns all pets');
    expect(text).toContain('pets');
    expect(text).toContain('limit: Max results');
  });

  it('includes request body field names for semantic matching', () => {
    const text = buildEndpointText({
      method: 'POST',
      path: '/pets',
      summary: 'Create a pet',
      tags: [],
      parameters: [],
      requestBody: {
        schema: { properties: { name: {}, photoUrls: {}, status: {} } },
      },
    });
    expect(text).toContain('name');
    expect(text).toContain('photoUrls');
    expect(text).toContain('status');
  });

  it('includes request body description', () => {
    const text = buildEndpointText({
      method: 'POST',
      path: '/users',
      summary: 'Create user',
      tags: [],
      parameters: [],
      requestBody: { description: 'User account details' },
    });
    expect(text).toContain('User account details');
  });

  it('omits body section when no requestBody', () => {
    const text = buildEndpointText({
      method: 'GET',
      path: '/pets',
      summary: 'List pets',
      tags: [],
      parameters: [],
    });
    // Should not have trailing pipe separators or undefined
    expect(text).not.toContain('undefined');
    expect(text).not.toMatch(/\| *$/);
  });

  it('omits body fields when schema has no properties', () => {
    const before = buildEndpointText({
      method: 'POST', path: '/x', summary: 'X', tags: [], parameters: [],
    });
    const after = buildEndpointText({
      method: 'POST', path: '/x', summary: 'X', tags: [], parameters: [],
      requestBody: { schema: {} },
    });
    expect(before).toBe(after);
  });
});
