import { describe, it, expect } from 'vitest';
import { detectWorkflows, generateWorkflowsMd } from '../../src/generator/workflows.js';
import type { Endpoint } from '../../src/types.js';

function ep(overrides: Partial<Endpoint> & Pick<Endpoint, 'id' | 'method' | 'path'>): Endpoint {
  return { tags: [], parameters: [], responses: [], ...overrides };
}

const PETS_CRUD: Endpoint[] = [
  ep({ id: 'listPets',   method: 'GET',    path: '/pets' }),
  ep({ id: 'createPet',  method: 'POST',   path: '/pets' }),
  ep({ id: 'getPet',     method: 'GET',    path: '/pets/{petId}' }),
  ep({ id: 'updatePet',  method: 'PATCH',  path: '/pets/{petId}' }),
  ep({ id: 'deletePet',  method: 'DELETE', path: '/pets/{petId}' }),
];

describe('detectWorkflows — CRUD', () => {
  it('detects a full CRUD group', () => {
    const matches = detectWorkflows(PETS_CRUD);
    const crud = matches.find(m => m.pattern === 'crud');
    expect(crud).toBeDefined();
    expect(crud!.resource).toBe('pets');
  });

  it('CRUD includes all 5 endpoint IDs', () => {
    const [crud] = detectWorkflows(PETS_CRUD);
    expect(crud.endpointIds).toContain('listPets');
    expect(crud.endpointIds).toContain('createPet');
    expect(crud.endpointIds).toContain('getPet');
    expect(crud.endpointIds).toContain('updatePet');
    expect(crud.endpointIds).toContain('deletePet');
  });

  it('CRUD suppresses Create→Fetch on the same prefix', () => {
    const matches = detectWorkflows(PETS_CRUD);
    expect(matches.filter(m => m.pattern === 'create-fetch')).toHaveLength(0);
  });

  it('detects multiple independent CRUD groups', () => {
    const endpoints: Endpoint[] = [
      ...PETS_CRUD,
      ep({ id: 'listOrders',  method: 'GET',    path: '/orders' }),
      ep({ id: 'createOrder', method: 'POST',   path: '/orders' }),
      ep({ id: 'getOrder',    method: 'GET',    path: '/orders/{orderId}' }),
      ep({ id: 'deleteOrder', method: 'DELETE', path: '/orders/{orderId}' }),
    ];
    const matches = detectWorkflows(endpoints).filter(m => m.pattern === 'crud');
    expect(matches).toHaveLength(2);
    expect(matches.map(m => m.resource)).toContain('pets');
    expect(matches.map(m => m.resource)).toContain('orders');
  });
});

describe('detectWorkflows — Create→Fetch', () => {
  it('detects create-fetch when no full CRUD', () => {
    const endpoints: Endpoint[] = [
      ep({ id: 'createOrder', method: 'POST', path: '/orders' }),
      ep({ id: 'getOrder',    method: 'GET',  path: '/orders/{orderId}' }),
    ];
    const matches = detectWorkflows(endpoints);
    const cf = matches.find(m => m.pattern === 'create-fetch');
    expect(cf).toBeDefined();
    expect(cf!.endpointIds).toEqual(['createOrder', 'getOrder']);
  });

  it('returns no create-fetch for a single endpoint', () => {
    const matches = detectWorkflows([ep({ id: 'createThing', method: 'POST', path: '/things' })]);
    expect(matches.filter(m => m.pattern === 'create-fetch')).toHaveLength(0);
  });
});

describe('detectWorkflows — Paginated list', () => {
  it('detects pagination by query param name', () => {
    const endpoints: Endpoint[] = [ep({
      id: 'listUsers',
      method: 'GET',
      path: '/users',
      parameters: [{ name: 'cursor', in: 'query', required: false }],
    })];
    const matches = detectWorkflows(endpoints);
    expect(matches.find(m => m.pattern === 'paginated-list')).toBeDefined();
  });

  it('detects pagination by response schema field', () => {
    const endpoints: Endpoint[] = [ep({
      id: 'listItems',
      method: 'GET',
      path: '/items',
      responses: [{ statusCode: '200', schema: { properties: { data: {}, has_more: { type: 'boolean' } } } }],
    })];
    const matches = detectWorkflows(endpoints);
    expect(matches.find(m => m.pattern === 'paginated-list')).toBeDefined();
  });

  it('does not flag GET/{id} as paginated', () => {
    const endpoints: Endpoint[] = [ep({
      id: 'getItem',
      method: 'GET',
      path: '/items/{id}',
      parameters: [{ name: 'cursor', in: 'query', required: false }],
    })];
    const matches = detectWorkflows(endpoints);
    expect(matches.filter(m => m.pattern === 'paginated-list')).toHaveLength(0);
  });
});

describe('detectWorkflows — Search→Act', () => {
  it('detects search-act pattern', () => {
    const endpoints: Endpoint[] = [
      ep({
        id: 'searchProducts',
        method: 'GET',
        path: '/products',
        parameters: [
          { name: 'category', in: 'query', required: false },
          { name: 'status',   in: 'query', required: false },
        ],
      }),
      ep({ id: 'deleteProduct', method: 'DELETE', path: '/products/{productId}' }),
    ];
    const matches = detectWorkflows(endpoints);
    const sa = matches.find(m => m.pattern === 'search-act');
    expect(sa).toBeDefined();
    expect(sa!.endpointIds).toContain('searchProducts');
    expect(sa!.endpointIds).toContain('deleteProduct');
  });

  it('returns empty for unrelated endpoints', () => {
    const endpoints: Endpoint[] = [
      ep({ id: 'login',  method: 'POST', path: '/auth/login' }),
      ep({ id: 'health', method: 'GET',  path: '/health' }),
    ];
    expect(detectWorkflows(endpoints)).toHaveLength(0);
  });
});

describe('generateWorkflowsMd', () => {
  it('returns a markdown string starting with #', () => {
    const md = generateWorkflowsMd(PETS_CRUD);
    expect(typeof md).toBe('string');
    expect(md.trimStart()).toMatch(/^#/);
  });

  it('uses actual endpoint IDs not placeholders', () => {
    const md = generateWorkflowsMd(PETS_CRUD);
    expect(md).toContain('createPet');
    expect(md).toContain('getPet');
    expect(md).not.toContain('[endpointId]');
  });

  it('includes "Why this matters" section', () => {
    const md = generateWorkflowsMd(PETS_CRUD);
    expect(md).toContain('Why this matters');
  });

  it('includes step-by-step instructions', () => {
    const md = generateWorkflowsMd(PETS_CRUD);
    expect(md).toContain('Steps:');
  });

  it('returns graceful fallback for empty spec', () => {
    const md = generateWorkflowsMd([]);
    expect(md).toContain('No multi-step workflow patterns');
  });

  it('uses ## heading for CRUD pattern', () => {
    const md = generateWorkflowsMd(PETS_CRUD);
    expect(md).toMatch(/^## CRUD:/m);
  });

  it('uses ## heading for paginated-list pattern', () => {
    const endpoints = [ep({
      id: 'listUsers', method: 'GET', path: '/users',
      parameters: [{ name: 'cursor', in: 'query', required: false }],
    })];
    const md = generateWorkflowsMd(endpoints);
    expect(md).toMatch(/^## Paginated List:/m);
  });

  it('uses ## heading for create-fetch pattern', () => {
    const endpoints: Endpoint[] = [
      ep({ id: 'createOrder', method: 'POST', path: '/orders' }),
      ep({ id: 'getOrder',    method: 'GET',  path: '/orders/{orderId}' }),
    ];
    const md = generateWorkflowsMd(endpoints);
    expect(md).toMatch(/^## Create → Fetch:/m);
  });

  it('uses ## heading for search-act pattern', () => {
    const endpoints: Endpoint[] = [
      ep({ id: 'searchProducts', method: 'GET', path: '/products',
        parameters: [{ name: 'status', in: 'query', required: false }] }),
      ep({ id: 'deleteProduct', method: 'DELETE', path: '/products/{productId}' }),
    ];
    const md = generateWorkflowsMd(endpoints);
    expect(md).toMatch(/^## Search → Act:/m);
  });
});
