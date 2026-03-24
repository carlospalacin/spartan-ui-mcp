//@ts-check
import { z } from "zod";
import { cacheManager } from "./cache.js";
import { warmCache } from "./cache-warmup.js";
import { KNOWN_COMPONENTS } from "./utils.js";

/**
 * Register cache management tools
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 */
export function registerCacheTools(server) {
  // Tool: Get cache status
  server.registerTool(
    "spartan_cache_status",
    {
      title: "Get cache status",
      description:
        "Get current cache status, including version, cached components, and statistics",
      inputSchema: {},
    },
    async () => {
      try {
        await cacheManager.initialize();
        const stats = await cacheManager.getStats();

        const summary = {
          currentVersion: stats.currentVersion,
          totalVersions: stats.totalVersions,
          versions: stats.versions,
          totalComponents: KNOWN_COMPONENTS.length,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      } catch (error) {
        const err = /** @type {Error} */ (error);
        return {
          content: [
            {
              type: "text",
              text: `Error getting cache status: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: Clear cache for current version
  server.registerTool(
    "spartan_cache_clear",
    {
      title: "Clear cache",
      description:
        "Clear cached documentation for the current Spartan UI version",
      inputSchema: {
        allVersions: z
          .boolean()
          .optional()
          .describe("Clear cache for all versions (default: false)"),
      },
    },
    async (/** @type {{ allVersions?: boolean }} */ { allVersions }) => {
      try {
        await cacheManager.initialize();

        const result = allVersions
          ? await cacheManager.clearAll()
          : await cacheManager.clearVersion();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const err = /** @type {Error} */ (error);
        return {
          content: [
            {
              type: "text",
              text: `Error clearing cache: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: Rebuild cache (warm up)
  server.registerTool(
    "spartan_cache_rebuild",
    {
      title: "Rebuild cache",
      description:
        "Rebuild cache by fetching fresh data from spartan.ng and GitHub. " +
        "Caches component docs, documentation topics, and optionally block source code.",
      inputSchema: {
        components: z
          .array(z.string())
          .optional()
          .describe(
            "Specific components to rebuild (default: all components)"
          ),
        includeDocs: z
          .boolean()
          .optional()
          .describe("Include documentation topics (default: true)"),
        includeBlocks: z
          .boolean()
          .optional()
          .describe(
            "Include block source code from GitHub (default: false). " +
            "Requires GitHub API access — set GITHUB_TOKEN for best results."
          ),
      },
    },
    async (
      /** @type {{ components?: string[], includeDocs?: boolean, includeBlocks?: boolean }} */ {
        components,
        includeDocs = true,
        includeBlocks = false,
      }
    ) => {
      try {
        await cacheManager.initialize();

        // Validate component names against allowlist
        const componentList = components || KNOWN_COMPONENTS;
        const invalid = componentList.filter((c) => !KNOWN_COMPONENTS.includes(c));
        if (invalid.length > 0) {
          throw new Error(`Unknown components: ${invalid.join(", ")}`);
        }

        // Clear existing cache first
        await cacheManager.clearVersion();

        // Warm up cache
        const results = await warmCache({
          components: componentList,
          includeDocs,
          includeBlocks,
          onProgress: (current, total) => {
            // Progress tracking (could be enhanced with streaming)
            if (current % 5 === 0) {
              console.log(`Progress: ${current}/${total} components cached`);
            }
          },
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  version: results.version,
                  components: {
                    total: results.components.total,
                    success: results.components.success,
                    failed: results.components.failed,
                  },
                  docs: {
                    total: results.docs.total,
                    success: results.docs.success,
                    failed: results.docs.failed,
                  },
                  blocks: {
                    total: results.blocks.total,
                    success: results.blocks.success,
                    failed: results.blocks.failed,
                  },
                  duration: `${(results.duration / 1000).toFixed(2)}s`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const err = /** @type {Error} */ (error);
        return {
          content: [
            {
              type: "text",
              text: `Error rebuilding cache: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: Switch Spartan UI version
  server.registerTool(
    "spartan_cache_switch_version",
    {
      title: "Switch version",
      description:
        "Switch to a different Spartan UI version for caching and retrieval",
      inputSchema: {
        version: z
          .string()
          .describe("Spartan UI version (e.g., '1.2.3', 'latest')"),
      },
    },
    async (/** @type {{ version: string }} */ { version }) => {
      try {
        const result = await cacheManager.switchVersion(version);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const err = /** @type {Error} */ (error);
        return {
          content: [
            {
              type: "text",
              text: `Error switching version: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: List available versions
  server.registerTool(
    "spartan_cache_list_versions",
    {
      title: "List cached versions",
      description: "List all cached Spartan UI versions",
      inputSchema: {},
    },
    async () => {
      try {
        await cacheManager.initialize();
        const versions = await cacheManager.listVersions();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(versions, null, 2),
            },
          ],
        };
      } catch (error) {
        const err = /** @type {Error} */ (error);
        return {
          content: [
            {
              type: "text",
              text: `Error listing versions: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
