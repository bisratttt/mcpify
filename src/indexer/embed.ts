import type { EmbedConfig } from '../types.js';

export interface EmbedResult {
  embedding: number[];
  dimensions: number;
}

// Task description used for Qwen3 query-side instruct prefix
export const QWEN3_TASK = 'Given a search query, retrieve relevant API endpoints that match the user intent';
export const QWEN3_MODEL = 'onnx-community/Qwen3-Embedding-0.6B-ONNX';
export const QWEN3_DIMS = 1024;

// Module-level pipeline cache — only loaded once per process
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _localPipeline: any = null;

export async function embed(text: string, config: EmbedConfig, isQuery = false): Promise<EmbedResult> {
  switch (config.provider) {
    case 'openai': return embedOpenAI(text, config);
    case 'ollama': return embedOllama(text, config);
    case 'local':  return embedLocal(text, config, isQuery);
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

async function embedLocal(text: string, config: EmbedConfig, isQuery: boolean): Promise<EmbedResult> {
  if (!_localPipeline) {
    const { pipeline } = await import('@huggingface/transformers');
    const model = config.model ?? QWEN3_MODEL;
    const dtype = (config.dtype ?? 'q8') as 'q8';
    _localPipeline = await pipeline('feature-extraction', model, { dtype });
  }

  // Qwen3 requires an instruct prefix for queries, not for documents (endpoints)
  const input = isQuery
    ? `Instruct: ${QWEN3_TASK}\nQuery:${text}`
    : text;

  const output = await _localPipeline([input], { pooling: 'last_token', normalize: true });
  const embedding = (output.tolist() as number[][])[0];
  return { embedding, dimensions: embedding.length };
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
