import type { Endpoint, SafetyLevel } from '../types.js';

const SAFETY_BADGE: Record<SafetyLevel, string> = {
  read:        '',
  write:       ' [WRITE]',
  destructive: ' ⚠️ DESTRUCTIVE',
  billable:    ' 💸 BILLABLE',
};

/**
 * Formats an endpoint for display in search_docs results.
 * Gives the agent everything it needs to call call_api correctly.
 */
export function formatEndpointForSearch(ep: Endpoint): string {
  const safety = ep.safetyLevel ? SAFETY_BADGE[ep.safetyLevel] : '';
  const lines: string[] = [
    `${ep.id} (${ep.method} ${ep.path})${safety}${ep.deprecated ? ' ⚠️ DEPRECATED' : ''}`,
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
    const schema = ep.requestBody.schema as { properties?: Record<string, { type?: string }> } | undefined;
    const fields = schema?.properties
      ? ' — {' + Object.entries(schema.properties).slice(0, 8).map(([k, v]) => `${k}: ${v.type ?? 'any'}`).join(', ') + '}'
      : '';
    lines.push(`  Body: ${ep.requestBody.required ? 'required' : 'optional'} (${ep.requestBody.contentType})${fields}`);
  }

  if (ep.tags.length) lines.push(`  Tags: ${ep.tags.join(', ')}`);

  return lines.join('\n');
}
