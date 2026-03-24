//@ts-check
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

/** Maximum number of cached versions to prevent disk exhaustion */
const MAX_CACHED_VERSIONS = 10;

/**
 * Validates and sanitizes a path segment (version, component name, topic)
 * to prevent path traversal attacks.
 * @param {string} segment
 * @param {string} label - for error messages
 * @returns {string} sanitized segment
 */
function sanitizePathSegment(segment, label) {
  if (typeof segment !== "string" || segment.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  // Only allow alphanumeric, hyphens, underscores, and dots (no leading dot)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(segment)) {
    throw new Error(
      `Invalid ${label}: "${segment}". Only alphanumeric characters, hyphens, underscores, and dots are allowed.`
    );
  }
  return segment;
}

/**
 * Validates that a resolved path stays within the expected base directory.
 * @param {string} resolvedPath
 * @param {string} baseDir
 */
function assertPathWithinBase(resolvedPath, baseDir) {
  const normalizedResolved = path.resolve(resolvedPath);
  const normalizedBase = path.resolve(baseDir);
  if (!normalizedResolved.startsWith(normalizedBase + path.sep) && normalizedResolved !== normalizedBase) {
    throw new Error("Path traversal detected: resolved path escapes base directory");
  }
}

/**
 * Version-aware cache manager for Spartan UI documentation
 * Stores cached data in cache/{version}/ directory structure
 */
export class CacheManager {
  constructor() {
    this.cacheDir = path.join(PROJECT_ROOT, "cache");
    this.currentVersion = null;
    this.cacheMetadata = null;
  }

  /**
   * Initialize cache directory with version
   * @param {string} [spartanVersion] - Spartan UI version (defaults to "latest")
   */
  async initialize(spartanVersion) {
    // Use provided version or default to "latest"
    this.currentVersion = sanitizePathSegment(spartanVersion || "latest", "version");

    // Ensure cache directory structure exists
    await this.ensureCacheDir();

    // Load or create metadata
    await this.loadMetadata();

    return this.currentVersion;
  }

  /**
   * Ensure cache directory structure exists
   */
  async ensureCacheDir() {
    const versionDir = path.join(this.cacheDir, this.currentVersion);
    const componentsDir = path.join(versionDir, "components");
    const docsDir = path.join(versionDir, "docs");
    const blocksDir = path.join(versionDir, "blocks");
    const sourceDir = path.join(versionDir, "source");

    await fs.mkdir(componentsDir, { recursive: true });
    await fs.mkdir(docsDir, { recursive: true });
    await fs.mkdir(blocksDir, { recursive: true });
    await fs.mkdir(sourceDir, { recursive: true });
  }

  /**
   * Load cache metadata
   */
  async loadMetadata() {
    const metadataPath = path.join(
      this.cacheDir,
      this.currentVersion,
      "metadata.json"
    );

    try {
      const data = await fs.readFile(metadataPath, "utf-8");
      this.cacheMetadata = JSON.parse(data);
    } catch (error) {
      // Create new metadata if it doesn't exist
      this.cacheMetadata = {
        version: this.currentVersion,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        components: {},
        docs: {},
        blocks: {},
        source: {},
      };
      await this.saveMetadata();
    }
  }

  /**
   * Save cache metadata
   */
  async saveMetadata() {
    const metadataPath = path.join(
      this.cacheDir,
      this.currentVersion,
      "metadata.json"
    );
    await fs.writeFile(
      metadataPath,
      JSON.stringify(this.cacheMetadata, null, 2),
      "utf-8"
    );
  }

  /**
   * Get cached component data
   * @param {string} componentName
   * @param {string} dataType - "html", "api", "examples", "full"
   */
  async getComponent(componentName, dataType = "full") {
    const safeName = sanitizePathSegment(componentName, "componentName");
    const componentFile = path.join(
      this.cacheDir,
      this.currentVersion,
      "components",
      `${safeName}.json`
    );
    assertPathWithinBase(componentFile, this.cacheDir);

    try {
      const data = await fs.readFile(componentFile, "utf-8");
      const componentData = JSON.parse(data);

      // Check if cache is still valid (TTL check)
      const ttlHours = Number(process.env.SPARTAN_CACHE_TTL_HOURS || 24);
      const cacheAge = Date.now() - new Date(componentData.cachedAt).getTime();
      const isStale = cacheAge > ttlHours * 60 * 60 * 1000;

      return {
        data: componentData[dataType] || componentData,
        cached: true,
        stale: isStale,
        cachedAt: componentData.cachedAt,
        version: this.currentVersion,
      };
    } catch (error) {
      return {
        data: null,
        cached: false,
        stale: false,
        cachedAt: null,
        version: this.currentVersion,
      };
    }
  }

  /**
   * Set cached component data
   * @param {string} componentName
   * @param {Object} data - { html, api, examples, full }
   */
  async setComponent(componentName, data) {
    const safeName = sanitizePathSegment(componentName, "componentName");
    const componentFile = path.join(
      this.cacheDir,
      this.currentVersion,
      "components",
      `${safeName}.json`
    );
    assertPathWithinBase(componentFile, this.cacheDir);

    const cacheEntry = {
      ...data,
      componentName,
      version: this.currentVersion,
      cachedAt: new Date().toISOString(),
    };

    await fs.writeFile(
      componentFile,
      JSON.stringify(cacheEntry, null, 2),
      "utf-8"
    );

    // Update metadata
    this.cacheMetadata.components[componentName] = {
      cachedAt: cacheEntry.cachedAt,
      size: JSON.stringify(cacheEntry).length,
    };
    this.cacheMetadata.lastUpdated = new Date().toISOString();
    await this.saveMetadata();
  }

  /**
   * Get cached docs data
   * @param {string} topic - "installation", "theming", etc.
   */
  async getDocs(topic) {
    const safeTopic = sanitizePathSegment(topic, "topic");
    const docsFile = path.join(
      this.cacheDir,
      this.currentVersion,
      "docs",
      `${safeTopic}.json`
    );
    assertPathWithinBase(docsFile, this.cacheDir);

    try {
      const data = await fs.readFile(docsFile, "utf-8");
      const docsData = JSON.parse(data);

      const ttlHours = Number(process.env.SPARTAN_CACHE_TTL_HOURS || 24);
      const cacheAge = Date.now() - new Date(docsData.cachedAt).getTime();
      const isStale = cacheAge > ttlHours * 60 * 60 * 1000;

      return {
        data: docsData.content,
        cached: true,
        stale: isStale,
        cachedAt: docsData.cachedAt,
        version: this.currentVersion,
      };
    } catch (error) {
      return {
        data: null,
        cached: false,
        stale: false,
        cachedAt: null,
        version: this.currentVersion,
      };
    }
  }

  /**
   * Set cached docs data
   * @param {string} topic
   * @param {string} content
   */
  async setDocs(topic, content) {
    const safeTopic = sanitizePathSegment(topic, "topic");
    const docsFile = path.join(
      this.cacheDir,
      this.currentVersion,
      "docs",
      `${safeTopic}.json`
    );
    assertPathWithinBase(docsFile, this.cacheDir);

    const cacheEntry = {
      topic,
      content,
      version: this.currentVersion,
      cachedAt: new Date().toISOString(),
    };

    await fs.writeFile(docsFile, JSON.stringify(cacheEntry, null, 2), "utf-8");

    // Update metadata
    this.cacheMetadata.docs[topic] = {
      cachedAt: cacheEntry.cachedAt,
      size: JSON.stringify(cacheEntry).length,
    };
    this.cacheMetadata.lastUpdated = new Date().toISOString();
    await this.saveMetadata();
  }

  /**
   * Get cached block data
   * @param {string} category - Block category (e.g., "sidebar", "login")
   * @param {string} variant - Block variant (e.g., "sidebar-sticky-header")
   */
  async getBlock(category, variant) {
    const safeCategory = sanitizePathSegment(category, "category");
    const safeVariant = sanitizePathSegment(variant, "variant");
    const blockDir = path.join(
      this.cacheDir,
      this.currentVersion,
      "blocks",
      safeCategory
    );
    const blockFile = path.join(blockDir, `${safeVariant}.json`);
    assertPathWithinBase(blockFile, this.cacheDir);

    try {
      const data = await fs.readFile(blockFile, "utf-8");
      const blockData = JSON.parse(data);

      const ttlHours = Number(process.env.SPARTAN_CACHE_TTL_HOURS || 24);
      const cacheAge = Date.now() - new Date(blockData.cachedAt).getTime();
      const isStale = cacheAge > ttlHours * 60 * 60 * 1000;

      return {
        data: blockData,
        cached: true,
        stale: isStale,
        cachedAt: blockData.cachedAt,
        version: this.currentVersion,
      };
    } catch (error) {
      return {
        data: null,
        cached: false,
        stale: false,
        cachedAt: null,
        version: this.currentVersion,
      };
    }
  }

  /**
   * Set cached block data
   * @param {string} category
   * @param {string} variant
   * @param {Object} data - Block source data
   */
  async setBlock(category, variant, data) {
    const safeCategory = sanitizePathSegment(category, "category");
    const safeVariant = sanitizePathSegment(variant, "variant");
    const blockDir = path.join(
      this.cacheDir,
      this.currentVersion,
      "blocks",
      safeCategory
    );
    await fs.mkdir(blockDir, { recursive: true });

    const blockFile = path.join(blockDir, `${safeVariant}.json`);
    assertPathWithinBase(blockFile, this.cacheDir);

    const cacheEntry = {
      ...data,
      category,
      variant,
      version: this.currentVersion,
      cachedAt: new Date().toISOString(),
    };

    await fs.writeFile(
      blockFile,
      JSON.stringify(cacheEntry, null, 2),
      "utf-8"
    );

    if (!this.cacheMetadata.blocks) this.cacheMetadata.blocks = {};
    this.cacheMetadata.blocks[`${category}/${variant}`] = {
      cachedAt: cacheEntry.cachedAt,
      size: JSON.stringify(cacheEntry).length,
    };
    this.cacheMetadata.lastUpdated = new Date().toISOString();
    await this.saveMetadata();
  }

  /**
   * Get cached component source code
   * @param {string} componentName
   * @param {string} layer - "brain" or "helm"
   */
  async getSource(componentName, layer) {
    const safeName = sanitizePathSegment(componentName, "componentName");
    const safeLayer = sanitizePathSegment(layer, "layer");
    const sourceDir = path.join(
      this.cacheDir,
      this.currentVersion,
      "source",
      safeLayer
    );
    const sourceFile = path.join(sourceDir, `${safeName}.json`);
    assertPathWithinBase(sourceFile, this.cacheDir);

    try {
      const data = await fs.readFile(sourceFile, "utf-8");
      const sourceData = JSON.parse(data);

      const ttlHours = Number(process.env.SPARTAN_CACHE_TTL_HOURS || 24);
      const cacheAge = Date.now() - new Date(sourceData.cachedAt).getTime();
      const isStale = cacheAge > ttlHours * 60 * 60 * 1000;

      return {
        data: sourceData,
        cached: true,
        stale: isStale,
        cachedAt: sourceData.cachedAt,
        version: this.currentVersion,
      };
    } catch (error) {
      return {
        data: null,
        cached: false,
        stale: false,
        cachedAt: null,
        version: this.currentVersion,
      };
    }
  }

  /**
   * Set cached component source code
   * @param {string} componentName
   * @param {string} layer - "brain" or "helm"
   * @param {Object} data - Source code data
   */
  async setSource(componentName, layer, data) {
    const safeName = sanitizePathSegment(componentName, "componentName");
    const safeLayer = sanitizePathSegment(layer, "layer");
    const sourceDir = path.join(
      this.cacheDir,
      this.currentVersion,
      "source",
      safeLayer
    );
    await fs.mkdir(sourceDir, { recursive: true });

    const sourceFile = path.join(sourceDir, `${safeName}.json`);
    assertPathWithinBase(sourceFile, this.cacheDir);

    const cacheEntry = {
      ...data,
      componentName,
      layer,
      version: this.currentVersion,
      cachedAt: new Date().toISOString(),
    };

    await fs.writeFile(
      sourceFile,
      JSON.stringify(cacheEntry, null, 2),
      "utf-8"
    );

    if (!this.cacheMetadata.source) this.cacheMetadata.source = {};
    this.cacheMetadata.source[`${layer}/${componentName}`] = {
      cachedAt: cacheEntry.cachedAt,
      size: JSON.stringify(cacheEntry).length,
    };
    this.cacheMetadata.lastUpdated = new Date().toISOString();
    await this.saveMetadata();
  }

  /**
   * Clear all cached data for current version
   */
  async clearVersion() {
    const versionDir = path.join(this.cacheDir, this.currentVersion);

    try {
      await fs.rm(versionDir, { recursive: true, force: true });
      await this.ensureCacheDir();
      await this.loadMetadata();

      return {
        success: true,
        message: `Cleared cache for version ${this.currentVersion}`,
        version: this.currentVersion,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to clear cache: ${error.message}`,
        version: this.currentVersion,
      };
    }
  }

  /**
   * Clear all cached data for all versions
   */
  async clearAll() {
    try {
      const versions = await fs.readdir(this.cacheDir);
      let clearedVersions = [];

      for (const version of versions) {
        const versionPath = path.join(this.cacheDir, version);
        const stats = await fs.stat(versionPath);

        if (stats.isDirectory()) {
          await fs.rm(versionPath, { recursive: true, force: true });
          clearedVersions.push(version);
        }
      }

      await this.ensureCacheDir();
      await this.loadMetadata();

      return {
        success: true,
        message: `Cleared cache for ${clearedVersions.length} version(s)`,
        versions: clearedVersions,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to clear all cache: ${error.message}`,
        versions: [],
      };
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      const versions = await fs.readdir(this.cacheDir);
      const versionStats = [];

      for (const version of versions) {
        const versionPath = path.join(this.cacheDir, version);
        const stats = await fs.stat(versionPath);

        if (stats.isDirectory()) {
          const metadataPath = path.join(versionPath, "metadata.json");
          try {
            const metadataContent = await fs.readFile(metadataPath, "utf-8");
            const metadata = JSON.parse(metadataContent);

            const componentCount = Object.keys(
              metadata.components || {}
            ).length;
            const docsCount = Object.keys(metadata.docs || {}).length;
            const blocksCount = Object.keys(metadata.blocks || {}).length;
            const sourceCount = Object.keys(metadata.source || {}).length;

            versionStats.push({
              version,
              componentCount,
              docsCount,
              blocksCount,
              sourceCount,
              createdAt: metadata.createdAt,
              lastUpdated: metadata.lastUpdated,
              isCurrent: version === this.currentVersion,
            });
          } catch (error) {
            // Skip invalid directories
          }
        }
      }

      return {
        currentVersion: this.currentVersion,
        totalVersions: versionStats.length,
        versions: versionStats,
      };
    } catch (error) {
      return {
        currentVersion: this.currentVersion,
        totalVersions: 0,
        versions: [],
        error: error.message,
      };
    }
  }

  /**
   * List all available versions
   */
  async listVersions() {
    try {
      const versions = await fs.readdir(this.cacheDir);
      const validVersions = [];

      for (const version of versions) {
        const versionPath = path.join(this.cacheDir, version);
        const stats = await fs.stat(versionPath);

        if (stats.isDirectory()) {
          validVersions.push({
            version,
            isCurrent: version === this.currentVersion,
          });
        }
      }

      return validVersions;
    } catch (error) {
      return [];
    }
  }

  /**
   * Switch to a different version
   * @param {string} version
   */
  async switchVersion(version) {
    this.currentVersion = sanitizePathSegment(version, "version");

    // Enforce maximum cached versions
    try {
      const existing = await fs.readdir(this.cacheDir);
      const dirs = [];
      for (const entry of existing) {
        const entryPath = path.join(this.cacheDir, entry);
        const stats = await fs.stat(entryPath);
        if (stats.isDirectory()) dirs.push(entry);
      }
      if (!dirs.includes(this.currentVersion) && dirs.length >= MAX_CACHED_VERSIONS) {
        throw new Error(
          `Maximum cached versions (${MAX_CACHED_VERSIONS}) reached. Clear old versions before switching to a new one.`
        );
      }
    } catch (error) {
      if (error.message.includes("Maximum cached versions")) throw error;
      // cacheDir may not exist yet, which is fine
    }

    await this.ensureCacheDir();
    await this.loadMetadata();

    return {
      success: true,
      version: this.currentVersion,
      message: `Switched to version ${version}`,
    };
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();
