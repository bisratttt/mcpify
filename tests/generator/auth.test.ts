import { describe, it, expect } from 'vitest';
import {
  extractRequiredEnvVars,
  buildAuthHeaders,
  buildAuthQueryParams,
  buildDotEnvExample,
} from '../../src/generator/auth.js';
import type { AuthScheme, Endpoint } from '../../src/types.js';

const apiKeyHeaderScheme: AuthScheme = {
  name: 'apiKey',
  type: 'apiKey',
  in: 'header',
  envVar: 'MYAPI_APIKEY',
};

const bearerScheme: AuthScheme = {
  name: 'bearerAuth',
  type: 'http',
  scheme: 'bearer',
  envVar: 'MYAPI_BEARERAUTH',
};

const basicScheme: AuthScheme = {
  name: 'basicAuth',
  type: 'http',
  scheme: 'basic',
  envVar: 'MYAPI_BASICAUTH',
};

const oauth2Scheme: AuthScheme = {
  name: 'oauth2',
  type: 'oauth2',
  envVar: 'MYAPI_OAUTH2_ACCESS_TOKEN',
};

const apiKeyQueryScheme: AuthScheme = {
  name: 'queryKey',
  type: 'apiKey',
  in: 'query',
  envVar: 'MYAPI_QUERYKEY',
};

const endpoint = (security?: string[]): Endpoint => ({
  id: 'testOp',
  method: 'GET',
  path: '/test',
  tags: [],
  parameters: [],
  responses: [],
  security,
});

describe('extractRequiredEnvVars', () => {
  it('returns all schemes when no endpoints specify security', () => {
    const endpoints = [endpoint()]; // no security field
    const vars = extractRequiredEnvVars([apiKeyHeaderScheme, bearerScheme], endpoints);
    expect(vars).toHaveLength(2);
  });

  it('filters to only schemes used by endpoints', () => {
    const endpoints = [endpoint(['apiKey'])];
    const vars = extractRequiredEnvVars([apiKeyHeaderScheme, bearerScheme], endpoints);
    expect(vars).toHaveLength(1);
    expect(vars[0].name).toBe('MYAPI_APIKEY');
  });

  it('includes schemes used by any endpoint', () => {
    const endpoints = [endpoint(['apiKey']), endpoint(['bearerAuth'])];
    const vars = extractRequiredEnvVars([apiKeyHeaderScheme, bearerScheme], endpoints);
    expect(vars).toHaveLength(2);
  });

  it('returns empty array when no auth schemes', () => {
    const vars = extractRequiredEnvVars([], [endpoint()]);
    expect(vars).toHaveLength(0);
  });

  it('generates correct description for apiKey header', () => {
    const vars = extractRequiredEnvVars([apiKeyHeaderScheme], [endpoint()]);
    expect(vars[0].description).toMatch(/header/);
    expect(vars[0].description).toMatch(/apiKey/);
  });

  it('generates correct description for bearer', () => {
    const vars = extractRequiredEnvVars([bearerScheme], [endpoint()]);
    expect(vars[0].description).toMatch(/Bearer/);
  });

  it('generates correct description for basic auth', () => {
    const vars = extractRequiredEnvVars([basicScheme], [endpoint()]);
    expect(vars[0].description).toMatch(/Basic/);
  });

  it('generates correct description for oauth2', () => {
    const vars = extractRequiredEnvVars([oauth2Scheme], [endpoint()]);
    expect(vars[0].description).toMatch(/OAuth2/i);
  });
});

describe('buildAuthHeaders', () => {
  it('returns empty object literal for no auth', () => {
    expect(buildAuthHeaders([])).toBe('{}');
  });

  it('includes Authorization Bearer for http bearer scheme', () => {
    const headers = buildAuthHeaders([bearerScheme]);
    expect(headers).toContain('Authorization');
    expect(headers).toContain('Bearer');
    expect(headers).toContain('MYAPI_BEARERAUTH');
  });

  it('includes Authorization Basic for http basic scheme', () => {
    const headers = buildAuthHeaders([basicScheme]);
    expect(headers).toContain('Authorization');
    expect(headers).toContain('Basic');
  });

  it('includes custom header name for apiKey in header', () => {
    const headers = buildAuthHeaders([apiKeyHeaderScheme]);
    expect(headers).toContain('apiKey');
    expect(headers).toContain('MYAPI_APIKEY');
  });

  it('does not include query-based apiKey in headers', () => {
    const headers = buildAuthHeaders([apiKeyQueryScheme]);
    // query keys are handled separately
    expect(headers).not.toContain('queryKey');
  });
});

describe('buildAuthQueryParams', () => {
  it('returns empty string when no query-based auth', () => {
    expect(buildAuthQueryParams([bearerScheme])).toBe('');
  });

  it('generates params.set for apiKey in query', () => {
    const code = buildAuthQueryParams([apiKeyQueryScheme]);
    expect(code).toContain("'queryKey'");
    expect(code).toContain('MYAPI_QUERYKEY');
  });
});

describe('buildDotEnvExample', () => {
  it('generates placeholder entries', () => {
    const envVars = [{ name: 'MY_KEY', description: 'An API key', required: true }];
    const content = buildDotEnvExample(envVars);
    expect(content).toContain('MY_KEY=');
    expect(content).toContain('An API key');
  });

  it('generates no-auth message for empty list', () => {
    const content = buildDotEnvExample([]);
    expect(content).toContain('No authentication');
  });
});
