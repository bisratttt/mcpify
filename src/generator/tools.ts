import type { Endpoint, Parameter, JsonSchema } from '../types.js';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodSchemaSource;
  implementation: string;
}

export interface ZodSchemaSource {
  fields: ZodField[];
}

export interface ZodField {
  name: string;
  zodType: string;
  optional: boolean;
}

export function endpointToTool(endpoint: Endpoint, baseUrl: string, authHeaders: string, authQueryParams: string): McpToolDefinition {
  const allParams = endpoint.parameters;
  const pathParams = allParams.filter(p => p.in === 'path');
  const queryParams = allParams.filter(p => p.in === 'query');
  const headerParams = allParams.filter(p => p.in === 'header');

  const zodFields: ZodField[] = [
    ...allParams.map(p => ({
      name: sanitizeName(p.name),
      zodType: paramToZodType(p),
      optional: !p.required,
    })),
    ...(endpoint.requestBody ? [{
      name: 'body',
      zodType: 'z.record(z.unknown())',
      optional: !endpoint.requestBody.required,
    }] : []),
  ];

  const description = [
    endpoint.summary ?? `${endpoint.method} ${endpoint.path}`,
    endpoint.description,
    endpoint.deprecated ? '⚠️ DEPRECATED' : null,
    endpoint.tags.length ? `Tags: ${endpoint.tags.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const impl = buildImplementation(endpoint, baseUrl, pathParams, queryParams, headerParams, authHeaders, authQueryParams);

  return {
    name: endpoint.id,
    description,
    inputSchema: { fields: zodFields },
    implementation: impl,
  };
}

function sanitizeName(name: string): string {
  // Convert header/path names like X-Api-Key or user-id to camelCase
  return name
    .replace(/[-.](.)/g, (_, c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1');
}

function paramToZodType(p: Parameter): string {
  const schema = p.schema;
  if (!schema) return 'z.string()';
  return jsonSchemaToZod(schema);
}

function jsonSchemaToZod(schema: JsonSchema): string {
  const type = schema.type as string | undefined;
  if (schema.enum) return `z.enum([${(schema.enum as unknown[]).map(v => JSON.stringify(v)).join(', ')}])`;
  switch (type) {
    case 'integer':
    case 'number': return 'z.number()';
    case 'boolean': return 'z.boolean()';
    case 'array': return schema.items ? `z.array(${jsonSchemaToZod(schema.items as JsonSchema)})` : 'z.array(z.unknown())';
    case 'object': return 'z.record(z.unknown())';
    default: return 'z.string()';
  }
}

function buildImplementation(
  endpoint: Endpoint,
  baseUrl: string,
  pathParams: Parameter[],
  queryParams: Parameter[],
  headerParams: Parameter[],
  authHeaders: string,
  authQueryParams: string,
): string {
  const method = endpoint.method;
  const isGraphQL = method.startsWith('GRAPHQL_');

  if (isGraphQL) {
    return buildGraphQLImpl(endpoint, baseUrl, authHeaders);
  }

  // Build URL with path params substituted
  let urlExpr = `\`${baseUrl}${endpoint.path.replace(/{(\w+)}/g, (_, name) => `\${${sanitizeName(name)}}`)}\``;

  const hasQuery = queryParams.length > 0 || authQueryParams;
  const queryLines: string[] = [];

  if (hasQuery) {
    queryLines.push(`  const _params = new URLSearchParams();`);
    for (const p of queryParams) {
      const safe = sanitizeName(p.name);
      if (p.required) {
        queryLines.push(`  _params.set('${p.name}', String(${safe}));`);
      } else {
        queryLines.push(`  if (${safe} !== undefined) _params.set('${p.name}', String(${safe}));`);
      }
    }
    if (authQueryParams) queryLines.push(authQueryParams.replace(/params/g, '_params'));
    urlExpr = `\`${baseUrl}${endpoint.path.replace(/{(\w+)}/g, (_, name) => `\${${sanitizeName(name)}}`)}\${_params.toString() ? '?' + _params.toString() : ''}\``;
  }

  const extraHeaders = headerParams.map(p =>
    `    '${p.name}': ${sanitizeName(p.name)} ?? '',`
  ).join('\n');

  const hasBody = endpoint.requestBody && !['GET', 'HEAD', 'DELETE'].includes(method);

  return `async (args) => {
  const { ${[...endpoint.parameters.map(p => sanitizeName(p.name)), ...(endpoint.requestBody ? ['body'] : [])].join(', ')} } = args;
${queryLines.join('\n')}
  const _res = await fetch(${urlExpr}, {
    method: '${method}',
    headers: {
      'Content-Type': 'application/json',
      ...${authHeaders},
${extraHeaders}
    },
    ${hasBody ? 'body: body ? JSON.stringify(body) : undefined,' : ''}
  });
  const _data = await _res.json().catch(() => _res.text());
  return { content: [{ type: 'text' as const, text: JSON.stringify(_data, null, 2) }] };
}`;
}

function buildGraphQLImpl(endpoint: Endpoint, baseUrl: string, authHeaders: string): string {
  const operationType = endpoint.method === 'GRAPHQL_MUTATION' ? 'mutation' : 'query';
  const opName = endpoint.operationId ?? endpoint.id;
  const paramList = endpoint.parameters.map(p => `$${p.name}: ${p.schema?.type ?? 'String'}`).join(', ');
  const argList = endpoint.parameters.map(p => `${p.name}: $${p.name}`).join(', ');

  const gqlOp = `${operationType} ${opName}(${paramList}) { ${opName.replace(/^(query|mutation)_/, '')}(${argList}) }`;

  return `async (args) => {
  const { ${endpoint.parameters.map(p => sanitizeName(p.name)).join(', ')} } = args;
  const _res = await fetch('${baseUrl}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...${authHeaders} },
    body: JSON.stringify({
      query: \`${gqlOp}\`,
      variables: { ${endpoint.parameters.map(p => `${p.name}: ${sanitizeName(p.name)}`).join(', ')} },
    }),
  });
  const _data = await _res.json();
  return { content: [{ type: 'text' as const, text: JSON.stringify(_data, null, 2) }] };
}`;
}
