//@ts-check
import { z } from "zod";
import {
  KNOWN_COMPONENTS,
  SPARTAN_COMPONENTS_BASE,
  fetchSpartanAPI,
} from "./utils.js";

export function registerSearchTools(server) {
  // Full-text search across components using the Analog API data (instant, no scraping)
  server.registerTool(
    "spartan_search",
    {
      title: "Search across Spartan UI",
      description:
        "Search Spartan UI components by name, selector, directive name, or input/output property. " +
        "Uses the structured Analog API data — instant results, no web scraping. " +
        "Returns matching components with relevance scores. Use spartan_components_get " +
        "with extract='api' to get full details for any result.",
      inputSchema: {
        query: z
          .string()
          .min(1, "query is required")
          .describe(
            "Search query (e.g., 'date', 'dialog', 'BrnButton', 'hlmDialogClose', 'popover')"
          ),
        limit: z
          .number()
          .min(1)
          .max(20)
          .default(5)
          .describe("Maximum number of results to return (default: 5)."),
      },
    },
    async (args) => {
      const query = String(args.query || "").trim().toLowerCase();
      const limit = args.limit || 5;

      const api = await fetchSpartanAPI();
      const results = [];

      for (const componentName of KNOWN_COMPONENTS) {
        const docs = api.docsData[componentName];
        if (!docs) continue;

        let score = 0;
        const matches = [];

        // Match on component name
        if (componentName.includes(query)) {
          score += 100;
          matches.push(`component name: ${componentName}`);
        }

        // Search brain directives
        for (const [directiveName, info] of Object.entries(docs.brain || {})) {
          const lowerName = directiveName.toLowerCase();
          const lowerSelector = (info.selector || "").toLowerCase();

          if (lowerName.includes(query)) {
            score += 50;
            matches.push(`brain directive: ${directiveName}`);
          }
          if (lowerSelector.includes(query)) {
            score += 40;
            matches.push(`brain selector: ${info.selector}`);
          }

          // Search inputs/outputs
          for (const input of info.inputs || []) {
            if (input.name.toLowerCase().includes(query)) {
              score += 20;
              matches.push(`brain input: ${directiveName}.${input.name}`);
            }
          }
          for (const output of info.outputs || []) {
            if (output.name.toLowerCase().includes(query)) {
              score += 20;
              matches.push(`brain output: ${directiveName}.${output.name}`);
            }
          }
        }

        // Search helm directives
        for (const [directiveName, info] of Object.entries(docs.helm || {})) {
          const lowerName = directiveName.toLowerCase();
          const lowerSelector = (info.selector || "").toLowerCase();

          if (lowerName.includes(query)) {
            score += 50;
            matches.push(`helm directive: ${directiveName}`);
          }
          if (lowerSelector.includes(query)) {
            score += 40;
            matches.push(`helm selector: ${info.selector}`);
          }

          for (const input of info.inputs || []) {
            if (input.name.toLowerCase().includes(query)) {
              score += 20;
              matches.push(`helm input: ${directiveName}.${input.name}`);
            }
          }
          for (const output of info.outputs || []) {
            if (output.name.toLowerCase().includes(query)) {
              score += 20;
              matches.push(`helm output: ${directiveName}.${output.name}`);
            }
          }
        }

        if (score > 0) {
          results.push({
            component: componentName,
            url: `${SPARTAN_COMPONENTS_BASE}/${componentName}`,
            score,
            matches: matches.slice(0, 5), // Top 5 matches per component
            brainCount: Object.keys(docs.brain || {}).length,
            helmCount: Object.keys(docs.helm || {}).length,
          });
        }
      }

      // Sort by score descending, limit results
      results.sort((a, b) => b.score - a.score);
      const limited = results.slice(0, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query,
                resultCount: limited.length,
                totalMatches: results.length,
                results: limited,
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
