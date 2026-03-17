import { DatabaseSync } from 'node:sqlite';
import type { NormalizedSpec, Endpoint, EmbedConfig, SafetyLevel } from '../types.js';
import { embed, buildEndpointText } from './embed.js';

/**
 * Extract only safe, non-circular scalar values from a parameter schema.
 * Dereferenced specs can produce circular object references that crash JSON.stringify,
 * but leaf values like `type`, `format`, and `enum` are always primitives — safe to keep.
 */
function simplifyParamSchema(schema: unknown): { type?: string; format?: string; enum?: unknown[] } | undefined {
  if (!schema || typeof schema !== 'object') return undefined;
  const s = schema as Record<string, unknown>;
  const out: { type?: string; format?: string; enum?: unknown[] } = {};
  if (typeof s['type'] === 'string') out.type = s['type'];
  if (typeof s['format'] === 'string') out.format = s['format'];
  if (Array.isArray(s['enum'])) out.enum = s['enum'] as unknown[];
  return Object.keys(out).length ? out : undefined;
}

/**
 * Extract only the top-level property names and their primitive types from a body schema.
 * We only go one level deep so we never traverse circular references introduced by dereference().
 */
function simplifyBodySchema(schema: unknown): { properties?: Record<string, { type?: string }> } | undefined {
  if (!schema || typeof schema !== 'object') return undefined;
  const s = schema as Record<string, unknown>;
  if (!s['properties'] || typeof s['properties'] !== 'object') return undefined;
  const props = s['properties'] as Record<string, unknown>;
  const simplified: Record<string, { type?: string }> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v && typeof v === 'object') {
      const pSchema = v as Record<string, unknown>;
      simplified[k] = typeof pSchema['type'] === 'string' ? { type: pSchema['type'] } : {};
    }
  }
  return Object.keys(simplified).length ? { properties: simplified } : undefined;
}

/**
 * Classify an endpoint's safety level based on HTTP method and text heuristics.
 *
 * Priority: billable > destructive > write > read
 *
 * BILLABLE — mutating calls that cost money or trigger external side effects
 *   (charges, payments, invoices, SMS/email sends). Errs on the side of caution.
 * DESTRUCTIVE — DELETE method or mutating calls with irreversible semantics
 *   (cancel, revoke, purge, terminate, etc.)
 * WRITE — any other state-mutating method (POST, PUT, PATCH)
 * READ — everything else (GET, HEAD, OPTIONS)
 */
export function classifySafety(ep: Pick<Endpoint, 'method' | 'path' | 'summary' | 'description'>): SafetyLevel {
  const method = ep.method as string;
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const text = [ep.path, ep.summary, ep.description].filter(Boolean).join(' ').toLowerCase();

  // Destructive checked before billable: "cancel payment" is more importantly
  // destructive than billable — the cancellation is the dominant risk signal.
  if (method === 'DELETE' || (isMutating && [
    /\b(cancel|revoke|disable|suspend|archive|terminate)\b/,
    /\b(purge|destroy|remove|wipe|flush|close|reset)\b/,
  ].some(p => p.test(text)))) {
    return 'destructive';
  }

  if (isMutating && [
    /\bcharge[sd]?\b/, /\bpayment[s]?\b/, /\binvoice[s]?\b/,
    /\bpurchase[s]?\b/, /\btransaction[s]?\b/, /\bbill(ing)?\b/,
    /\bcheckout\b/, /\bsubscri(be|ption)\b/,
    /\bsend\b/, /\bsms\b/, /\bmms\b/, /\bnotif(y|ication)\b/,
  ].some(p => p.test(text))) {
    return 'billable';
  }

  if (['POST', 'PUT', 'PATCH'].includes(method)) return 'write';
  return 'read';
}

/**
 * Sanitize an endpoint for SQLite storage: keep all structural info needed by call_api
 * and search_docs (param types, body schema fields), but only store safe scalar values
 * to avoid circular-reference crashes from swagger-parser's dereference output.
 */
function sanitizeEndpoint(ep: Endpoint): Endpoint {
  return {
    ...ep,
    safetyLevel: classifySafety(ep),
    parameters: ep.parameters.map(p => ({
      name: p.name,
      in: p.in,
      required: p.required,
      description: p.description,
      schema: simplifyParamSchema(p.schema),
    })),
    requestBody: ep.requestBody
      ? {
          required: ep.requestBody.required,
          contentType: ep.requestBody.contentType,
          schema: simplifyBodySchema(ep.requestBody.schema),
        }
      : undefined,
    responses: [],
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

function float32ToBuffer(arr: number[]): Buffer {
  const buf = Buffer.allocUnsafe(arr.length * 4);
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i], i * 4);
  return buf;
}

function bufferToFloat32(raw: Uint8Array): number[] {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const arr: number[] = [];
  for (let i = 0; i < raw.byteLength; i += 4) arr.push(view.getFloat32(i, true));
  return arr;
}

export class ApiIndexer {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS endpoints (
        id TEXT PRIMARY KEY,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        summary TEXT,
        description TEXT,
        tags TEXT,
        endpoint_json TEXT NOT NULL,
        embedding BLOB
      );
    `);
  }

  setMeta(key: string, value: string): void {
    this.db.prepare(`INSERT OR REPLACE INTO meta VALUES (?, ?)`).run(key, value);
  }

  getMeta(): Record<string, string> {
    const rows = this.db.prepare(`SELECT key, value FROM meta`).all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  async indexSpec(spec: NormalizedSpec, embedConfig: EmbedConfig): Promise<void> {
    this.setMeta('provider', embedConfig.provider);
    this.setMeta('model', embedConfig.model ?? '');

    const insertEndpoint = this.db.prepare(`
      INSERT OR REPLACE INTO endpoints (id, method, path, summary, description, tags, endpoint_json, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const ep of spec.endpoints) {
      const text = buildEndpointText(ep);
      const { embedding } = await embed(text, embedConfig);
      const embeddingBuf = float32ToBuffer(embedding);

      insertEndpoint.run(
        ep.id, ep.method, ep.path,
        ep.summary ?? null, ep.description ?? null,
        JSON.stringify(ep.tags), JSON.stringify(sanitizeEndpoint(ep)),
        embeddingBuf,
      );
    }
  }

  search(queryEmbedding: number[], limit = 5): Endpoint[] {
    const rows = this.db.prepare(`
      SELECT endpoint_json, embedding FROM endpoints WHERE embedding IS NOT NULL
    `).all() as { endpoint_json: string; embedding: Uint8Array }[];

    const scored = rows.map(r => ({
      endpoint: JSON.parse(r.endpoint_json) as Endpoint,
      score: cosineSimilarity(queryEmbedding, bufferToFloat32(r.embedding)),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.endpoint);
  }

  getAll(): Endpoint[] {
    const rows = this.db.prepare(`SELECT endpoint_json FROM endpoints`).all() as { endpoint_json: string }[];
    return rows.map(r => JSON.parse(r.endpoint_json) as Endpoint);
  }

  close(): void {
    this.db.close();
  }
}
