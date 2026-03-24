// @ts-check

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  KNOWN_COMPONENTS,
  KNOWN_BLOCKS,
  BLOCK_CATEGORIES,
  SPARTAN_COMPONENTS_BASE,
  getComponentAPI,
} from "./utils.js";

/**
 * Register resource handlers for Spartan UI component data
 * Resources are read-only data sources that can be accessed by MCP clients
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 */
export function registerResourceHandlers(server) {
  // Component list resource
  server.resource(
    "Spartan UI Components List",
    "spartan://components/list",
    {
      description:
        "Complete list of all available Spartan UI components with URLs",
      mimeType: "application/json",
    },
    async () => {
      return {
        contents: [
          {
            uri: "spartan://components/list",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                components: KNOWN_COMPONENTS.map((name) => ({
                  name,
                  url: `${SPARTAN_COMPONENTS_BASE}/${name}`,
                  apiResource: `spartan://component/${name}/api`,
                  examplesResource: `spartan://component/${name}/examples`,
                  fullResource: `spartan://component/${name}/full`,
                })),
                totalComponents: KNOWN_COMPONENTS.length,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // API resources — uses Analog API for structured data
  const apiTemplate = new ResourceTemplate("spartan://component/{name}/api", {
    list: async () => ({
      resources: KNOWN_COMPONENTS.map((name) => ({
        uri: `spartan://component/${name}/api`,
        name: `${name} - API Documentation`,
        description: `Brain API and Helm API specifications for ${name} component`,
        mimeType: "application/json",
      })),
    }),
    complete: {},
  });

  server.resource(
    "Component API Documentation",
    apiTemplate,
    {
      description:
        "Brain API and Helm API specifications for Spartan UI components",
      mimeType: "application/json",
    },
    async (
      /** @type {URL} */ uri,
      /** @type {import("@modelcontextprotocol/sdk/shared/uriTemplate.js").Variables} */ variables
    ) => {
      const name = Array.isArray(variables.name)
        ? variables.name[0]
        : variables.name;

      if (!KNOWN_COMPONENTS.includes(name)) {
        throw new Error(`Unknown component: ${name}`);
      }

      const apiData = await getComponentAPI(name);
      if (!apiData) throw new Error(`No API data for component: ${name}`);

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                component: name,
                url: `${SPARTAN_COMPONENTS_BASE}/${name}`,
                brainAPI: apiData.brainAPI,
                helmAPI: apiData.helmAPI,
                brainCount: apiData.brainCount,
                helmCount: apiData.helmCount,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Examples resources — uses Analog API primitivesData
  const examplesTemplate = new ResourceTemplate(
    "spartan://component/{name}/examples",
    {
      list: async () => ({
        resources: KNOWN_COMPONENTS.map((name) => ({
          uri: `spartan://component/${name}/examples`,
          name: `${name} - Code Examples`,
          description: `Working code examples for ${name} component`,
          mimeType: "application/json",
        })),
      }),
      complete: {},
    }
  );

  server.resource(
    "Component Code Examples",
    examplesTemplate,
    {
      description: "Working code examples for Spartan UI components",
      mimeType: "application/json",
    },
    async (
      /** @type {URL} */ uri,
      /** @type {import("@modelcontextprotocol/sdk/shared/uriTemplate.js").Variables} */ variables
    ) => {
      const name = Array.isArray(variables.name)
        ? variables.name[0]
        : variables.name;

      if (!KNOWN_COMPONENTS.includes(name)) {
        throw new Error(`Unknown component: ${name}`);
      }

      const apiData = await getComponentAPI(name);

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                component: name,
                url: `${SPARTAN_COMPONENTS_BASE}/${name}`,
                examples: apiData?.examples || [],
                totalExamples: apiData?.exampleCount || 0,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Blocks list resource
  server.resource(
    "Spartan UI Blocks List",
    "spartan://blocks/list",
    {
      description:
        "Complete list of all Spartan UI building blocks organized by category",
      mimeType: "application/json",
    },
    async () => {
      const blocksData = Object.entries(KNOWN_BLOCKS).map(
        ([category, variants]) => ({
          category,
          variants: variants.map((v) => ({
            name: v,
            resource: `spartan://block/${category}/${v}`,
          })),
          variantCount: variants.length,
        })
      );

      return {
        contents: [
          {
            uri: "spartan://blocks/list",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                blocks: blocksData,
                totalCategories: blocksData.length,
                totalVariants: blocksData.reduce(
                  (sum, c) => sum + c.variantCount,
                  0
                ),
                categories: BLOCK_CATEGORIES,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Full documentation resources — uses Analog API for everything
  const fullTemplate = new ResourceTemplate("spartan://component/{name}/full", {
    list: async () => ({
      resources: KNOWN_COMPONENTS.map((name) => ({
        uri: `spartan://component/${name}/full`,
        name: `${name} - Complete Documentation`,
        description: `Complete documentation including API, examples, and metadata for ${name}`,
        mimeType: "application/json",
      })),
    }),
    complete: {},
  });

  server.resource(
    "Component Full Documentation",
    fullTemplate,
    {
      description:
        "Complete documentation including API, examples, and metadata",
      mimeType: "application/json",
    },
    async (
      /** @type {URL} */ uri,
      /** @type {import("@modelcontextprotocol/sdk/shared/uriTemplate.js").Variables} */ variables
    ) => {
      const name = Array.isArray(variables.name)
        ? variables.name[0]
        : variables.name;

      if (!KNOWN_COMPONENTS.includes(name)) {
        throw new Error(`Unknown component: ${name}`);
      }

      const apiData = await getComponentAPI(name);
      if (!apiData) throw new Error(`No API data for component: ${name}`);

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                component: name,
                url: `${SPARTAN_COMPONENTS_BASE}/${name}`,
                brainAPI: apiData.brainAPI,
                helmAPI: apiData.helmAPI,
                examples: apiData.examples,
                installSnippets: apiData.installSnippets,
                brainCount: apiData.brainCount,
                helmCount: apiData.helmCount,
                exampleCount: apiData.exampleCount,
                fetchedAt: new Date().toISOString(),
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
