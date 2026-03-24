//@ts-check
import { cacheManager } from "./cache.js";
import {
  fetchContent,
  getComponentAPI,
  KNOWN_COMPONENTS,
  KNOWN_BLOCKS,
  BLOCK_GITHUB_PATHS,
  SPARTAN_COMPONENTS_BASE,
  SPARTAN_DOCS_BASE,
} from "./utils.js";
import {
  fetchGitHubDirectory,
  fetchGitHubFile,
  fetchGitHubDirectoryFiles,
} from "./github.js";

/**
 * Cache warmup utility - Pre-populate cache with all components
 */

const DOCUMENTATION_TOPICS = [
  "installation",
  "theming",
  "dark-mode",
  "typography",
  "health-checks",
  "update-guide",
  "cli",
  "components-json",
  "version-support",
  "figma",
  "changelog",
  "about",
];

/**
 * Warm up cache for a specific component
 * @param {string} componentName
 * @param {string} version
 */
async function warmComponent(componentName, version) {
  try {
    console.log(`  📦 Caching ${componentName}...`);

    // Use Analog API for structured data (one bulk fetch, cached in memory)
    const apiData = await getComponentAPI(componentName);
    const url = `${SPARTAN_COMPONENTS_BASE}/${componentName}`;

    await cacheManager.setComponent(componentName, {
      api: apiData,
      url,
      full: { api: apiData, url },
    });

    return { success: true, component: componentName };
  } catch (error) {
    const err = /** @type {Error} */ (error);
    console.error(`  ❌ Failed to cache ${componentName}: ${err.message}`);
    return { success: false, component: componentName, error: err.message };
  }
}

/**
 * Warm up cache for documentation topics
 * @param {string} topic
 */
async function warmDocs(topic) {
  try {
    console.log(`  📄 Caching docs: ${topic}...`);

    const url = `${SPARTAN_DOCS_BASE}/${topic}`;
    const html = await fetchContent(url, "html", true);

    await cacheManager.setDocs(topic, html);

    return { success: true, topic };
  } catch (error) {
    const err = /** @type {Error} */ (error);
    console.error(`  ❌ Failed to cache ${topic}: ${err.message}`);
    return { success: false, topic, error: err.message };
  }
}

/**
 * Warm up cache for a block variant from GitHub
 * @param {string} category
 * @param {string} variant
 */
async function warmBlock(category, variant) {
  try {
    console.log(`  🧱 Caching block ${category}/${variant}...`);

    const basePath = BLOCK_GITHUB_PATHS[category];
    const blockPath = `${basePath}/${variant}`;

    const entries = await fetchGitHubDirectory(blockPath, true);
    const files = [];

    for (const entry of entries) {
      if (entry.type === "file" && entry.name.endsWith(".ts")) {
        const fileData = await fetchGitHubFile(entry.path, true);
        files.push({
          name: entry.name,
          content: fileData.content,
          path: entry.path,
        });
      } else if (entry.type === "dir") {
        const subFiles = await fetchGitHubDirectoryFiles(entry.path, true);
        files.push(
          ...subFiles.map((f) => ({
            name: f.name,
            content: f.content,
            path: f.path,
          }))
        );
      }
    }

    await cacheManager.setBlock(category, variant, {
      category,
      variant,
      files: files.map((f) => ({
        name: f.name,
        content: f.content,
        language: "typescript",
      })),
      fileCount: files.length,
    });

    return { success: true, category, variant };
  } catch (error) {
    const err = /** @type {Error} */ (error);
    console.error(
      `  ❌ Failed to cache block ${category}/${variant}: ${err.message}`
    );
    return {
      success: false,
      category,
      variant,
      error: err.message,
    };
  }
}

/**
 * Warm up entire cache for current version
 * @param {Object} options
 * @param {string[]} [options.components] - Specific components to cache
 * @param {boolean} [options.includeDocs] - Whether to cache docs
 * @param {boolean} [options.includeBlocks] - Whether to cache blocks from GitHub
 * @param {(current: number, total: number) => void} [options.onProgress] - Progress callback
 */
export async function warmCache(options = {}) {
  const {
    components = KNOWN_COMPONENTS,
    includeDocs = true,
    includeBlocks = false,
    onProgress = null,
  } = options;

  const startTime = Date.now();
  const results = {
    version: cacheManager.currentVersion,
    components: {
      total: components.length,
      success: 0,
      failed: 0,
      errors: [],
    },
    docs: {
      total: includeDocs ? DOCUMENTATION_TOPICS.length : 0,
      success: 0,
      failed: 0,
      errors: [],
    },
    blocks: {
      total: includeBlocks ? Object.values(KNOWN_BLOCKS).flat().length : 0,
      success: 0,
      failed: 0,
      errors: [],
    },
    duration: 0,
  };

  console.log(`\n🚀 Warming cache for Spartan UI v${results.version}\n`);
  console.log(`📦 Components: ${components.length}`);
  if (includeDocs) {
    console.log(`📄 Documentation topics: ${DOCUMENTATION_TOPICS.length}`);
  }
  console.log("");

  // Cache components
  console.log("📦 Caching Components...");
  for (let i = 0; i < components.length; i++) {
    const component = components[i];
    const result = await warmComponent(component, results.version);

    if (result.success) {
      results.components.success++;
    } else {
      results.components.failed++;
      results.components.errors.push({
        component,
        error: result.error,
      });
    }

    if (onProgress) {
      onProgress(i + 1, components.length);
    }

    // Rate limiting: wait 100ms between requests
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Cache documentation
  if (includeDocs) {
    console.log("\n📄 Caching Documentation...");
    for (let i = 0; i < DOCUMENTATION_TOPICS.length; i++) {
      const topic = DOCUMENTATION_TOPICS[i];
      const result = await warmDocs(topic);

      if (result.success) {
        results.docs.success++;
      } else {
        results.docs.failed++;
        results.docs.errors.push({
          topic,
          error: result.error,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Cache blocks from GitHub
  if (includeBlocks) {
    console.log("\n🧱 Caching Blocks from GitHub...");
    for (const [category, variants] of Object.entries(KNOWN_BLOCKS)) {
      for (const variant of variants) {
        const result = await warmBlock(category, variant);

        if (result.success) {
          results.blocks.success++;
        } else {
          results.blocks.failed++;
          results.blocks.errors.push({
            block: `${category}/${variant}`,
            error: result.error,
          });
        }

        // Rate limit GitHub API requests
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }

  results.duration = Date.now() - startTime;

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("✅ CACHE WARMUP COMPLETE\n");
  console.log(`Version: ${results.version}`);
  console.log(`Duration: ${(results.duration / 1000).toFixed(2)}s\n`);
  console.log(
    `Components: ${results.components.success}/${results.components.total} successful`
  );
  if (includeDocs) {
    console.log(
      `Documentation: ${results.docs.success}/${results.docs.total} successful`
    );
  }

  if (includeBlocks) {
    console.log(
      `Blocks: ${results.blocks.success}/${results.blocks.total} successful`
    );
  }

  if (results.components.failed > 0) {
    console.log(`\n⚠️  ${results.components.failed} component(s) failed:`);
    results.components.errors.forEach(({ component, error }) => {
      console.log(`   - ${component}: ${error}`);
    });
  }

  if (results.docs.failed > 0) {
    console.log(`\n⚠️  ${results.docs.failed} doc topic(s) failed:`);
    results.docs.errors.forEach(({ topic, error }) => {
      console.log(`   - ${topic}: ${error}`);
    });
  }

  console.log("=".repeat(60));

  return results;
}

/**
 * CLI wrapper for cache warming
 */
export async function runCacheWarmup() {
  try {
    // Initialize cache manager
    const version = await cacheManager.initialize();
    console.log(`📍 Using Spartan UI version: ${version}`);

    // Warm the cache
    const results = await warmCache({
      components: KNOWN_COMPONENTS,
      includeDocs: true,
    });

    // Exit with appropriate code
    const hasErrors = results.components.failed > 0 || results.docs.failed > 0;
    process.exit(hasErrors ? 1 : 0);
  } catch (error) {
    const err = /** @type {Error} */ (error);
    console.error("❌ Cache warmup failed:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCacheWarmup();
}
