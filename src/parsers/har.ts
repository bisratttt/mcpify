import type { NormalizedSpec, Endpoint, Parameter, HttpMethod } from '../types.js';

interface HarFile {
  log: {
    entries: HarEntry[];
  };
}

interface HarEntry {
  request: {
    method: string;
    url: string;
    headers: HarNameValue[];
    queryString: HarNameValue[];
    postData?: { mimeType: string; text?: string };
  };
  response?: {
    status: number;
    statusText: string;
    headers: HarNameValue[];
    content?: { mimeType: string; text?: string };
  };
}

interface HarNameValue { name: string; value: string }

function slug(str: string) {
  return str.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

export function parseHar(raw: unknown): NormalizedSpec {
  const har = raw as HarFile;
  const entries = har.log?.entries ?? [];

  // Group by method+path to deduplicate
  const grouped = new Map<string, HarEntry>();
  const baseUrls = new Set<string>();

  for (const entry of entries) {
    let url: URL;
    try {
      url = new URL(entry.request.url);
    } catch {
      continue;
    }
    baseUrls.add(`${url.protocol}//${url.host}`);
    const key = `${entry.request.method.toUpperCase()} ${url.pathname}`;
    if (!grouped.has(key)) grouped.set(key, entry);
  }

  const endpoints: Endpoint[] = [];
  const seen = new Set<string>();

  for (const [, entry] of grouped) {
    const url = new URL(entry.request.url);
    const method = entry.request.method.toUpperCase() as HttpMethod;
    const path = url.pathname;

    const queryParams: Parameter[] = entry.request.queryString.map(q => ({
      name: q.name,
      in: 'query' as const,
      required: false,
      schema: { type: 'string', example: q.value },
    }));

    // Filter out standard/sensitive headers
    const skipHeaders = new Set(['cookie', 'authorization', 'content-length', 'host', 'accept-encoding']);
    const headerParams: Parameter[] = entry.request.headers
      .filter(h => !skipHeaders.has(h.name.toLowerCase()))
      .map(h => ({
        name: h.name,
        in: 'header' as const,
        required: false,
        schema: { type: 'string', example: h.value },
      }));

    let id = `${method.toLowerCase()}${slug(path)}`;
    let counter = 0;
    while (seen.has(id)) id = `${method.toLowerCase()}${slug(path)}_${++counter}`;
    seen.add(id);

    const response = entry.response;
    endpoints.push({
      id,
      method,
      path,
      tags: [],
      parameters: [...queryParams, ...headerParams],
      requestBody: entry.request.postData ? {
        required: false,
        contentType: entry.request.postData.mimeType || 'application/json',
        schema: { type: 'object' },
      } : undefined,
      responses: response ? [{
        statusCode: String(response.status),
        description: response.statusText,
      }] : [],
    });
  }

  const baseUrl = baseUrls.size === 1 ? [...baseUrls][0] : '';

  return {
    info: { title: 'Imported from HAR', version: '1.0.0' },
    servers: baseUrl ? [{ url: baseUrl }] : [],
    endpoints,
    auth: [],
    rawFormat: 'har',
  };
}
