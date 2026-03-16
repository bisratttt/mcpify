import {
  buildSchema,
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLList,
  GraphQLScalarType,
  GraphQLEnumType,
  GraphQLInputObjectType,
  type GraphQLNamedType,
  type GraphQLField,
  type GraphQLInputField,
} from 'graphql';
import type { NormalizedSpec, Endpoint, Parameter, JsonSchema } from '../types.js';

function gqlTypeToJsonSchema(type: unknown): JsonSchema {
  if (type instanceof GraphQLNonNull) return gqlTypeToJsonSchema(type.ofType);
  if (type instanceof GraphQLList) return { type: 'array', items: gqlTypeToJsonSchema((type as GraphQLList<GraphQLNamedType>).ofType) };
  if (type instanceof GraphQLScalarType) {
    const map: Record<string, string> = { Int: 'integer', Float: 'number', Boolean: 'boolean', ID: 'string', String: 'string' };
    return { type: map[type.name] ?? 'string' };
  }
  if (type instanceof GraphQLEnumType) {
    return { type: 'string', enum: type.getValues().map(v => v.value) };
  }
  if (type instanceof GraphQLInputObjectType) {
    const fields = type.getFields();
    const props: Record<string, JsonSchema> = {};
    for (const [name, field] of Object.entries(fields)) {
      props[name] = gqlTypeToJsonSchema((field as GraphQLInputField).type);
    }
    return { type: 'object', properties: props };
  }
  return { type: 'object' };
}

function fieldToParameters(args: readonly { name: string; description?: string | null; type: unknown }[]): Parameter[] {
  return args.map(arg => ({
    name: arg.name,
    in: 'query' as const,
    required: arg.type instanceof GraphQLNonNull,
    description: arg.description ?? undefined,
    schema: gqlTypeToJsonSchema(arg.type),
  }));
}

export function parseGraphQL(schemaString: string, endpointUrl = '/graphql'): NormalizedSpec {
  const schema = buildSchema(schemaString);
  const endpoints: Endpoint[] = [];

  const queryType = schema.getQueryType();
  if (queryType) {
    for (const [name, field] of Object.entries(queryType.getFields())) {
      const f = field as GraphQLField<unknown, unknown>;
      endpoints.push({
        id: `query_${name}`,
        operationId: `query_${name}`,
        method: 'GRAPHQL_QUERY',
        path: endpointUrl,
        summary: f.description ?? `Query: ${name}`,
        description: f.description ?? undefined,
        tags: ['queries'],
        parameters: fieldToParameters(f.args),
        responses: [{ statusCode: '200', description: 'Success', schema: gqlTypeToJsonSchema(f.type) }],
      });
    }
  }

  const mutationType = schema.getMutationType();
  if (mutationType) {
    for (const [name, field] of Object.entries(mutationType.getFields())) {
      const f = field as GraphQLField<unknown, unknown>;
      endpoints.push({
        id: `mutation_${name}`,
        operationId: `mutation_${name}`,
        method: 'GRAPHQL_MUTATION',
        path: endpointUrl,
        summary: f.description ?? `Mutation: ${name}`,
        description: f.description ?? undefined,
        tags: ['mutations'],
        parameters: fieldToParameters(f.args),
        responses: [{ statusCode: '200', description: 'Success', schema: gqlTypeToJsonSchema(f.type) }],
      });
    }
  }

  const subscriptionType = schema.getSubscriptionType();
  if (subscriptionType) {
    for (const [name, field] of Object.entries(subscriptionType.getFields())) {
      const f = field as GraphQLField<unknown, unknown>;
      endpoints.push({
        id: `subscription_${name}`,
        operationId: `subscription_${name}`,
        method: 'GRAPHQL_SUBSCRIPTION',
        path: endpointUrl,
        summary: f.description ?? `Subscription: ${name}`,
        description: f.description ?? undefined,
        tags: ['subscriptions'],
        parameters: fieldToParameters(f.args),
        responses: [{ statusCode: '200', description: 'Success' }],
      });
    }
  }

  return {
    info: { title: 'GraphQL API', version: '1.0.0' },
    servers: [],
    endpoints,
    auth: [],
    rawFormat: 'graphql',
  };
}
