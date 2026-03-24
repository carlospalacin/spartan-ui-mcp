//@ts-check
import {
  KNOWN_COMPONENTS,
  KNOWN_BLOCKS,
  BLOCK_CATEGORIES,
  SPARTAN_COMPONENTS_BASE,
  SPARTAN_DOCS_BASE,
} from "./utils.js";

export function registerMetaTools(server) {
  server.registerTool(
    "spartan_meta",
    {
      title: "Spartan metadata",
      description:
        "Return known docs topics and components for client autocomplete.",
      inputSchema: {},
    },
    async () => {
      const topics = [
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
        "analog-dark-mode",
      ];
      const responseData = {
        topics: topics.map((t) => ({
          topic: t,
          url:
            t === "analog-dark-mode"
              ? "https://dev.to/this-is-angular/dark-mode-with-analog-tailwind-4049"
              : `${SPARTAN_DOCS_BASE}/${t}`,
        })),
        components: KNOWN_COMPONENTS.map((n) => ({
          name: n,
          url: `${SPARTAN_COMPONENTS_BASE}/${n}`,
        })),
        blocks: Object.entries(KNOWN_BLOCKS).map(([category, variants]) => ({
          category,
          variants,
          variantCount: variants.length,
        })),
        totalComponents: KNOWN_COMPONENTS.length,
        totalBlockVariants: Object.values(KNOWN_BLOCKS).flat().length,
        usage: {
          "spartan_docs_get": "Fetch documentation topics",
          "spartan_components_get":
            "Fetch component docs with extract='api' for structured Brain/Helm API data",
          "spartan_components_list": "List all available components",
          "spartan_components_source":
            "Fetch actual TypeScript source code from GitHub",
          "spartan_blocks_list": "List all building block categories and variants",
          "spartan_blocks_get": "Fetch block source code from GitHub",
        },
      };
      const responseText = JSON.stringify(responseData, null, 2);
      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    }
  );
}
