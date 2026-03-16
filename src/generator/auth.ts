import type { AuthScheme, Endpoint } from '../types.js';

export interface AuthEnvVar {
  name: string;
  description: string;
  required: boolean;
}

export function extractRequiredEnvVars(auth: AuthScheme[], endpoints: Endpoint[]): AuthEnvVar[] {
  const usedSchemes = new Set(endpoints.flatMap(e => e.security ?? []));
  return auth
    .filter(s => usedSchemes.size === 0 || usedSchemes.has(s.name))
    .map(s => ({
      name: s.envVar,
      description: buildAuthDescription(s),
      required: true,
    }));
}

function buildAuthDescription(scheme: AuthScheme): string {
  switch (scheme.type) {
    case 'apiKey':
      return `API key for "${scheme.name}" — sent in ${scheme.in ?? 'header'}`;
    case 'http':
      return scheme.scheme === 'bearer'
        ? `Bearer token for "${scheme.name}"`
        : `HTTP Basic credentials for "${scheme.name}" (base64 encoded user:pass)`;
    case 'oauth2':
      return `OAuth2 access token for "${scheme.name}"`;
    case 'openIdConnect':
      return `OpenID Connect token for "${scheme.name}"`;
    default:
      return `Auth credential for "${scheme.name}"`;
  }
}

export function buildAuthHeaders(auth: AuthScheme[]): string {
  if (auth.length === 0) return '{}';

  const lines = auth.map(s => {
    const envVar = `process.env.${s.envVar}`;
    switch (s.type) {
      case 'apiKey':
        if (s.in === 'header') return `    '${s.name}': ${envVar} ?? '',`;
        return null; // handled separately for query params
      case 'http':
        return s.scheme === 'bearer'
          ? `    'Authorization': \`Bearer \${${envVar} ?? ''}\`,`
          : `    'Authorization': \`Basic \${${envVar} ?? ''}\`,`;
      case 'oauth2':
        return `    'Authorization': \`Bearer \${${envVar} ?? ''}\`,`;
      default:
        return null;
    }
  }).filter(Boolean);

  return `{\n${lines.join('\n')}\n  }`;
}

export function buildAuthQueryParams(auth: AuthScheme[]): string {
  const queryKeys = auth.filter(s => s.type === 'apiKey' && s.in === 'query');
  if (queryKeys.length === 0) return '';
  return queryKeys.map(s => `  if (process.env.${s.envVar}) params.set('${s.name}', process.env.${s.envVar}!);`).join('\n');
}

export function buildDotEnvExample(envVars: AuthEnvVar[]): string {
  if (envVars.length === 0) return '# No authentication required\n';
  return envVars.map(v => `# ${v.description}\n${v.name}=\n`).join('\n');
}
