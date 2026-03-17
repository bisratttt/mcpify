Update the README.md for this project to reflect the current state of the codebase.

Follow these steps:

1. Run `git diff HEAD~1 HEAD --stat` and `git log --oneline -10` to understand what has recently changed.
2. Read the current `README.md`.
3. Read any source files that are relevant to the changes (e.g. if CLI options changed, read `src/cli.ts`; if the generator changed, read `src/generator/`).
4. Rewrite only the sections of the README that are out of date. Do not touch sections that are still accurate.

Rules for this README:
- Keep the playful tone ("Your API spec walked in. An MCP server walked out.")
- Always document the correct default embedding provider and how search works
- The "Why 2 tools, not 500" section should always reflect the actual generated tool count
- Keep the supported input formats table up to date with the parsers in `src/parsers/`
- CLI flags in the Usage section must match the actual options in `src/cli.ts`
- The embeddings section must list all providers in `EmbeddingProvider` from `src/types.ts` with accurate setup instructions
- Never add a "Changelog" or "What's new" section — the README describes current state only
