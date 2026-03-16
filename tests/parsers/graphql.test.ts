import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseGraphQL } from '../../src/parsers/graphql.js';

const fixtures = resolve(fileURLToPath(import.meta.url), '../../fixtures');

function loadSchema() {
  return readFileSync(resolve(fixtures, 'schema.graphql'), 'utf-8');
}

describe('GraphQL parser', () => {
  it('returns correct format', () => {
    const spec = parseGraphQL(loadSchema());
    expect(spec.rawFormat).toBe('graphql');
  });

  it('extracts queries as GRAPHQL_QUERY endpoints', () => {
    const spec = parseGraphQL(loadSchema());
    const queries = spec.endpoints.filter(e => e.method === 'GRAPHQL_QUERY');
    expect(queries).toHaveLength(2); // user, users
  });

  it('extracts mutations as GRAPHQL_MUTATION endpoints', () => {
    const spec = parseGraphQL(loadSchema());
    const mutations = spec.endpoints.filter(e => e.method === 'GRAPHQL_MUTATION');
    expect(mutations).toHaveLength(2); // createUser, deleteUser
  });

  it('extracts subscriptions as GRAPHQL_SUBSCRIPTION endpoints', () => {
    const spec = parseGraphQL(loadSchema());
    const subs = spec.endpoints.filter(e => e.method === 'GRAPHQL_SUBSCRIPTION');
    expect(subs).toHaveLength(1); // userUpdated
  });

  it('extracts total endpoint count', () => {
    const spec = parseGraphQL(loadSchema());
    expect(spec.endpoints).toHaveLength(5);
  });

  it('generates correct operationId', () => {
    const spec = parseGraphQL(loadSchema());
    expect(spec.endpoints.map(e => e.id)).toContain('query_user');
    expect(spec.endpoints.map(e => e.id)).toContain('mutation_createUser');
    expect(spec.endpoints.map(e => e.id)).toContain('subscription_userUpdated');
  });

  it('extracts description from GraphQL docstrings', () => {
    const spec = parseGraphQL(loadSchema());
    const user = spec.endpoints.find(e => e.id === 'query_user')!;
    expect(user.summary).toBe('Get a user by ID');
  });

  it('tags queries/mutations/subscriptions correctly', () => {
    const spec = parseGraphQL(loadSchema());
    const query = spec.endpoints.find(e => e.method === 'GRAPHQL_QUERY')!;
    expect(query.tags).toContain('queries');
    const mutation = spec.endpoints.find(e => e.method === 'GRAPHQL_MUTATION')!;
    expect(mutation.tags).toContain('mutations');
    const sub = spec.endpoints.find(e => e.method === 'GRAPHQL_SUBSCRIPTION')!;
    expect(sub.tags).toContain('subscriptions');
  });

  it('extracts required arguments as parameters', () => {
    const spec = parseGraphQL(loadSchema());
    const user = spec.endpoints.find(e => e.id === 'query_user')!;
    const idParam = user.parameters.find(p => p.name === 'id')!;
    expect(idParam).toBeDefined();
    expect(idParam.required).toBe(true);
  });

  it('extracts optional arguments as optional parameters', () => {
    const spec = parseGraphQL(loadSchema());
    const users = spec.endpoints.find(e => e.id === 'query_users')!;
    const limitParam = users.parameters.find(p => p.name === 'limit')!;
    expect(limitParam.required).toBe(false);
  });

  it('maps Int to integer JSON schema type', () => {
    const spec = parseGraphQL(loadSchema());
    const users = spec.endpoints.find(e => e.id === 'query_users')!;
    const limitParam = users.parameters.find(p => p.name === 'limit')!;
    expect(limitParam.schema?.type).toBe('integer');
  });

  it('uses provided endpoint URL for all operations', () => {
    const spec = parseGraphQL(loadSchema(), 'https://api.example.com/graphql');
    spec.endpoints.forEach(ep => {
      expect(ep.path).toBe('https://api.example.com/graphql');
    });
  });
});
