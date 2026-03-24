//@ts-check
import { z } from "zod";
import {
  KNOWN_BLOCKS,
  BLOCK_CATEGORIES,
  BLOCK_GITHUB_PATHS,
  BLOCK_SHARED_PATH,
} from "./utils.js";
import {
  fetchGitHubDirectory,
  fetchGitHubFile,
  fetchGitHubDirectoryFiles,
  SPARTAN_REPO,
  SPARTAN_REPO_BRANCH,
} from "./github.js";
import { cacheManager } from "./cache.js";

/**
 * Extract Spartan and Angular imports from TypeScript source code.
 * @param {string} source
 */
function extractImportsFromSource(source) {
  const spartanImports = [];
  const angularImports = [];
  const otherImports = [];

  const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(source)) !== null) {
    const items = match[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const from = match[2];

    if (from.includes("@spartan-ng/")) {
      spartanImports.push(...items);
    } else if (from.includes("@angular/")) {
      angularImports.push(...items);
    } else {
      otherImports.push(...items);
    }
  }

  return {
    spartanImports: [...new Set(spartanImports)],
    angularImports: [...new Set(angularImports)],
    otherImports: [...new Set(otherImports)],
  };
}

/**
 * Resolve the GitHub directory path for a specific block variant.
 * @param {string} category
 * @param {string} variant
 * @returns {string}
 */
function resolveBlockPath(category, variant) {
  const basePath = BLOCK_GITHUB_PATHS[category];
  if (!basePath) throw new Error(`Unknown block category: ${category}`);
  return `${basePath}/${variant}`;
}

/**
 * Build a GitHub tree URL for a block variant.
 * @param {string} category
 * @param {string} variant
 * @returns {string}
 */
function buildGitHubUrl(category, variant) {
  const blockPath = resolveBlockPath(category, variant);
  return `https://github.com/${SPARTAN_REPO}/tree/${SPARTAN_REPO_BRANCH}/${blockPath}`;
}

/**
 * Fetch all source files for a block variant, optionally including shared files.
 * @param {string} category
 * @param {string} variant
 * @param {boolean} includeShared
 * @param {boolean} noCache
 */
async function fetchBlockSource(category, variant, includeShared, noCache) {
  const blockPath = resolveBlockPath(category, variant);

  // Fetch main block files
  const entries = await fetchGitHubDirectory(blockPath, noCache);
  const files = [];

  for (const entry of entries) {
    if (entry.type === "file" && entry.name.endsWith(".ts")) {
      const fileData = await fetchGitHubFile(entry.path, noCache);
      files.push({
        name: entry.name,
        content: fileData.content,
        path: entry.path,
      });
    } else if (entry.type === "dir") {
      // Fetch subdirectory files (e.g., sidebar-sticky-header/sticky-header/)
      const subFiles = await fetchGitHubDirectoryFiles(entry.path, noCache);
      for (const sf of subFiles) {
        files.push({
          name: sf.name,
          content: sf.content,
          path: sf.path,
        });
      }
    }
  }

  // Aggregate imports from all files
  const allSource = files.map((f) => f.content).join("\n");
  const imports = extractImportsFromSource(allSource);

  // Fetch shared files if requested and if the block uses shared imports
  let sharedFiles = [];
  if (includeShared && category !== "calendar") {
    // Check if any file imports from shared
    const usesShared = files.some((f) =>
      f.content.includes("/shared/") || f.content.includes("../shared/")
    );
    if (usesShared) {
      try {
        const sharedEntries = await fetchGitHubDirectory(BLOCK_SHARED_PATH, noCache);
        for (const dir of sharedEntries) {
          if (dir.type === "dir") {
            const dirFiles = await fetchGitHubDirectoryFiles(dir.path, noCache);
            sharedFiles.push(
              ...dirFiles.map((f) => ({
                name: `shared/${dir.name}/${f.name}`,
                content: f.content,
                path: f.path,
              }))
            );
          }
        }
      } catch (err) {
        // Shared files are optional — don't fail if not available
        console.error(`Failed to fetch shared files: ${err.message}`);
      }
    }
  }

  return { files, sharedFiles, imports };
}

/**
 * Register block-related MCP tools.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 */
export function registerBlockTools(server) {
  // List all available blocks
  server.registerTool(
    "spartan_blocks_list",
    {
      title: "List Spartan UI building blocks",
      description:
        "Returns all available Spartan UI building blocks organized by category. " +
        "Blocks are complete, page-level Angular components (not individual UI primitives). " +
        "Categories: sidebar (app shells), login/signup (auth pages), calendar (date UIs). " +
        "Use spartan_blocks_get to fetch the full source code for any block variant.",
      inputSchema: {
        category: z
          .enum(/** @type {[string, ...string[]]} */ (BLOCK_CATEGORIES))
          .optional()
          .describe("Filter by category. Omit to list all categories."),
      },
    },
    async (args) => {
      const categories = args.category
        ? { [args.category]: KNOWN_BLOCKS[args.category] }
        : KNOWN_BLOCKS;

      const result = Object.entries(categories).map(([cat, variants]) => ({
        category: cat,
        description: getBlockCategoryDescription(cat),
        variants: variants.map((v) => ({
          name: v,
          githubUrl: buildGitHubUrl(cat, v),
        })),
        variantCount: variants.length,
      }));

      const totalVariants = result.reduce((sum, c) => sum + c.variantCount, 0);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                totalCategories: result.length,
                totalVariants,
                categories: result,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Get block source code
  server.registerTool(
    "spartan_blocks_get",
    {
      title: "Get block source code",
      description:
        "Fetch the complete TypeScript source code for a Spartan UI block variant from GitHub. " +
        "Returns all component files, templates, and imports. Blocks are full page-level " +
        "Angular components showing real-world usage of Spartan UI components together. " +
        "Set includeShared=true to also fetch shared utilities (nav components, data files) " +
        "used by sidebar blocks. The response includes extracted Spartan and Angular imports " +
        "so you can see which components the block uses.",
      inputSchema: {
        category: z
          .enum(/** @type {[string, ...string[]]} */ (BLOCK_CATEGORIES))
          .describe("Block category: sidebar, login, signup, or calendar."),
        variant: z
          .string()
          .min(1)
          .describe(
            "Block variant name (e.g., 'sidebar-sticky-header', 'login-simple-reactive-form'). " +
            "Use spartan_blocks_list to see available variants."
          ),
        includeShared: z
          .boolean()
          .default(false)
          .describe(
            "Include shared utility files (nav components, data). Useful for sidebar blocks."
          ),
        noCache: z
          .boolean()
          .default(false)
          .describe("Bypass cache and fetch fresh from GitHub."),
      },
    },
    async (args) => {
      const { category, variant, includeShared, noCache } = args;

      // Validate variant exists
      const categoryVariants = KNOWN_BLOCKS[category];
      if (!categoryVariants) {
        throw new Error(`Unknown category: ${category}. Use spartan_blocks_list to see categories.`);
      }
      if (!categoryVariants.includes(variant)) {
        throw new Error(
          `Unknown variant: "${variant}" in category "${category}". ` +
          `Available: ${categoryVariants.join(", ")}`
        );
      }

      // Initialize cache
      await cacheManager.initialize();

      // Try cache first
      if (!noCache) {
        const cached = await cacheManager.getBlock(category, variant);
        if (cached.cached && !cached.stale) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(cached.data, null, 2),
              },
            ],
          };
        }
      }

      // Fetch from GitHub
      const { files, sharedFiles, imports } = await fetchBlockSource(
        category,
        variant,
        includeShared,
        noCache
      );

      const result = {
        category,
        variant,
        description: getBlockCategoryDescription(category),
        files: files.map((f) => ({
          name: f.name,
          content: f.content,
          language: "typescript",
        })),
        sharedFiles: sharedFiles.length > 0
          ? sharedFiles.map((f) => ({
              name: f.name,
              content: f.content,
              language: "typescript",
            }))
          : undefined,
        spartanImports: imports.spartanImports,
        angularImports: imports.angularImports,
        otherImports: imports.otherImports,
        githubUrl: buildGitHubUrl(category, variant),
        fileCount: files.length + sharedFiles.length,
      };

      // Cache the result
      await cacheManager.setBlock(category, variant, result);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}

/**
 * Get human-readable description for a block category.
 * @param {string} category
 * @returns {string}
 */
function getBlockCategoryDescription(category) {
  const descriptions = {
    sidebar: "App shell layouts with sidebar navigation, sticky headers, and inset variants",
    login: "Authentication login pages with reactive forms, single and two-column layouts",
    signup: "Registration signup pages with reactive forms, single and two-column layouts",
    calendar: "Date/time picker interfaces: simple, multi-select, range, locale, disabled days, and more",
  };
  return descriptions[category] || category;
}
