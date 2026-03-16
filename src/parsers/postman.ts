import type { NormalizedSpec, Endpoint, Parameter, HttpMethod } from '../types.js';

interface PostmanCollection {
  info: { name: string; description?: string; schema?: string };
  item: PostmanItem[];
  variable?: PostmanVariable[];
  auth?: PostmanAuth;
}

interface PostmanItem {
  name: string;
  request?: PostmanRequest;
  item?: PostmanItem[]; // folder
}

interface PostmanRequest {
  method: string;
  url: PostmanUrl | string;
  header?: PostmanHeader[];
  body?: PostmanBody;
  description?: string;
  auth?: PostmanAuth;
}

interface PostmanUrl {
  raw: string;
  host?: string[];
  path?: string[];
  query?: PostmanQuery[];
  variable?: PostmanVariable[];
}

interface PostmanHeader { key: string; value: string; description?: string }
interface PostmanQuery { key: string; value?: string; description?: string; disabled?: boolean }
interface PostmanVariable { key: string; value?: string; description?: string }
interface PostmanAuth { type: string; apikey?: PostmanKeyValue[]; bearer?: PostmanKeyValue[] }
interface PostmanKeyValue { key: string; value: string }
interface PostmanBody { mode?: string; raw?: string; urlencoded?: PostmanKeyValue[]; formdata?: PostmanKeyValue[] }

function slug(str: string) {
  return str.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function flattenItems(items: PostmanItem[], prefix = ''): { item: PostmanItem; tags: string[] }[] {
  const result: { item: PostmanItem; tags: string[] }[] = [];
  for (const item of items) {
    if (item.item) {
      // folder — recurse with tag
      result.push(...flattenItems(item.item, item.name));
    } else {
      result.push({ item, tags: prefix ? [prefix] : [] });
    }
  }
  return result;
}

function parseUrl(url: PostmanUrl | string): { path: string; baseUrl: string; queryParams: Parameter[] } {
  if (typeof url === 'string') {
    try {
      const u = new URL(url);
      const queryParams: Parameter[] = [];
      u.searchParams.forEach((value, key) => {
        queryParams.push({ name: key, in: 'query', required: false, schema: { type: 'string', example: value } });
      });
      return { path: u.pathname, baseUrl: `${u.protocol}//${u.host}`, queryParams };
    } catch {
      return { path: url, baseUrl: '', queryParams: [] };
    }
  }

  const pathSegments = url.path ?? [];
  const path = '/' + pathSegments
    .map(s => s.startsWith(':') ? `{${s.slice(1)}}` : s)
    .join('/');

  const rawUrl = url.raw ?? '';
  let baseUrl = '';
  try {
    const u = new URL(rawUrl.replace(/\{\{.*?\}\}/g, 'placeholder'));
    baseUrl = `${u.protocol}//${u.host}`;
  } catch { /* ignore */ }

  const queryParams: Parameter[] = (url.query ?? [])
    .filter(q => !q.disabled)
    .map(q => ({
      name: q.key,
      in: 'query' as const,
      required: false,
      description: q.description,
      schema: { type: 'string', example: q.value },
    }));

  const pathParams: Parameter[] = (url.variable ?? []).map(v => ({
    name: v.key,
    in: 'path' as const,
    required: true,
    description: v.description,
    schema: { type: 'string', example: v.value },
  }));

  return { path, baseUrl, queryParams: [...queryParams, ...pathParams] };
}

export function parsePostman(raw: unknown): NormalizedSpec {
  const col = raw as PostmanCollection;
  const endpoints: Endpoint[] = [];
  const seen = new Set<string>();
  let baseUrl = '';

  for (const { item, tags } of flattenItems(col.item)) {
    if (!item.request) continue;
    const req = item.request;
    const method = (req.method ?? 'GET').toUpperCase() as HttpMethod;
    const { path, baseUrl: itemBase, queryParams } = parseUrl(req.url ?? '');

    if (itemBase && !baseUrl) baseUrl = itemBase;

    let id = slug(item.name);
    let counter = 0;
    while (seen.has(id)) id = `${slug(item.name)}_${++counter}`;
    seen.add(id);

    const headers: Parameter[] = (req.header ?? []).map(h => ({
      name: h.key,
      in: 'header' as const,
      required: false,
      description: h.description,
      schema: { type: 'string', example: h.value },
    }));

    endpoints.push({
      id,
      method,
      path,
      summary: item.name,
      description: typeof req.description === 'string' ? req.description : undefined,
      tags,
      parameters: [...queryParams, ...headers],
      requestBody: req.body ? {
        required: false,
        contentType: 'application/json',
        schema: { type: 'object' },
      } : undefined,
      responses: [],
    });
  }

  return {
    info: { title: col.info.name, version: '1.0.0', description: col.info.description },
    servers: baseUrl ? [{ url: baseUrl }] : [],
    endpoints,
    auth: [],
    rawFormat: 'postman',
  };
}
