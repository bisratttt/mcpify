import type { Endpoint } from '../types.js';

/**
 * Formats an endpoint for display in search_api_docs results.
 * Gives the agent everything it needs to call call_api correctly.
 */
export function formatEndpointForSearch(ep: Endpoint): string {
  const lines: string[] = [
    `${ep.id} (${ep.method} ${ep.path})${ep.deprecated ? ' ⚠️ DEPRECATED' : ''}`,
    `  ${ep.summary ?? ep.description ?? '(no description)'}`,
  ];

  const params = ep.parameters.filter(p => p.in !== 'header');
  if (params.length > 0) {
    const paramList = params.map(p => {
      const type = p.schema?.enum
        ? `string: ${(p.schema.enum as unknown[]).join('|')}`
        : (p.schema?.type as string | undefined) ?? 'string';
      return `${p.name} (${p.in}, ${p.required ? 'required' : 'optional'}, ${type})`;
    }).join(', ');
    lines.push(`  Params: ${paramList}`);
  }

  if (ep.requestBody) {
    lines.push(`  Body: ${ep.requestBody.required ? 'required' : 'optional'} (${ep.requestBody.contentType})`);
  }

  if (ep.tags.length) lines.push(`  Tags: ${ep.tags.join(', ')}`);

  return lines.join('\n');
}
