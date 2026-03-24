## What This Is

An MCP (Model Context Protocol) server that exposes the Spartan Angular UI ecosystem as tools for IDEs and AI assistants. It provides component APIs, documentation, source code from GitHub, and page-level building blocks from spartan.ng.

## Commands

- `npm start` — start the MCP server (stdio transport)
- `npm run dev` — start with `--watch` for auto-reload
- `npm test` — placeholder (currently exits 0)
- `node test-e2e.js` — run end-to-end tests (no test framework; each test file is standalone)
- Individual tests: `node test-cache.js`, `node test-server.js`, `node test-prompts.js`, etc.

## Architecture

**ES Modules throughout** (`"type": "module"` in package.json). Pure JavaScript with `@ts-check` + JSDoc, no build step.

### Entry Point

`server.js` — creates an `McpServer` instance, registers tool/resource/prompt modules, connects via `StdioServerTransport`.

### Tool Modules (tools/)

Each file exports a `register*Tools(server)` function called from `server.js`:

| Module            | Purpose                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `components.js`   | `spartan_components_list` / `spartan_components_get` / `spartan_components_source` — component data |
| `blocks.js`       | `spartan_blocks_list` / `spartan_blocks_get` — page-level building blocks from GitHub             |
| `docs.js`         | `spartan_docs_get` — fetch documentation topics                                                  |
| `health.js`       | Health checks and CLI command builders                                                           |
| `meta.js`         | Metadata for autocomplete (components + blocks)                                                  |
| `search.js`       | Full-text search across components and docs                                                      |
| `analysis.js`     | Component dependency analysis, accessibility checks                                              |
| `github.js`       | GitHub API client — fetch source code from spartan-ng/spartan repo                               |
| `cache.js`        | `CacheManager` class — version-aware file cache with 24h TTL                                     |
| `cache-tools.js`  | MCP tools for cache status/clear/rebuild/version-switch                                          |
| `cache-warmup.js` | Pre-populate cache for components, docs, and blocks                                              |
| `resources.js`    | MCP resource handlers (`spartan://component/{name}/*`, `spartan://blocks/*`)                     |
| `prompts.js`      | MCP prompt handlers (6 prompts including `spartan-use-block`)                                    |
| `utils.js`        | Core utilities: `fetchContent`, HTML extraction, `KNOWN_COMPONENTS`, `KNOWN_BLOCKS`              |

### Data Sources (Hybrid)

- **spartan.ng website** — component docs, API tables, examples, documentation pages
- **GitHub (spartan-ng/spartan)** — component TypeScript source code, block source code, shared utilities

### Caching

Two layers:

1. **In-memory** — 5-minute TTL on fetched HTTP content (in `utils.js`), 1-hour TTL on GitHub API responses (in `github.js`)
2. **File-based** — 24-hour TTL under `cache/{version}/` with subdirectories: `components/`, `docs/`, `blocks/`, `source/`. Configurable via `SPARTAN_CACHE_TTL_HOURS` env var.

### Data Flow

- **Components**: MCP client → tool call → Zod validation → fetch from spartan.ng (cached) → extract API/code/headings → return JSON
- **Blocks**: MCP client → tool call → Zod validation → fetch from GitHub API (cached) → return source files + extracted imports
- **Source**: MCP client → tool call → Zod validation → fetch from GitHub API (cached) → return TypeScript files

### Spartan UI Concepts

Components have two API layers:

- **Brain API** — headless, logic-only primitives (e.g., `BrnDialogTriggerDirective`)
- **Helm API** — styled wrappers around Brain components (e.g., `HlmDialogComponent`)

**Blocks** are page-level building blocks — complete Angular components combining multiple Spartan UI components (sidebar layouts, login/signup forms, calendar interfaces).

## Key Constants

- `SPARTAN_DOCS_BASE` = `https://www.spartan.ng/documentation`
- `SPARTAN_COMPONENTS_BASE` = `https://www.spartan.ng/components`
- `KNOWN_COMPONENTS` — array of 57 component names (in `utils.js`)
- `KNOWN_BLOCKS` — object with 4 categories, 17 total block variants (in `utils.js`)
- `SPARTAN_REPO` = `spartan-ng/spartan` (in `github.js`)

## Environment Variables

- `GITHUB_TOKEN` — GitHub PAT for higher rate limits (5000/hr vs 60/hr). No scopes needed for public repos.
- `SPARTAN_CACHE_TTL_HOURS` — File cache TTL in hours (default: 24)
- `SPARTAN_CACHE_TTL_MS` — In-memory cache TTL in ms (default: 300000)
- `SPARTAN_FETCH_TIMEOUT_MS` — HTTP timeout in ms (default: 15000)

<!-- SKILLS-INDEX-START -->
[Project Skills Index]|root:.claude|IMPORTANT:Prefer retrieval-led reasoning over pre-training.Read SKILL.md first,then related files.|skills/conventional-commits:{SKILL.md}
<!-- SKILLS-INDEX-END -->
