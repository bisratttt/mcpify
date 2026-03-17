export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'TRACE';
export type SafetyLevel = 'read' | 'write' | 'destructive' | 'billable';
export type SpecFormat = 'openapi2' | 'openapi3' | 'postman' | 'har' | 'graphql';
export type EmbeddingProvider = 'openai' | 'ollama' | 'local';

export interface NormalizedSpec {
  info: ApiInfo;
  servers: ServerInfo[];
  endpoints: Endpoint[];
  auth: AuthScheme[];
  rawFormat: SpecFormat;
}

export interface ApiInfo {
  title: string;
  version: string;
  description?: string;
}

export interface ServerInfo {
  url: string;
  description?: string;
}

export interface Endpoint {
  id: string;
  operationId?: string;
  method: HttpMethod | 'GRAPHQL_QUERY' | 'GRAPHQL_MUTATION' | 'GRAPHQL_SUBSCRIPTION';
  path: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: ResponseSpec[];
  security?: string[];
  deprecated?: boolean;
  safetyLevel?: SafetyLevel;
}

export interface Parameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  description?: string;
  schema?: JsonSchema;
}

export interface RequestBody {
  required: boolean;
  description?: string;
  contentType: string;
  schema?: JsonSchema;
}

export interface ResponseSpec {
  statusCode: string;
  description?: string;
  schema?: JsonSchema;
}

export interface AuthScheme {
  name: string;
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  in?: 'header' | 'query' | 'cookie';
  scheme?: string; // 'bearer', 'basic', etc.
  description?: string;
  envVar: string;
}

export type JsonSchema = Record<string, unknown>;

export interface GenerateOptions {
  outputDir: string;
  name?: string;
  embeddingProvider?: EmbeddingProvider;
  embeddingModel?: string;
  baseUrl?: string;
}

export interface EmbedConfig {
  provider: EmbeddingProvider;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  dtype?: string; // for local provider: 'q8' (default), 'fp16', 'fp32'
}
