// @ts-check

import { z } from "zod";
import {
  KNOWN_COMPONENTS,
  KNOWN_BLOCKS,
  BLOCK_CATEGORIES,
  SPARTAN_COMPONENTS_BASE,
  getComponentAPI,
} from "./utils.js";

/**
 * Register prompt handlers for Spartan UI
 * Prompts are pre-defined templates for AI interactions
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 */
export function registerPromptHandlers(server) {
  // Prompt 1: Get started with a component
  server.prompt(
    "spartan-get-started",
    "Get started with a Spartan UI component",
    {
      componentName: z
        .string()
        .describe(
          "Name of the Spartan UI component (e.g., 'button', 'calendar')"
        ),
      variant: z
        .enum(["brain", "helm"])
        .optional()
        .describe("Which API to use: 'brain' (unstyled) or 'helm' (styled)"),
    },
    async (args) => {
      const componentName = args.componentName.toLowerCase();
      const variant = args.variant?.toLowerCase() || "helm";

      if (!KNOWN_COMPONENTS.includes(componentName)) {
        throw new Error(
          `Unknown component: ${componentName}. Available: ${KNOWN_COMPONENTS.slice(0, 5).join(", ")}...`
        );
      }

      const componentUrl = `${SPARTAN_COMPONENTS_BASE}/${componentName}`;
      const apiData = await getComponentAPI(componentName);
      const relevantAPI = apiData
        ? variant === "brain" ? apiData.brainAPI : apiData.helmAPI
        : [];
      const firstExample = apiData?.examples?.[0]?.code || "// Use spartan_components_source to get full source code";

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Help me get started with the Spartan UI ${componentName} component using the ${variant.toUpperCase()} API.`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: `# Getting Started with Spartan UI ${componentName.toUpperCase()}

## Overview
The **${componentName}** component is available at: ${componentUrl}

## ${variant.toUpperCase()} API
${
  relevantAPI.length > 0
    ? `
This component has ${relevantAPI.length} ${variant} API directive(s):

${relevantAPI
  .map(
    (comp, i) => `
### ${i + 1}. ${comp.name}
**Selector**: \`${comp.selector}\`
**Source**: \`${comp.file}\`

${comp.inputs.length > 0 ? `**Inputs**:
${comp.inputs
  .map((input) => `- \`${input.name}\`: \`${input.type}\`${input.defaultValue ? ` = ${input.defaultValue}` : ""}${input.required ? " (required)" : ""}${input.description ? ` — ${input.description}` : ""}`)
  .join("\n")}` : ""}

${comp.outputs.length > 0 ? `**Outputs**:
${comp.outputs.map((output) => `- \`${output.name}\`: \`${output.type}\``).join("\n")}` : ""}

${comp.models.length > 0 ? `**Models (two-way binding)**:
${comp.models.map((m) => `- \`${m.name}\`: \`${m.type}\``).join("\n")}` : ""}
`
  )
  .join("\n")}
`
    : `No ${variant} API directives found for this component. Try the other layer.`
}

## Quick Start Example

\`\`\`typescript
${firstExample}
\`\`\`

## Installation

\`\`\`bash
npx ng g @spartan-ng/cli:ui ${componentName}
\`\`\`

## Next Steps
1. The CLI generator adds all required imports and dependencies
2. Use the selector in your template
3. Configure inputs as needed
4. Check the documentation for more examples: ${componentUrl}
`,
            },
          },
        ],
      };
    }
  );

  // Prompt 2: Compare Brain vs Helm API
  server.prompt(
    "spartan-compare-apis",
    "Compare Brain API vs Helm API for a component",
    {
      componentName: z
        .string()
        .describe("Name of the Spartan UI component to compare"),
    },
    async (args) => {
      const componentName = args.componentName.toLowerCase();

      if (!KNOWN_COMPONENTS.includes(componentName)) {
        throw new Error(`Unknown component: ${componentName}`);
      }

      const componentUrl = `${SPARTAN_COMPONENTS_BASE}/${componentName}`;
      const apiData = (await getComponentAPI(componentName)) || {
        brainAPI: [], helmAPI: [], brainCount: 0, helmCount: 0, examples: [],
      };

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Compare the Brain API and Helm API for the ${componentName} component. When should I use each?`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: `# Brain API vs Helm API: ${componentName.toUpperCase()}

## 🧠 Brain API (Unstyled, Accessible Primitives)
${
  apiData.brainAPI.length > 0
    ? `
**Available Components**: ${apiData.brainAPI.length}

${apiData.brainAPI
  .map(
    (comp) => `### ${comp.name}
- **Purpose**: Low-level, unstyled, accessible foundation
- **Inputs**: ${comp.inputs.length}
- **Outputs**: ${comp.outputs.length}
`
  )
  .join("\n")}

**Use Brain API when:**
- ✅ You want complete styling control
- ✅ You're building a custom design system
- ✅ You need maximum flexibility
- ✅ You want to understand the underlying behavior
`
    : "No Brain API components available."
}

## ⚡ Helm API (Pre-styled Components)
${
  apiData.helmAPI.length > 0
    ? `
**Available Components**: ${apiData.helmAPI.length}

${apiData.helmAPI
  .map(
    (comp) => `### ${comp.name}
- **Purpose**: Pre-styled, ready-to-use components
- **Inputs**: ${comp.inputs.length}
- **Outputs**: ${comp.outputs.length}
- **Key Props**: ${comp.inputs
      .slice(0, 3)
      .map((i) => i.name)
      .join(", ")}
`
  )
  .join("\n")}

**Use Helm API when:**
- ✅ You want to get started quickly
- ✅ You're okay with Tailwind CSS styling
- ✅ You want production-ready components
- ✅ You need less customization
`
    : "No Helm API components available."
}

## 📊 Summary
| Aspect | Brain API | Helm API |
|--------|-----------|----------|
| Styling | Unstyled | Tailwind CSS |
| Complexity | Higher | Lower |
| Flexibility | Maximum | Moderate |
| Time to Production | Longer | Faster |
| Components | ${apiData.brainAPI.length} | ${apiData.helmAPI.length} |

## 💡 Recommendation
${
  apiData.helmAPI.length > 0
    ? "Start with **Helm API** for rapid development. Switch to Brain API only if you need custom styling."
    : "Use **Brain API** as it's the only option for this component."
}

More details: ${componentUrl}
`,
            },
          },
        ],
      };
    }
  );

  // Prompt 3: Implement a feature with component
  server.prompt(
    "spartan-implement-feature",
    "Get help implementing a specific feature with a Spartan UI component",
    {
      componentName: z.string().describe("Spartan UI component to use"),
      feature: z
        .string()
        .describe(
          "Feature to implement (e.g., 'form validation', 'multi-select', 'date range')"
        ),
      framework: z
        .string()
        .optional()
        .describe(
          "Framework context (e.g., 'standalone', 'NgModule', 'with Signals')"
        ),
    },
    async (args) => {
      const componentName = args.componentName.toLowerCase();
      const feature = args.feature;
      const framework = args.framework || "standalone";

      if (!KNOWN_COMPONENTS.includes(componentName)) {
        throw new Error(`Unknown component: ${componentName}`);
      }

      const componentUrl = `${SPARTAN_COMPONENTS_BASE}/${componentName}`;
      const apiData = await getComponentAPI(componentName);

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I want to implement ${feature} using the Spartan UI ${componentName} component in a ${framework} Angular application. Can you help me?`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: `# Implementing "${feature}" with Spartan UI ${componentName}

## Component Overview
**Documentation**: ${componentUrl}
**Available APIs**: ${apiData?.brainCount || 0} Brain + ${apiData?.helmCount || 0} Helm

## Relevant Component Properties
${
  apiData?.helmAPI?.length > 0
    ? `
### Helm API (${apiData.helmAPI[0].name})
**Selector**: \`${apiData.helmAPI[0].selector}\`

${apiData.helmAPI[0].inputs.length > 0 ? `**Inputs you can use**:
${apiData.helmAPI[0].inputs
  .map((input) => `- \`${input.name}\`: \`${input.type}\`${input.description ? ` — ${input.description}` : ""}`)
  .join("\n")}` : "No configurable inputs."}

${apiData.helmAPI[0].outputs.length > 0 ? `**Events you can listen to**:
${apiData.helmAPI[0].outputs
  .map((output) => `- \`${output.name}\`: \`${output.type}\``)
  .join("\n")}` : ""}
`
    : ""
}

## Example Implementation (${framework})

\`\`\`typescript
${apiData?.examples?.[0]?.code || "// Use spartan_components_source for full source code examples"}
\`\`\`

## Implementation Steps

1. **Install the component** (adds all dependencies automatically):
   \`\`\`bash
   npx ng g @spartan-ng/cli:ui ${componentName}
   \`\`\`

2. **Import in your component**:
   Use the directives/components shown in the API section above

3. **Configure for "${feature}"**:
   - Use relevant inputs from the API table
   - Wire up event handlers if needed

4. **Style and customize**:
   - Use Tailwind classes for styling
   - Check ${apiData?.exampleCount || 0} available examples at ${componentUrl}

Need more help? Use \`spartan_components_source\` for full TypeScript source code.
`,
            },
          },
        ],
      };
    }
  );

  // Prompt 4: Troubleshoot component issues
  server.prompt(
    "spartan-troubleshoot",
    "Get help troubleshooting issues with a Spartan UI component",
    {
      componentName: z.string().describe("Component you're having issues with"),
      issue: z.string().describe("Description of the problem"),
    },
    async (args) => {
      const componentName = args.componentName.toLowerCase();
      const issue = args.issue;

      if (!KNOWN_COMPONENTS.includes(componentName)) {
        throw new Error(`Unknown component: ${componentName}`);
      }

      const componentUrl = `${SPARTAN_COMPONENTS_BASE}/${componentName}`;
      const apiData = await getComponentAPI(componentName);

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I'm having trouble with the Spartan UI ${componentName} component. Issue: ${issue}`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: `# Troubleshooting Spartan UI ${componentName.toUpperCase()}

## Your Issue
> ${issue}

## Common Issues & Solutions

### 1. ✅ Install/Reinstall the Component
The Spartan CLI handles all imports and dependencies:
\`\`\`bash
npx ng g @spartan-ng/cli:ui ${componentName}
\`\`\`

### 2. ✅ Verify Required Props
${
  apiData?.helmAPI?.length > 0
    ? `
Check if you're missing required inputs for **${apiData.helmAPI[0].name}** (\`${apiData.helmAPI[0].selector}\`):
${
  apiData.helmAPI[0].inputs
    .filter((i) => i.required)
    .map((input) => `- \`${input.name}\`: \`${input.type}\` (required)`)
    .join("\n") || "No required inputs found."
}
`
    : ""
}

### 3. ✅ Check Angular Version
Spartan UI requires Angular 17+ with standalone components support.

### 4. ✅ Review API Documentation
**Brain directives**: ${apiData?.brainCount || 0}
**Helm directives**: ${apiData?.helmCount || 0}
**Full docs**: ${componentUrl}

${
  apiData?.helmAPI?.length > 0
    ? `
## Available Inputs for ${apiData.helmAPI[0].name}
${apiData.helmAPI[0].inputs
  .map((input) => `- \`${input.name}\`: \`${input.type}\`${input.defaultValue ? ` = ${input.defaultValue}` : ""}`)
  .join("\n") || "No inputs."}
`
    : ""
}

## Next Steps
1. Compare your code with examples: ${componentUrl}
2. Check browser console for errors
3. Use \`spartan_components_source\` with layer='helm' to see the actual source code
4. Check if the issue is styling-related (try Brain API to isolate)
`,
            },
          },
        ],
      };
    }
  );

  // Prompt 5: List all available components
  server.prompt(
    "spartan-list-components",
    "List all available Spartan UI components with their categories",
    async () => {
      // Group components by category
      const categories = {
        "Form Controls": [
          "button",
          "button-group",
          "checkbox",
          "field",
          "form-field",
          "input",
          "input-group",
          "input-otp",
          "label",
          "native-select",
          "radio-group",
          "select",
          "slider",
          "switch",
          "textarea",
          "toggle",
          "toggle-group",
        ],
        "Data Display": [
          "table",
          "data-table",
          "card",
          "badge",
          "avatar",
          "empty",
          "item",
          "kbd",
          "separator",
          "progress",
          "skeleton",
          "spinner",
        ],
        Navigation: [
          "breadcrumb",
          "menubar",
          "navigation-menu",
          "pagination",
          "sidebar",
          "tabs",
          "command",
        ],
        Feedback: [
          "alert",
          "alert-dialog",
          "dialog",
          "sonner",
          "tooltip",
          "hover-card",
        ],
        Overlay: ["popover", "dropdown-menu", "context-menu", "sheet"],
        Layout: [
          "aspect-ratio",
          "resizable",
          "scroll-area",
          "collapsible",
          "accordion",
          "carousel",
        ],
        "Date & Time": ["calendar", "date-picker"],
        Advanced: ["autocomplete", "combobox", "icon"],
      };

      const categorizedList = Object.entries(categories)
        .map(([category, components]) => {
          const availableComponents = components.filter((c) =>
            KNOWN_COMPONENTS.includes(c)
          );
          return `## ${category} (${availableComponents.length})
${availableComponents
  .map((c) => `- **${c}**: \`spartan://component/${c}/api\``)
  .join("\n")}`;
        })
        .join("\n\n");

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Show me all available Spartan UI components organized by category.",
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: `# Spartan UI Component Library

**Total Components**: ${KNOWN_COMPONENTS.length}
**Total Block Variants**: ${Object.values(KNOWN_BLOCKS).flat().length}
**Documentation**: https://www.spartan.ng

${categorizedList}

## Building Blocks (Page-Level Templates)
${Object.entries(KNOWN_BLOCKS)
  .map(
    ([cat, variants]) =>
      `### ${cat.charAt(0).toUpperCase() + cat.slice(1)} (${variants.length} variants)
${variants.map((v) => `- **${v}**`).join("\n")}`
  )
  .join("\n\n")}

## How to Use
- **Components**: \`spartan_components_get\` for docs, \`spartan_components_source\` for source
- **Blocks**: \`spartan_blocks_get\` for full source code
- **Prompts**: \`spartan-get-started\`, \`spartan-compare-apis\`, \`spartan-use-block\`
`,
            },
          },
        ],
      };
    }
  );

  // Prompt 6: Use a building block
  server.prompt(
    "spartan-use-block",
    "Get help using a Spartan UI building block in your project",
    {
      category: z
        .string()
        .describe("Block category: sidebar, login, signup, or calendar"),
      variant: z
        .string()
        .optional()
        .describe(
          "Specific variant (e.g., 'sidebar-sticky-header'). Omit to see all variants."
        ),
    },
    async (args) => {
      const category = args.category.toLowerCase();
      const variants = KNOWN_BLOCKS[category];

      if (!variants) {
        throw new Error(
          `Unknown block category: ${category}. Available: ${BLOCK_CATEGORIES.join(", ")}`
        );
      }

      const variant = args.variant || variants[0];
      if (!variants.includes(variant)) {
        throw new Error(
          `Unknown variant: ${variant}. Available in ${category}: ${variants.join(", ")}`
        );
      }

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Help me use the Spartan UI ${category} block (variant: ${variant}) in my Angular project.`,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: `# Using Spartan UI Block: ${category}/${variant}

## What are Blocks?
Blocks are **page-level building blocks** — complete Angular components that combine multiple Spartan UI components into production-ready layouts. Unlike individual components, blocks give you entire page sections.

## Available Variants in "${category}"
${variants.map((v, i) => `${i + 1}. **${v}**`).join("\n")}

## Getting the Source Code
Use the \`spartan_blocks_get\` tool to fetch the complete source:

\`\`\`
Tool: spartan_blocks_get
  category: "${category}"
  variant: "${variant}"
  includeShared: true
\`\`\`

This returns the full TypeScript component code with template, imports, and logic.

## Integration Steps
1. **Fetch the block source** using \`spartan_blocks_get\`
2. **Install required Spartan components** based on the \`spartanImports\` in the response
3. **Copy and adapt** the component code to your project
4. **Customize** the template, data, and styling to match your needs

## Tips
- Blocks use **Reactive Forms** for login/signup variants
- Sidebar blocks use shared nav components — set \`includeShared: true\`
- Calendar blocks showcase advanced date picking patterns
- All blocks use Tailwind CSS for styling
`,
            },
          },
        ],
      };
    }
  );
}
