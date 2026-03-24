import { z } from "zod";
import {
  KNOWN_COMPONENTS,
  SPARTAN_COMPONENTS_BASE,
  fetchContent,
  extractCodeBlocks,
  extractHeadings,
  extractLinks,
  getComponentAPI,
} from "./utils.js";
import { cacheManager } from "./cache.js";
import {
  fetchGitHubDirectory,
  fetchGitHubFile,
  fetchGitHubDirectoryFiles,
} from "./github.js";

export function registerComponentTools(server) {
  // List components
  server.registerTool(
    "spartan_components_list",
    {
      title: "List Spartan UI components",
      description:
        "Returns all available Spartan Angular UI components (57+) with documentation URLs. " +
        "Each component has Brain API (headless primitives) and/or Helm API (styled wrappers). " +
        "Use spartan_components_get for docs, spartan_components_source for TypeScript source code.",
      inputSchema: {},
    },
    async () => {
      const items = KNOWN_COMPONENTS.map((name) => ({
        name,
        url: `${SPARTAN_COMPONENTS_BASE}/${name}`,
      }));
      const responseText = JSON.stringify(
        { components: items, totalComponents: items.length },
        null,
        2
      );
      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    },
  );

  // Get component page
  server.registerTool(
    "spartan_components_get",
    {
      title: "Get component documentation",
      description:
        "Fetch Spartan UI documentation for a component from spartan.ng. Returns Brain API " +
        "(Brn* headless directives) and Helm API (Hlm* styled components) with inputs, outputs, " +
        "selectors, and code examples. Use extract='api' for structured JSON, extract='code' for " +
        "code blocks only. For actual TypeScript source, use spartan_components_source instead.",
      inputSchema: {
        name: z
          .string()
          .min(1, "name is required")
          .describe("Component name (kebab-case), e.g., 'accordion'."),
        format: z
          .enum(["html", "text"])
          .default("html")
          .describe("Return format: raw HTML or plain text."),
        extract: z
          .enum(["none", "code", "headings", "links", "api"])
          .default("api")
          .describe(
            "Extraction mode. 'api' (default, recommended): structured JSON from Analog API. " +
            "'code': code blocks from website. 'headings'/'links': HTML parsing. 'none': raw page.",
          ),
        noCache: z.boolean().default(false).describe("Bypass cache when true."),
        spartanVersion: z
          .string()
          .optional()
          .describe(
            "Spartan UI version to use for caching (e.g., '1.2.3'). If not provided, defaults to 'latest'.",
          ),
      },
    },
    async (
      /** @type {{ name: any; format: string; extract: string; noCache: any; spartanVersion?: string; }} */ args,
    ) => {
      const name = String(args.name || "")
        .trim()
        .toLowerCase();
      if (!name) throw new Error("Missing component name");
      if (!KNOWN_COMPONENTS.includes(name)) {
        throw new Error(
          `Unknown component: "${name}". Use spartan_components_list to see available components.`
        );
      }

      const url = `${SPARTAN_COMPONENTS_BASE}/${encodeURIComponent(name)}`;
      const extract = args.extract;
      const noCache = Boolean(args.noCache);

      // For 'api' extraction (default and recommended), use the Analog API
      // which returns perfect structured data in a single request.
      if (extract === "api") {
        const apiData = await getComponentAPI(name, noCache);
        if (!apiData) {
          throw new Error(`No API data found for component "${name}".`);
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { ...apiData, url, source: "spartan-analog-api" },
                null,
                2
              ),
            },
          ],
        };
      }

      // For other extractions, fall back to website scraping
      const format = args.format === "text" ? "text" : "html";
      const content = await fetchContent(url, format, noCache);

      if (extract === "none" || format === "text") {
        return {
          content: [
            { type: "text", text: `${content}\n\nSource: ${url}` },
          ],
        };
      }

      const html = /** @type {string} */ (
        await fetchContent(url, "html", noCache)
      );
      let extracted;
      if (extract === "code") extracted = extractCodeBlocks(html);
      else if (extract === "headings") extracted = extractHeadings(html);
      else if (extract === "links") extracted = extractLinks(html);
      else extracted = [];
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { url, extract, count: Array.isArray(extracted) ? extracted.length : 0, data: extracted },
              null,
              2
            ),
          },
        ],
      };
    },
  );

  // Get component TypeScript source code from GitHub
  server.registerTool(
    "spartan_components_source",
    {
      title: "Get component TypeScript source",
      description:
        "Fetch the actual TypeScript source code for a Spartan UI component library from GitHub. " +
        "Returns the real directive/component files with exact type definitions, decorators, inputs, " +
        "outputs, and implementation details. Use layer='brain' for headless primitives, " +
        "layer='helm' for styled components, or layer='both' for everything. " +
        "This complements spartan_components_get (which returns website documentation) by " +
        "providing the authoritative source code. Not all components have a Brain library — " +
        "some are Helm-only (e.g., badge, card, icon, spinner).",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .describe("Component name in kebab-case (e.g., 'dialog', 'sidebar')."),
        layer: z
          .enum(["brain", "helm", "both"])
          .default("helm")
          .describe(
            "Which API layer to fetch: 'brain' (headless), 'helm' (styled), or 'both'."
          ),
        noCache: z
          .boolean()
          .default(false)
          .describe("Bypass cache and fetch fresh from GitHub."),
      },
    },
    async (args) => {
      const name = String(args.name || "").trim().toLowerCase();
      if (!name) throw new Error("Missing component name");
      if (!KNOWN_COMPONENTS.includes(name)) {
        throw new Error(
          `Unknown component: "${name}". Use spartan_components_list to see available components.`
        );
      }

      await cacheManager.initialize();
      const layers = args.layer === "both" ? ["brain", "helm"] : [args.layer];
      const results = {};

      for (const layer of layers) {
        // Try cache first
        if (!args.noCache) {
          const cached = await cacheManager.getSource(name, layer);
          if (cached.cached && !cached.stale) {
            results[layer] = cached.data;
            continue;
          }
        }

        // Fetch from GitHub
        const libPath = `libs/${layer}/${name}/src`;
        try {
          // First check if the library exists
          const srcEntries = await fetchGitHubDirectory(libPath, args.noCache);
          const libDir = srcEntries.find((e) => e.name === "lib" && e.type === "dir");
          const indexFile = srcEntries.find((e) => e.name === "index.ts");

          const files = [];

          // Fetch index.ts for exports
          if (indexFile) {
            const indexData = await fetchGitHubFile(indexFile.path, args.noCache);
            files.push({
              name: "index.ts",
              content: indexData.content,
              path: indexFile.path,
            });
          }

          // Fetch lib/ directory files
          if (libDir) {
            const libFiles = await fetchGitHubDirectoryFiles(
              libDir.path,
              args.noCache
            );
            files.push(...libFiles);
          }

          const layerData = {
            component: name,
            layer,
            files: files.map((f) => ({
              name: f.name,
              content: f.content,
            })),
            fileCount: files.length,
            exports: indexFile
              ? extractExportsFromIndex(
                  files.find((f) => f.name === "index.ts")?.content || ""
                )
              : [],
          };

          // Cache
          await cacheManager.setSource(name, layer, layerData);
          results[layer] = layerData;
        } catch (err) {
          if (err.message.includes("not found")) {
            results[layer] = {
              component: name,
              layer,
              available: false,
              reason: `No ${layer} library found for "${name}". This component may be ${layer === "brain" ? "Helm" : "Brain"}-only.`,
            };
          } else {
            throw err;
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                component: name,
                requestedLayer: args.layer,
                ...results,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

/**
 * Extract export names from an index.ts file.
 * @param {string} content
 * @returns {string[]}
 */
function extractExportsFromIndex(content) {
  const exports = [];
  // Match "export * from './lib/something'" and "export { Name } from..."
  const reExportRegex = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g;
  const namedExportRegex = /export\s*\{([^}]+)\}/g;
  const constExportRegex = /export\s+const\s+(\w+)/g;

  let match;
  while ((match = reExportRegex.exec(content)) !== null) {
    const modulePath = match[1];
    const moduleName = modulePath.split("/").pop();
    exports.push(`* from ${moduleName}`);
  }
  while ((match = namedExportRegex.exec(content)) !== null) {
    const names = match[1].split(",").map((s) => s.trim()).filter(Boolean);
    exports.push(...names);
  }
  while ((match = constExportRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }
  return [...new Set(exports)];
}
