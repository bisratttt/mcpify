/**
 * Comprehensive tests against the complex-api.json fixture:
 * Stripe + Twilio patterns — circular refs, form bodies, oneOf,
 * multi-auth, large responses, nested schemas, safety classification,
 * additionalProperties, and workflow detection.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { parseSpec } from '../../src/parsers/index.js';
import { ApiIndexer } from '../../src/indexer/index.js';
import { classifySafety } from '../../src/indexer/index.js';
import { detectWorkflows } from '../../src/generator/workflows.js';
import { extractRequiredEnvVars } from '../../src/generator/auth.js';
import type { NormalizedSpec, Endpoint } from '../../src/types.js';

vi.mock('../../src/indexer/embed.js', () => ({
  embed: vi.fn(async () => ({ embedding: new Array(8).fill(0.1), dimensions: 8 })),
  buildEndpointText: vi.fn(() => 'test'),
}));

const FIXTURE = join(process.cwd(), 'tests/fixtures/complex-api.json');

let spec: NormalizedSpec;

beforeAll(async () => {
  spec = await parseSpec(FIXTURE);
});

// ── Parser: endpoint count and structure ──────────────────────────────────────

describe('parseSpec — complex-api.json: endpoint count and IDs', () => {
  it('parses exactly 17 endpoints', () => {
    expect(spec.endpoints).toHaveLength(17);
  });

  it('all endpoints have non-empty id, method, and path', () => {
    for (const ep of spec.endpoints) {
      expect(ep.id).toBeTruthy();
      expect(ep.method).toBeTruthy();
      expect(ep.path).toMatch(/^\//);
    }
  });

  it('operation IDs match what the spec declares', () => {
    const ids = spec.endpoints.map(e => e.id);
    expect(ids).toContain('list_customers');
    expect(ids).toContain('create_customer');
    expect(ids).toContain('get_customer');
    expect(ids).toContain('update_customer');
    expect(ids).toContain('delete_customer');
    expect(ids).toContain('list_subscriptions');
    expect(ids).toContain('create_subscription');
    expect(ids).toContain('create_charge');
    expect(ids).toContain('get_charge');
    expect(ids).toContain('create_refund');
    expect(ids).toContain('get_payment_method');
    expect(ids).toContain('create_message');
    expect(ids).toContain('list_messages');
    expect(ids).toContain('get_message');
    expect(ids).toContain('delete_message');
    expect(ids).toContain('create_webhook');
    expect(ids).toContain('delete_webhook');
  });
});

// ── Parser: form-encoded bodies ───────────────────────────────────────────────

describe('parseSpec — form-encoded request bodies', () => {
  function ep(id: string) {
    return spec.endpoints.find(e => e.id === id)!;
  }

  it('create_customer uses application/x-www-form-urlencoded', () => {
    expect(ep('create_customer').requestBody?.contentType).toBe('application/x-www-form-urlencoded');
  });

  it('create_customer body schema preserves field definitions', () => {
    const props = ep('create_customer').requestBody?.schema as { properties?: Record<string, unknown> };
    expect(props?.properties).toHaveProperty('name');
    expect(props?.properties).toHaveProperty('email');
    expect(props?.properties).toHaveProperty('description');
    expect(props?.properties).toHaveProperty('phone');
    expect(props?.properties).toHaveProperty('metadata');
  });

  it('create_charge uses form-encoded with required fields', () => {
    const body = ep('create_charge').requestBody!;
    expect(body.contentType).toBe('application/x-www-form-urlencoded');
    expect(body.required).toBe(true);
    const schema = body.schema as { required?: string[]; properties?: Record<string, unknown> };
    expect(schema.required).toContain('amount');
    expect(schema.required).toContain('currency');
  });

  it('create_message (Twilio) uses form-encoded with required From/To/Body', () => {
    const body = ep('create_message').requestBody!;
    expect(body.contentType).toBe('application/x-www-form-urlencoded');
    const schema = body.schema as { required?: string[] };
    expect(schema.required).toContain('From');
    expect(schema.required).toContain('To');
    expect(schema.required).toContain('Body');
  });

  it('create_webhook uses application/json (not form-encoded)', () => {
    expect(ep('create_webhook').requestBody?.contentType).toBe('application/json');
  });
});

// ── Parser: complex response schemas ─────────────────────────────────────────

describe('parseSpec — complex response schemas', () => {
  function resp0(id: string) {
    return spec.endpoints.find(e => e.id === id)!.responses[0];
  }

  it('list_customers response is a CustomerList envelope (data, has_more, url, total_count)', () => {
    const schema = resp0('list_customers').schema as { properties?: Record<string, unknown> };
    expect(schema?.properties).toHaveProperty('data');
    expect(schema?.properties).toHaveProperty('has_more');
    expect(schema?.properties).toHaveProperty('url');
    expect(schema?.properties).toHaveProperty('total_count');
  });

  it('get_customer response schema has 10+ top-level properties', () => {
    const schema = resp0('get_customer').schema as { properties?: Record<string, unknown> };
    expect(Object.keys(schema?.properties ?? {}).length).toBeGreaterThanOrEqual(10);
  });

  it('get_charge response schema has 25 top-level properties (large schema)', () => {
    const schema = resp0('get_charge').schema as { properties?: Record<string, unknown> };
    expect(Object.keys(schema?.properties ?? {}).length).toBeGreaterThanOrEqual(25);
  });

  it('get_charge.billing_details has nested address (3-level deep schema)', () => {
    const schema = resp0('get_charge').schema as { properties?: Record<string, { properties?: Record<string, unknown> }> };
    const billingDetails = schema?.properties?.['billing_details'];
    expect(billingDetails?.properties).toHaveProperty('address');
    expect(billingDetails?.properties).toHaveProperty('email');
  });

  it('get_payment_method response has oneOf schema (Card | BankAccount)', () => {
    const schema = resp0('get_payment_method').schema as { oneOf?: unknown[] };
    expect(Array.isArray(schema?.oneOf)).toBe(true);
    expect(schema.oneOf!.length).toBe(2);
  });

  it('list_messages response has Twilio-style pagination fields (page, page_count, next_page_uri)', () => {
    const schema = resp0('list_messages').schema as { properties?: Record<string, unknown> };
    expect(schema?.properties).toHaveProperty('page');
    expect(schema?.properties).toHaveProperty('page_count');
    expect(schema?.properties).toHaveProperty('next_page_uri');
    expect(schema?.properties).toHaveProperty('messages');
  });

  it('create_refund response has an inline schema (not a $ref)', () => {
    const schema = resp0('create_refund').schema as { properties?: Record<string, unknown> };
    expect(schema?.properties).toHaveProperty('id');
    expect(schema?.properties).toHaveProperty('amount');
    expect(schema?.properties).toHaveProperty('status');
  });
});

// ── Parser: auth schemes ──────────────────────────────────────────────────────

describe('parseSpec — authentication schemes', () => {
  it('extracts exactly 3 auth schemes', () => {
    expect(spec.auth).toHaveLength(3);
  });

  it('includes HTTP bearer auth (Stripe-style)', () => {
    const bearer = spec.auth.find(a => a.type === 'http' && a.scheme === 'bearer');
    expect(bearer).toBeDefined();
    expect(bearer!.name).toBe('bearerAuth');
  });

  it('includes HTTP basic auth (Twilio-style)', () => {
    const basic = spec.auth.find(a => a.type === 'http' && a.scheme === 'basic');
    expect(basic).toBeDefined();
    expect(basic!.name).toBe('basicAuth');
  });

  it('includes API key in header', () => {
    const apiKey = spec.auth.find(a => a.type === 'apiKey');
    expect(apiKey).toBeDefined();
    expect(apiKey!.name).toBe('apiKeyHeader');
    expect(apiKey!.in).toBe('header');
  });

  it('all schemes have envVar set', () => {
    for (const s of spec.auth) {
      expect(s.envVar).toBeTruthy();
    }
  });

  it('per-endpoint security: bearer endpoints do not claim basic auth', () => {
    const createCustomer = spec.endpoints.find(e => e.id === 'create_customer')!;
    expect(createCustomer.security).toEqual(['bearerAuth']);
  });

  it('per-endpoint security: Twilio endpoints use basicAuth only', () => {
    const createMessage = spec.endpoints.find(e => e.id === 'create_message')!;
    expect(createMessage.security).toEqual(['basicAuth']);
  });

  it('per-endpoint security: webhook endpoints use apiKeyHeader', () => {
    const createWebhook = spec.endpoints.find(e => e.id === 'create_webhook')!;
    expect(createWebhook.security).toEqual(['apiKeyHeader']);
  });

  it('extractRequiredEnvVars returns all 3 env vars when all schemes are used', () => {
    const envVars = extractRequiredEnvVars(spec.auth, spec.endpoints);
    expect(envVars).toHaveLength(3);
    const names = envVars.map(v => v.name);
    expect(names.some(n => n.includes('BEARERAUTH'))).toBe(true);
    expect(names.some(n => n.includes('BASICAUTH'))).toBe(true);
    expect(names.some(n => n.includes('APIKEYHEADER'))).toBe(true);
  });
});

// ── Parser: parameters ────────────────────────────────────────────────────────

describe('parseSpec — parameters', () => {
  it('get_message has 2 path params (AccountSid + MessageSid)', () => {
    const ep = spec.endpoints.find(e => e.id === 'get_message')!;
    const pathParams = ep.parameters.filter(p => p.in === 'path');
    expect(pathParams).toHaveLength(2);
    expect(pathParams.map(p => p.name)).toContain('AccountSid');
    expect(pathParams.map(p => p.name)).toContain('MessageSid');
  });

  it('list_messages has Twilio-style pagination params (Page, PageSize, PageToken)', () => {
    const ep = spec.endpoints.find(e => e.id === 'list_messages')!;
    const paramNames = ep.parameters.map(p => p.name);
    expect(paramNames).toContain('Page');
    expect(paramNames).toContain('PageSize');
    expect(paramNames).toContain('PageToken');
  });

  it('list_customers has Stripe-style pagination params (starting_after, ending_before, limit)', () => {
    const ep = spec.endpoints.find(e => e.id === 'list_customers')!;
    const paramNames = ep.parameters.map(p => p.name);
    expect(paramNames).toContain('starting_after');
    expect(paramNames).toContain('ending_before');
    expect(paramNames).toContain('limit');
  });

  it('list_subscriptions has a status enum param with 7 values', () => {
    const ep = spec.endpoints.find(e => e.id === 'list_subscriptions')!;
    const statusParam = ep.parameters.find(p => p.name === 'status')!;
    const enumValues = (statusParam.schema as { enum?: unknown[] })?.enum ?? [];
    expect(enumValues.length).toBe(7);
  });

  it('versioned Twilio path prefix /2010-04-01/ is preserved', () => {
    const twilioEps = spec.endpoints.filter(e => e.path.startsWith('/2010-04-01/'));
    expect(twilioEps.length).toBeGreaterThanOrEqual(4);
  });
});

// ── Safety classification ─────────────────────────────────────────────────────

describe('classifySafety — complex API endpoints', () => {
  function ep(id: string) {
    return spec.endpoints.find(e => e.id === id)!;
  }

  it('create_charge → billable (POST + "charge" in path/summary/description)', () => {
    expect(classifySafety(ep('create_charge'))).toBe('billable');
  });

  it('create_message → billable (POST + "send" / "billed" / "charge" in description)', () => {
    expect(classifySafety(ep('create_message'))).toBe('billable');
  });

  it('create_subscription → billable (POST + "subscription" keyword matches billing pattern)', () => {
    expect(classifySafety(ep('create_subscription'))).toBe('billable');
  });

  it('delete_customer → destructive (DELETE method)', () => {
    expect(classifySafety(ep('delete_customer'))).toBe('destructive');
  });

  it('delete_message → destructive (DELETE method)', () => {
    expect(classifySafety(ep('delete_message'))).toBe('destructive');
  });

  it('delete_webhook → destructive (DELETE method)', () => {
    expect(classifySafety(ep('delete_webhook'))).toBe('destructive');
  });

  it('list_customers → read (GET method)', () => {
    expect(classifySafety(ep('list_customers'))).toBe('read');
  });

  it('get_charge → read (GET method)', () => {
    expect(classifySafety(ep('get_charge'))).toBe('read');
  });

  it('create_customer → write (POST, no billable keywords)', () => {
    expect(classifySafety(ep('create_customer'))).toBe('write');
  });

  it('create_webhook → write (POST, no billable keywords)', () => {
    expect(classifySafety(ep('create_webhook'))).toBe('write');
  });

  it('create_refund → billable (description contains "charge", which matches the billable heuristic)', () => {
    // "Refunds a charge that has previously been created" — contains "charge"
    expect(classifySafety(ep('create_refund'))).toBe('billable');
  });
});

// ── Workflow detection ────────────────────────────────────────────────────────

describe('detectWorkflows — complex API', () => {
  it('detects CRUD on /v1/customers (list, create, get, update, delete)', () => {
    const matches = detectWorkflows(spec.endpoints);
    // resourcePrefix strips the /v1/ version prefix, so resource is 'customers'
    const crud = matches.find(m => m.pattern === 'crud' && m.resource === 'customers');
    expect(crud).toBeDefined();
    expect(crud!.endpointIds).toContain('list_customers');
    expect(crud!.endpointIds).toContain('create_customer');
    expect(crud!.endpointIds).toContain('get_customer');
    expect(crud!.endpointIds).toContain('delete_customer');
  });

  it('detects create-fetch or CRUD on /v1/charges', () => {
    const matches = detectWorkflows(spec.endpoints);
    const chargePattern = matches.find(m =>
      (m.pattern === 'create-fetch' || m.pattern === 'crud') &&
      m.resource.includes('charges')
    );
    expect(chargePattern).toBeDefined();
    expect(chargePattern!.endpointIds).toContain('create_charge');
    expect(chargePattern!.endpointIds).toContain('get_charge');
  });

  it('detects paginated-list on /v1/subscriptions (has starting_after param)', () => {
    const matches = detectWorkflows(spec.endpoints);
    const paginated = matches.find(m => m.pattern === 'paginated-list' && m.resource.includes('subscriptions'));
    expect(paginated).toBeDefined();
  });

  it('Twilio list_messages is NOT detected as paginated-list (path has {AccountSid} bracket param)', () => {
    // The paginated-list detector skips endpoints with any bracket param in the path,
    // because it can't distinguish "account-scoping param" (/Accounts/{AccountSid}/...)
    // from "item ID param" (/users/{id}). This is expected behaviour — the Twilio
    // collection path /2010-04-01/Accounts/{AccountSid}/Messages.json is treated as
    // an item-level path and excluded from collection-style detection.
    const matches = detectWorkflows(spec.endpoints);
    const twilioList = matches.find(m => m.pattern === 'paginated-list' && m.endpointIds.includes('list_messages'));
    expect(twilioList).toBeUndefined();
  });
});

// ── Sanitize: circular refs and complex schemas ───────────────────────────────

describe('ApiIndexer — circular refs and complex schemas from fixture', () => {
  async function indexAndGet(endpoints: Endpoint[]): Promise<Endpoint[]> {
    const s: NormalizedSpec = { ...spec, endpoints };
    const indexer = new ApiIndexer(join(tmpdir(), `complex-${randomUUID()}.sqlite`));
    await indexer.indexSpec(s, { provider: 'openai' });
    const all = indexer.getAll();
    indexer.close();
    return all;
  }

  it('indexes Customer (circular with Subscription) without crashing', async () => {
    const ep = spec.endpoints.find(e => e.id === 'get_customer')!;
    await expect(indexAndGet([ep])).resolves.toHaveLength(1);
  });

  it('produces JSON-serializable Customer endpoint (no circular in stored output)', async () => {
    const ep = spec.endpoints.find(e => e.id === 'get_customer')!;
    const [stored] = await indexAndGet([ep]);
    // If circular ref leaked through, JSON.stringify would throw
    expect(() => JSON.stringify(stored)).not.toThrow();
  });

  it('preserves Customer response schema top-level fields after sanitize', async () => {
    const ep = spec.endpoints.find(e => e.id === 'get_customer')!;
    const [stored] = await indexAndGet([ep]);
    const schema = stored.responses[0]?.schema as { properties?: Record<string, unknown> } | undefined;
    expect(schema?.properties).toHaveProperty('id');
    expect(schema?.properties).toHaveProperty('name');
    expect(schema?.properties).toHaveProperty('email');
  });

  it('preserves nested Address fields inside Customer (2-level nesting)', async () => {
    const ep = spec.endpoints.find(e => e.id === 'get_customer')!;
    const [stored] = await indexAndGet([ep]);
    const schema = stored.responses[0]?.schema as { properties?: Record<string, { properties?: Record<string, unknown> }> };
    const address = schema?.properties?.['address'];
    // Address should be preserved with at least city
    expect(address?.properties).toHaveProperty('city');
  });

  it('preserves additionalProperties on metadata field after sanitize', async () => {
    const ep = spec.endpoints.find(e => e.id === 'create_customer')!;
    const [stored] = await indexAndGet([ep]);
    const bodySchema = stored.requestBody?.schema as { properties?: Record<string, { additionalProperties?: unknown }> };
    const metadata = bodySchema?.properties?.['metadata'];
    expect(metadata?.additionalProperties).toBeDefined();
    expect((metadata?.additionalProperties as { type?: string })?.type).toBe('string');
  });

  it('preserves oneOf schema for PaymentMethod (Card and BankAccount variants)', async () => {
    const ep = spec.endpoints.find(e => e.id === 'get_payment_method')!;
    const [stored] = await indexAndGet([ep]);
    const schema = stored.responses[0]?.schema as { oneOf?: unknown[] };
    expect(Array.isArray(schema?.oneOf)).toBe(true);
    expect(schema.oneOf!.length).toBe(2);
    // Both variants should have at least id and last4 / routing_number
    const variants = schema.oneOf! as Array<{ properties?: Record<string, unknown> }>;
    expect(variants.some(v => v.properties?.['last4'])).toBe(true);
  });

  it('preserves Card.brand enum with 8 values', async () => {
    const ep = spec.endpoints.find(e => e.id === 'get_payment_method')!;
    const [stored] = await indexAndGet([ep]);
    const schema = stored.responses[0]?.schema as { oneOf?: Array<{ properties?: Record<string, { enum?: unknown[] }> }> };
    const card = schema?.oneOf?.find(v => v.properties?.['brand']);
    expect(card?.properties?.['brand']?.enum).toHaveLength(8);
  });

  it('preserves Message.status enum with 13 values', async () => {
    const ep = spec.endpoints.find(e => e.id === 'get_message')!;
    const [stored] = await indexAndGet([ep]);
    const schema = stored.responses[0]?.schema as { properties?: Record<string, { enum?: unknown[] }> };
    expect(schema?.properties?.['status']?.enum).toHaveLength(13);
  });

  it('Charge response schema retains 20+ properties after sanitize', async () => {
    const ep = spec.endpoints.find(e => e.id === 'get_charge')!;
    const [stored] = await indexAndGet([ep]);
    const schema = stored.responses[0]?.schema as { properties?: Record<string, unknown> };
    expect(Object.keys(schema?.properties ?? {}).length).toBeGreaterThanOrEqual(20);
  });

  it('billing_details.address preserved in Charge (3-level nesting survives sanitize)', async () => {
    const ep = spec.endpoints.find(e => e.id === 'get_charge')!;
    const [stored] = await indexAndGet([ep]);
    const schema = stored.responses[0]?.schema as {
      properties?: Record<string, { properties?: Record<string, { properties?: Record<string, unknown> }> }>
    };
    const billingAddr = schema?.properties?.['billing_details']?.properties?.['address'];
    expect(billingAddr?.properties).toHaveProperty('city');
  });

  it('Twilio MessageListResponse nested pagination fields preserved', async () => {
    const ep = spec.endpoints.find(e => e.id === 'list_messages')!;
    const [stored] = await indexAndGet([ep]);
    const schema = stored.responses[0]?.schema as { properties?: Record<string, unknown> };
    expect(schema?.properties).toHaveProperty('page');
    expect(schema?.properties).toHaveProperty('next_page_uri');
    expect(schema?.properties).toHaveProperty('messages');
  });

  it('indexes all 17 endpoints including circular-ref ones without any crash', async () => {
    const all = await indexAndGet(spec.endpoints);
    expect(all).toHaveLength(17);
    // Every stored endpoint must be JSON-serializable
    for (const ep of all) {
      expect(() => JSON.stringify(ep)).not.toThrow();
    }
  });
});
