//@ts-check
import { z } from "zod";
import { KNOWN_COMPONENTS, COMPONENT_DEPENDENCIES } from "./utils.js";

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
            "Include transitive dependencies (dependencies of dependencies)",
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
            ", ",
          )}`,
        );
      }

      const dependencies = await analyzeComponentDependencies(
        componentName,
        args.includeTransitive,
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
              2,
            ),
          },
        ],
      };
    },
  );
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
