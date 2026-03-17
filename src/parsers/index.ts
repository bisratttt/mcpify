import { readFileSync, openSync, readSync, closeSync } from 'fs';
import yaml from 'js-yaml';
import type { NormalizedSpec } from '../types.js';
import { parseOpenApi } from './openapi.js';
import { parsePostman } from './postman.js';
import { parseHar } from './har.js';
import { parseGraphQL } from './graphql.js';

export type { NormalizedSpec };

/**
 * Reads the first 512 bytes of a JSON file to detect if it's an OpenAPI/Swagger spec.
 * Used to avoid loading large JSON specs into memory just for format detection —
 * swagger-parser.dereference can read the file itself when given a path.
 */
function peekJsonFormat(filePath: string): 'openapi' | 'unknown' {
  const fd = openSync(filePath, 'r');
  const buf = Buffer.allocUnsafe(512);
  const bytesRead = readSync(fd, buf, 0, 512, 0);
  closeSync(fd);
  const head = buf.toString('utf-8', 0, bytesRead);
  return (/"openapi"\s*:/.test(head) || /"swagger"\s*:/.test(head)) ? 'openapi' : 'unknown';
}

export async function parseSpec(input: string): Promise<NormalizedSpec> {
  // URL — download and detect
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return parseFromUrl(input);
  }

  const ext = input.split('.').pop()?.toLowerCase();

  if (ext === 'graphql' || ext === 'gql') {
    return parseGraphQL(readFileSync(input, 'utf-8'), 'https://api.example.com/graphql');
  }

  // For JSON files, peek at the first 512 bytes to detect OpenAPI/Swagger without loading
  // the entire file. Large specs (Kubernetes, Stripe, etc.) can be 10MB+ — passing the path
  // directly to swagger-parser.dereference avoids holding two copies in memory.
  if (ext === 'json') {
    const format = peekJsonFormat(input);
    if (format === 'openapi') return parseOpenApi(input);
  }

  const content = readFileSync(input, 'utf-8');

  const parsed = ext === 'yaml' || ext === 'yml'
    ? yaml.load(content) as Record<string, unknown>
    : JSON.parse(content) as Record<string, unknown>;

  return detectAndParse(parsed, input);
}

async function parseFromUrl(url: string): Promise<NormalizedSpec> {
  const res = await fetch(url);
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();

  if (contentType.includes('yaml') || url.endsWith('.yaml') || url.endsWith('.yml')) {
    const parsed = yaml.load(text) as Record<string, unknown>;
    return detectAndParse(parsed, url);
  }

  const parsed = JSON.parse(text) as Record<string, unknown>;
  return detectAndParse(parsed, url);
}

function detectAndParse(parsed: Record<string, unknown>, input: string): Promise<NormalizedSpec> {
  // OpenAPI 3.x
  if ('openapi' in parsed) return parseOpenApi(parsed);
  // Swagger 2.x
  if ('swagger' in parsed) return parseOpenApi(parsed);
  // Postman collection
  if ('info' in parsed && 'item' in parsed) return Promise.resolve(parsePostman(parsed));
  // HAR
  if ('log' in parsed && typeof parsed.log === 'object' && parsed.log !== null && 'entries' in (parsed.log as object)) {
    return Promise.resolve(parseHar(parsed));
  }

  throw new Error(`Unrecognized spec format. Supported: OpenAPI (2/3) JSON/YAML, Postman collection, HAR, GraphQL schema.`);
}
