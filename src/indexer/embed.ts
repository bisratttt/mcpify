import type { EmbedConfig } from '../types.js';

export interface EmbedResult {
  embedding: number[];
  dimensions: number;
}

export async function embed(text: string, config: EmbedConfig): Promise<EmbedResult> {
  switch (config.provider) {
    case 'openai': return embedOpenAI(text, config);
    case 'ollama': return embedOllama(text, config);
  }
}

async function embedOpenAI(text: string, config: EmbedConfig): Promise<EmbedResult> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: config.apiKey ?? process.env.OPENAI_API_KEY });
  const model = config.model ?? 'text-embedding-3-small';
  const res = await client.embeddings.create({ model, input: text });
  const embedding = res.data[0].embedding;
  return { embedding, dimensions: embedding.length };
}

async function embedOllama(text: string, config: EmbedConfig): Promise<EmbedResult> {
  const baseUrl = config.baseUrl ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434';
  const model = config.model ?? 'nomic-embed-text';
  const res = await fetch(`${baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embedding failed: ${res.statusText}`);
  const data = await res.json() as { embedding: number[] };
  return { embedding: data.embedding, dimensions: data.embedding.length };
}

export function buildEndpointText(endpoint: {
  method: string;
  path: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: Array<{ name: string; description?: string }>;
}): string {
  return [
    `${endpoint.method} ${endpoint.path}`,
    endpoint.summary,
    endpoint.description,
    endpoint.tags.join(', '),
    endpoint.parameters.map(p => `${p.name}${p.description ? ': ' + p.description : ''}`).join(', '),
  ].filter(Boolean).join(' | ');
}
