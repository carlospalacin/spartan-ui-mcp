//@ts-check
import { z } from "zod";
import {
  KNOWN_COMPONENTS,
  COMPONENT_DEPENDENCIES,
} from "./utils.js";

export function registerAnalysisTools(server) {
  // Show component dependencies
  server.registerTool(
    "spartan_components_dependencies",
    {
      title: "Show component dependencies",
      description:
        "Analyze what other components, packages, or dependencies a Spartan UI component requires. " +
        "Includes Angular CDK dependencies, peer components, and installation requirements.",
      inputSchema: {
        componentName: z
          .string()
          .min(1, "componentName is required")
          .describe("Spartan component name (e.g., 'calendar', 'dialog')"),
        includeTransitive: z
          .boolean()
          .default(false)
          .describe(
            "Include transitive dependencies (dependencies of dependencies)"
          ),
      },
    },
    async (args) => {
      const componentName = String(args.componentName || "")
        .trim()
        .toLowerCase();
      if (!KNOWN_COMPONENTS.includes(componentName)) {
        throw new Error(
          `Unknown component: ${componentName}. Available: ${KNOWN_COMPONENTS.join(
            ", "
          )}`
        );
      }

      const dependencies = await analyzeComponentDependencies(
        componentName,
        args.includeTransitive
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                component: componentName,
                dependencies,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Find related/similar components
  // COMMENTED OUT: Not producing useful results
  /*
  server.registerTool(
    "spartan_components_related",
    {
      title: "Find related or similar components",
      description:
        "Find Spartan UI components that are related to or similar to a given component. " +
        "Analyzes functionality, use cases, and API patterns to suggest alternatives and complementary components.",
      inputSchema: {
        componentName: z
          .string()
          .min(1, "componentName is required")
          .describe("Spartan component name to find related components for"),
        relationshipType: z
          .enum(["similar", "complementary", "alternative", "all"])
          .default("all")
          .describe(
            "Type of relationship: 'similar' (same use case), 'complementary' (work together), 'alternative' (different approach), 'all'"
          ),
        limit: z
          .number()
          .min(1)
          .max(10)
          .default(5)
          .describe("Maximum number of related components to return"),
      },
    },
    async (args) => {
      const componentName = String(args.componentName || "")
        .trim()
        .toLowerCase();
      if (!KNOWN_COMPONENTS.includes(componentName)) {
        throw new Error(`Unknown component: ${componentName}`);
      }

      const related = await findRelatedComponents(
        componentName,
        args.relationshipType,
        args.limit
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                component: componentName,
                relationshipType: args.relationshipType,
                relatedComponents: related,
                processingInstructions:
                  "Present related components with explanations of relationships, use case comparisons, and when to choose each option.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
  */

  // List component variants (Brain vs Helm API)
  // COMMENTED OUT: Not producing useful results
  /*
  server.registerTool(
    "spartan_components_variants",
    {
      title: "List component variants (Brain vs Helm API)",
      description:
        "Compare Brain API (low-level, unstyled) and Helm API (high-level, styled) variants of a component. " +
        "Shows differences in API, styling approach, and when to use each variant.",
      inputSchema: {
        componentName: z
          .string()
          .min(1, "componentName is required")
          .describe("Spartan component name"),
        includeComparison: z
          .boolean()
          .default(true)
          .describe("Include detailed comparison between variants"),
      },
    },
    async (args) => {
      const componentName = String(args.componentName || "")
        .trim()
        .toLowerCase();
      if (!KNOWN_COMPONENTS.includes(componentName)) {
        throw new Error(`Unknown component: ${componentName}`);
      }

      const variants = await analyzeComponentVariants(
        componentName,
        args.includeComparison
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                component: componentName,
                variants,
                processingInstructions:
                  "Present variants with clear explanations of differences, use cases, and migration guidance between Brain and Helm APIs.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
  */

  // Accessibility check — removed: produced fake scores based on string matching,
  // not real accessibility analysis. The data was misleading.
  /* REMOVED in v2.0
  server.registerTool(
    "spartan_accessibility_check_REMOVED",
    {
      title: "Check component accessibility features",
      description:
        "Analyze accessibility features, ARIA support, keyboard navigation, and screen reader compatibility " +
        "for a Spartan UI component. Provides accessibility best practices and implementation guidance.",
      inputSchema: {
        componentName: z
          .string()
          .min(1, "componentName is required")
          .describe("Spartan component name"),
        checkType: z
          .enum(["overview", "aria", "keyboard", "screenreader", "wcag", "all"])
          .default("all")
          .describe(
            "Type of accessibility check: specific area or 'all' for comprehensive analysis"
          ),
      },
    },
    async (args) => {
      const componentName = String(args.componentName || "")
        .trim()
        .toLowerCase();
      if (!KNOWN_COMPONENTS.includes(componentName)) {
        throw new Error(`Unknown component: ${componentName}`);
      }

      const accessibility = await analyzeAccessibility(
        componentName,
        args.checkType
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                component: componentName,
                checkType: args.checkType,
                accessibility,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
  REMOVED in v2.0 */
}

/**
 * Analyze component dependencies
 * @param {string} componentName
 * @param {boolean} includeTransitive
 */
async function analyzeComponentDependencies(componentName, includeTransitive) {
  // Use the canonical dependency graph from the Spartan CLI
  const directDeps = COMPONENT_DEPENDENCIES[componentName] || [];

  const dependencies = {
    direct: directDeps.filter((d) => d !== "utils"),
    installCommand: `npx ng g @spartan-ng/cli:ui ${componentName}`,
    allRequired: directDeps,
  };

  // Add transitive dependencies if requested
  if (includeTransitive) {
    const transitive = new Set();
    const visited = new Set([componentName]);

    const collectDeps = (name) => {
      const deps = COMPONENT_DEPENDENCIES[name] || [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          visited.add(dep);
          if (dep !== "utils") transitive.add(dep);
          collectDeps(dep);
        }
      }
    };
    collectDeps(componentName);

    // Remove direct deps from transitive
    for (const d of directDeps) transitive.delete(d);
    dependencies.transitive = [...transitive];
  }

  return dependencies;
}

// Remaining helper functions removed in v2.0:
// - findRelatedComponents, analyzeComponentVariants, analyzeAccessibility
// - All helper functions for the above (getSimilarComponents, etc.)
// These were producing fake/hardcoded data. The dependency graph now comes
// from COMPONENT_DEPENDENCIES (canonical source: spartan-ng/cli).
