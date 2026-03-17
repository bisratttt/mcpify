#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { parseSpec } from './parsers/index.js';
import { generateMcpServer } from './generator/index.js';
import type { EmbeddingProvider } from './types.js';

const program = new Command();

program
  .name('build-mcp')
  .description('Turn any API spec into an MCP server')
  .version('0.1.0');

program
  .command('convert <input>')
  .description('Convert an API spec to an MCP server')
  .requiredOption('-o, --output <dir>', 'Output directory for the generated MCP server')
  .option('-n, --name <name>', 'Override the server name')
  .option('--base-url <url>', 'Override the API base URL')
  .option('--embedding-provider <provider>', 'Embedding provider: local (default, no API key), openai, or ollama', 'local')
  .option('--embedding-model <model>', 'Embedding model to use')
  .action(async (input: string, opts: {
    output: string;
    name?: string;
    baseUrl?: string;
    embeddingProvider: string;
    embeddingModel?: string;
  }) => {
    try {
      console.log(chalk.bold('\n build-mcp') + chalk.dim(' — converting spec...\n'));

      console.log(chalk.dim(`  Parsing ${input}...`));
      const spec = await parseSpec(input);
      console.log(chalk.green(`  ✓ Parsed ${chalk.bold(spec.info.title)} (${spec.endpoints.length} endpoints, format: ${spec.rawFormat})`));

      console.log(chalk.dim(`  Indexing endpoints with ${opts.embeddingProvider} embeddings...`));
      const result = await generateMcpServer(spec, {
        outputDir: opts.output,
        name: opts.name,
        baseUrl: opts.baseUrl,
        embeddingProvider: opts.embeddingProvider as EmbeddingProvider,
        embeddingModel: opts.embeddingModel,
      });

      console.log(chalk.green(`  ✓ Indexed ${result.endpointsIndexed} endpoints`));
      console.log(chalk.green(`  ✓ Generated MCP server → ${chalk.bold(result.outputDir)}\n`));

      if (result.envVars.length > 0) {
        console.log(chalk.yellow('  Required environment variables (copy .env.example → .env):\n'));
        for (const v of result.envVars) {
          console.log(chalk.yellow(`    ${v.name}`) + chalk.dim(` — ${v.description}`));
        }
        console.log();
      }

      console.log(chalk.bold('  Next steps:'));
      console.log(chalk.dim(`    cd ${opts.output}`));
      console.log(chalk.dim('    npm install'));
      if (result.envVars.length > 0) console.log(chalk.dim('    cp .env.example .env  # fill in credentials'));
      console.log(chalk.dim('    npm start\n'));

    } catch (err) {
      console.error(chalk.red('\n  Error: ') + (err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

program
  .command('inspect <input>')
  .description('Parse and display a spec summary without generating')
  .action(async (input: string) => {
    try {
      const spec = await parseSpec(input);
      console.log(`\nTitle:     ${spec.info.title}`);
      console.log(`Version:   ${spec.info.version}`);
      console.log(`Format:    ${spec.rawFormat}`);
      console.log(`Endpoints: ${spec.endpoints.length}`);
      console.log(`Servers:   ${spec.servers.map(s => s.url).join(', ') || '(none)'}`);
      console.log(`Auth:      ${spec.auth.map(a => `${a.name} (${a.type})`).join(', ') || '(none)'}`);
      console.log(`\nEndpoints:`);
      for (const ep of spec.endpoints) {
        const deprecated = ep.deprecated ? chalk.dim(' [deprecated]') : '';
        console.log(`  ${chalk.bold(ep.method.padEnd(7))} ${ep.path}${deprecated}`);
        if (ep.summary) console.log(chalk.dim(`           ${ep.summary}`));
      }
      console.log();
    } catch (err) {
      console.error(chalk.red('Error: ') + (err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

program.parse();
