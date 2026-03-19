import type { Endpoint } from '../types.js';

const PAGINATION_PARAMS = new Set([
  'cursor', 'page', 'offset', 'after', 'starting_after', 'page_token', 'limit',
]);

const PAGINATION_RESPONSE_FIELDS = new Set([
  'next_cursor', 'has_more', 'next_page', 'total_pages', 'next_page_token',
]);

export type WorkflowPattern = 'crud' | 'create-fetch' | 'paginated-list' | 'search-act';

export interface WorkflowMatch {
  pattern: WorkflowPattern;
  resource: string;
  endpointIds: string[];
  endpoints: Endpoint[];
  metadata: Record<string, unknown>;
}

/**
 * Strip path parameter segments ({id}) and version prefixes to get a
 * canonical resource name for grouping. Examples:
 *   /pets           → pets
 *   /pets/{petId}   → pets
 *   /v1/charges     → charges
 *   /users/{id}/orders/{orderId} → users/orders
 */
function resourcePrefix(path: string): string {
  return path
    .split('/')
    .filter(seg => seg && !seg.startsWith('{') && !/^v\d+$/.test(seg))
    .join('/');
}

function hasBracketParam(path: string): boolean {
  return path.split('/').some(seg => seg.startsWith('{'));
}

function isPaginationParam(name: string): boolean {
  return PAGINATION_PARAMS.has(name.toLowerCase());
}

function responseHasPaginationField(ep: Endpoint): boolean {
  const resp = ep.responses[0];
  if (!resp?.schema) return false;
  const schema = resp.schema as { properties?: Record<string, unknown> };
  if (!schema.properties) return false;
  return Object.keys(schema.properties).some(k => PAGINATION_RESPONSE_FIELDS.has(k.toLowerCase()));
}

export function detectWorkflows(endpoints: Endpoint[]): WorkflowMatch[] {
  const results: WorkflowMatch[] = [];
  const claimedIds = new Set<string>();

  // Group endpoints by resource prefix
  const byPrefix = new Map<string, Endpoint[]>();
  for (const ep of endpoints) {
    const prefix = resourcePrefix(ep.path);
    if (!prefix) continue;
    const group = byPrefix.get(prefix) ?? [];
    group.push(ep);
    byPrefix.set(prefix, group);
  }

  // ── Pattern 1: CRUD group ──────────────────────────────────────────────────
  for (const [prefix, eps] of byPrefix) {
    const collection = eps.filter(e => resourcePrefix(e.path) === prefix && !hasBracketParam(e.path));
    const item = eps.filter(e => resourcePrefix(e.path) === prefix && hasBracketParam(e.path));

    const create = collection.find(e => e.method === 'POST');
    const list   = collection.find(e => e.method === 'GET');
    const fetch1 = item.find(e => e.method === 'GET');
    const update = item.find(e => e.method === 'PUT' || e.method === 'PATCH');
    const del    = item.find(e => e.method === 'DELETE');

    if (create && fetch1 && del) {
      const members = [list, create, fetch1, update, del].filter(Boolean) as Endpoint[];
      results.push({
        pattern: 'crud',
        resource: prefix,
        endpointIds: members.map(e => e.id),
        endpoints: members,
        metadata: { hasUpdate: !!update, hasList: !!list },
      });
      members.forEach(e => claimedIds.add(e.id));
    }
  }

  // ── Pattern 2: Create→Fetch (not already claimed by CRUD) ─────────────────
  for (const [prefix, eps] of byPrefix) {
    const collection = eps.filter(e => resourcePrefix(e.path) === prefix && !hasBracketParam(e.path));
    const item = eps.filter(e => resourcePrefix(e.path) === prefix && hasBracketParam(e.path));

    const create = collection.find(e => e.method === 'POST' && !claimedIds.has(e.id));
    const fetch1 = item.find(e => e.method === 'GET' && !claimedIds.has(e.id));

    if (create && fetch1) {
      results.push({
        pattern: 'create-fetch',
        resource: prefix,
        endpointIds: [create.id, fetch1.id],
        endpoints: [create, fetch1],
        metadata: {},
      });
      claimedIds.add(create.id);
      claimedIds.add(fetch1.id);
    }
  }

  // ── Pattern 3: Paginated list ──────────────────────────────────────────────
  for (const ep of endpoints) {
    if (ep.method !== 'GET') continue;
    if (hasBracketParam(ep.path)) continue;
    if (claimedIds.has(ep.id)) continue;
    const hasPaginationParam = ep.parameters.some(p => p.in === 'query' && isPaginationParam(p.name));
    const hasPaginationResponse = responseHasPaginationField(ep);
    if (hasPaginationParam || hasPaginationResponse) {
      results.push({
        pattern: 'paginated-list',
        resource: resourcePrefix(ep.path),
        endpointIds: [ep.id],
        endpoints: [ep],
        metadata: { byParam: hasPaginationParam, byResponse: hasPaginationResponse },
      });
    }
  }

  // ── Pattern 4: Search→Act ──────────────────────────────────────────────────
  for (const [prefix, eps] of byPrefix) {
    const collection = eps.filter(e => resourcePrefix(e.path) === prefix && !hasBracketParam(e.path));
    const item = eps.filter(e => resourcePrefix(e.path) === prefix && hasBracketParam(e.path));

    const searchEp = collection.find(e =>
      e.method === 'GET' &&
      e.parameters.some(p => p.in === 'query' && !isPaginationParam(p.name))
    );
    const actEps = item.filter(e => e.method === 'PATCH' || e.method === 'DELETE' || e.method === 'PUT');

    if (searchEp && actEps.length > 0) {
      // Skip if already fully claimed by CRUD
      if (claimedIds.has(searchEp.id)) continue;
      const involved = [searchEp, ...actEps];
      results.push({
        pattern: 'search-act',
        resource: prefix,
        endpointIds: involved.map(e => e.id),
        endpoints: involved,
        metadata: {},
      });
    }
  }

  return results;
}

// ── Markdown generation ────────────────────────────────────────────────────────

function renderCrud(match: WorkflowMatch): string {
  const [list, create, fetch1, update, del] = (['GET', 'POST', 'GET_ITEM', 'PATCH', 'DELETE'] as const).map(role => {
    if (role === 'GET') return match.endpoints.find(e => e.method === 'GET' && !hasBracketParam(e.path));
    if (role === 'GET_ITEM') return match.endpoints.find(e => e.method === 'GET' && hasBracketParam(e.path));
    if (role === 'PATCH') return match.endpoints.find(e => e.method === 'PUT' || e.method === 'PATCH');
    if (role === 'DELETE') return match.endpoints.find(e => e.method === 'DELETE');
    return match.endpoints.find(e => e.method === role);
  });

  const steps: string[] = [];
  let i = 1;
  if (list) steps.push(`${i++}. \`${list.id}\` (${list.method} ${list.path}) — Browse existing resources`);
  if (create) steps.push(`${i++}. \`${create.id}\` (${create.method} ${create.path}) — Create the resource; capture the \`id\` from the response`);
  if (fetch1) steps.push(`${i++}. \`${fetch1.id}\` (${fetch1.method} ${fetch1.path}) — Fetch the created resource by \`id\` to confirm it`);
  if (update) steps.push(`${i++}. \`${update.id}\` (${update.method} ${update.path}) — Modify specific fields using the \`id\``);
  if (del) steps.push(`${i++}. \`${del.id}\` (${del.method} ${del.path}) — Delete the resource using the \`id\``);

  return `## CRUD: \`${match.resource}\`

**Why this matters for agents:** You can fully manage this resource — list, create, read, update, and delete — in a predictable sequence without re-searching between steps.

**Steps:**
${steps.join('\n')}
`;
}

function renderCreateFetch(match: WorkflowMatch): string {
  const [create, fetch1] = match.endpoints;
  return `## Create → Fetch: \`${match.resource}\`

**Why this matters for agents:** After creating a resource the API often returns a minimal object. Fetch the full record immediately after to get all computed fields (timestamps, defaults, status).

**Steps:**
1. \`${create.id}\` (${create.method} ${create.path}) — Create the resource; capture the \`id\` from the response
2. \`${fetch1.id}\` (${fetch1.method} ${fetch1.path}) — Fetch the full record using the captured \`id\`
`;
}

function renderPaginatedList(match: WorkflowMatch): string {
  const ep = match.endpoints[0];
  const cursorParam = ep.parameters.find(p => p.in === 'query' && isPaginationParam(p.name));
  const cursorName = cursorParam?.name ?? 'cursor';
  return `## Paginated List: \`${match.resource}\`

**Why this matters for agents:** This endpoint returns paged results. Always check for a continuation token in the response and loop until all pages are consumed — a single call may miss most of the data.

**Steps:**
1. \`${ep.id}\` (${ep.method} ${ep.path}) — Fetch the first page
2. Check the response for a pagination field (\`next_cursor\`, \`has_more\`, \`next_page\`, etc.)
3. If present, call \`${ep.id}\` again with \`${cursorName}\` set to the continuation value
4. Repeat until no continuation token is returned
`;
}

function renderSearchAct(match: WorkflowMatch): string {
  const [searchEp, ...actEps] = match.endpoints;
  const filterParams = searchEp.parameters
    .filter(p => p.in === 'query' && !isPaginationParam(p.name))
    .map(p => `\`${p.name}\``)
    .join(', ');
  const actLines = actEps.map((e, i) =>
    `${i + 3}. \`${e.id}\` (${e.method} ${e.path}) — Act on the matched resource using its \`id\``
  ).join('\n');

  return `## Search → Act: \`${match.resource}\`

**Why this matters for agents:** Filter first to find the right resource, then act on it by ID. Never guess an ID — always search first.

**Steps:**
1. \`${searchEp.id}\` (${searchEp.method} ${searchEp.path}) — Search with filter params: ${filterParams || 'available query params'}
2. Capture the \`id\` of the matching item from the results
${actLines}
`;
}

export function generateWorkflowsMd(endpoints: Endpoint[]): string {
  const matches = detectWorkflows(endpoints);

  if (matches.length === 0) {
    return `# API Workflows\n\nNo multi-step workflow patterns were detected in this API spec.\n`;
  }

  const sections = matches.map(match => {
    switch (match.pattern) {
      case 'crud':           return renderCrud(match);
      case 'create-fetch':   return renderCreateFetch(match);
      case 'paginated-list': return renderPaginatedList(match);
      case 'search-act':     return renderSearchAct(match);
    }
  });

  return `# API Workflows

This document describes multi-step patterns detected in this API. Read it before chaining calls — following these sequences avoids unnecessary round-trips and prevents common agent mistakes.

${sections.join('\n---\n\n')}`;
}
