// Library entry point — use apimcp programmatically
export { parseSpec } from './parsers/index.js';
export { generateMcpServer } from './generator/index.js';
export { ApiIndexer } from './indexer/index.js';
export type {
  NormalizedSpec,
  Endpoint,
  Parameter,
  RequestBody,
  AuthScheme,
  GenerateOptions,
  EmbedConfig,
  EmbeddingProvider,
  SpecFormat,
} from './types.js';
