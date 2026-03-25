#!/usr/bin/env node
//@ts-check

/**
 * End-to-end test for Spartan Ng MCP Server v1.0
 * Tests tools, resources, prompts via the MCP client protocol.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let passed = 0;
let failed = 0;

function ok(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`);
  }
}

console.log("🎯 SPARTAN NG MCP v1.0 — END-TO-END TEST\n");

const client = new Client(
  { name: "e2e-test", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } },
);

const transport = new StdioClientTransport({
  command: "node",
  args: ["server.js"],
});

await client.connect(transport);

try {
  // ── TOOLS ──────────────────────────────────────────────────────────────
  console.log("🔧 TOOLS\n");

  // Tool listing
  const tools = await client.listTools();
  ok("Tool count", tools.tools.length === 17, `got ${tools.tools.length}`);
  const toolNames = tools.tools.map((t) => t.name);
  console.log(`   Tools: ${toolNames.join(", ")}\n`);

  // spartan_components_list
  const listRes = await client.callTool({
    name: "spartan_components_list",
    arguments: {},
  });
  const listData = JSON.parse(/** @type {any} */ (listRes.content[0]).text);
  ok(
    "components_list",
    listData.totalComponents === 57,
    `${listData.totalComponents} components`,
  );

  // spartan_components_get (api — Analog API)
  const getRes = await client.callTool({
    name: "spartan_components_get",
    arguments: { name: "dialog" },
  });
  const getData = JSON.parse(/** @type {any} */ (getRes.content[0]).text);
  ok(
    "components_get dialog brain",
    getData.brainCount === 7,
    `brain=${getData.brainCount}`,
  );
  ok(
    "components_get dialog helm",
    getData.helmCount === 10,
    `helm=${getData.helmCount}`,
  );
  ok(
    "components_get dialog examples",
    getData.exampleCount >= 4,
    `examples=${getData.exampleCount}`,
  );
  ok(
    "components_get dialog selector",
    getData.brainAPI[0]?.selector?.length > 0,
    getData.brainAPI[0]?.selector,
  );

  // spartan_components_get — new component (sidebar)
  const sidebarRes = await client.callTool({
    name: "spartan_components_get",
    arguments: { name: "sidebar" },
  });
  const sidebarData = JSON.parse(
    /** @type {any} */ (sidebarRes.content[0]).text,
  );
  ok(
    "components_get sidebar",
    sidebarData.helmCount === 23,
    `helm=${sidebarData.helmCount}`,
  );

  // spartan_components_source (GitHub)
  const sourceRes = await client.callTool({
    name: "spartan_components_source",
    arguments: { name: "button", layer: "helm" },
  });
  const sourceData = JSON.parse(/** @type {any} */ (sourceRes.content[0]).text);
  ok(
    "components_source helm",
    sourceData.helm?.fileCount > 0,
    `${sourceData.helm?.fileCount} files`,
  );
  ok(
    "components_source has exports",
    sourceData.helm?.exports?.length > 0,
    `${sourceData.helm?.exports?.length} exports`,
  );

  // spartan_blocks_list
  const blocksListRes = await client.callTool({
    name: "spartan_blocks_list",
    arguments: {},
  });
  const blocksListData = JSON.parse(
    /** @type {any} */ (blocksListRes.content[0]).text,
  );
  ok(
    "blocks_list categories",
    blocksListData.totalCategories === 4,
    `${blocksListData.totalCategories} categories`,
  );
  ok(
    "blocks_list variants",
    blocksListData.totalVariants === 17,
    `${blocksListData.totalVariants} variants`,
  );

  // spartan_blocks_get
  const blockRes = await client.callTool({
    name: "spartan_blocks_get",
    arguments: { category: "login", variant: "login-simple-reactive-form" },
  });
  const blockData = JSON.parse(/** @type {any} */ (blockRes.content[0]).text);
  ok(
    "blocks_get login files",
    blockData.fileCount >= 1,
    `${blockData.fileCount} files`,
  );
  ok(
    "blocks_get has spartan imports",
    blockData.spartanImports?.length > 0,
    blockData.spartanImports?.join(", "),
  );

  // spartan_search
  const searchRes = await client.callTool({
    name: "spartan_search",
    arguments: { query: "dialog" },
  });
  const searchData = JSON.parse(/** @type {any} */ (searchRes.content[0]).text);
  ok(
    "search dialog",
    searchData.resultCount >= 2,
    `${searchData.resultCount} results`,
  );
  ok(
    "search has scores",
    searchData.results[0]?.score > 0,
    `top score=${searchData.results[0]?.score}`,
  );

  // spartan_components_dependencies
  const depsRes = await client.callTool({
    name: "spartan_components_dependencies",
    arguments: { componentName: "sidebar", includeTransitive: true },
  });
  const depsData = JSON.parse(/** @type {any} */ (depsRes.content[0]).text);
  ok(
    "dependencies sidebar direct",
    depsData.dependencies?.direct?.length >= 7,
    `${depsData.dependencies?.direct?.length} direct deps`,
  );
  ok(
    "dependencies install cmd",
    depsData.dependencies?.installCommand?.includes("sidebar"),
    depsData.dependencies?.installCommand,
  );

  // spartan_docs_get
  const docsRes = await client.callTool({
    name: "spartan_docs_get",
    arguments: { topic: "installation", format: "text" },
  });
  const docsText = /** @type {any} */ (docsRes.content[0]).text;
  ok(
    "docs_get installation",
    docsText.length > 500,
    `${docsText.length} chars`,
  );

  // spartan_meta
  const metaRes = await client.callTool({
    name: "spartan_meta",
    arguments: {},
  });
  const metaData = JSON.parse(/** @type {any} */ (metaRes.content[0]).text);
  ok(
    "meta components",
    metaData.totalComponents === 57,
    `${metaData.totalComponents}`,
  );
  ok(
    "meta blocks",
    metaData.totalBlockVariants === 17,
    `${metaData.totalBlockVariants}`,
  );
  ok(
    "meta has usage",
    Object.keys(metaData.usage).length >= 6,
    `${Object.keys(metaData.usage).length} usage entries`,
  );

  // ── RESOURCES ──────────────────────────────────────────────────────────
  console.log("\n📦 RESOURCES\n");

  const resources = await client.listResources();
  ok(
    "resource count",
    resources.resources.length >= 2,
    `${resources.resources.length} resources`,
  );

  // spartan://component/button/api (via Analog API now)
  const apiResource = await client.readResource({
    uri: "spartan://component/button/api",
  });
  const apiResData = JSON.parse(
    /** @type {any} */ (apiResource.contents[0]).text,
  );
  ok(
    "resource button/api brain",
    apiResData.brainCount >= 1,
    `brain=${apiResData.brainCount}`,
  );
  ok(
    "resource button/api helm",
    apiResData.helmCount >= 1,
    `helm=${apiResData.helmCount}`,
  );

  // spartan://component/dialog/examples
  const exResource = await client.readResource({
    uri: "spartan://component/dialog/examples",
  });
  const exResData = JSON.parse(
    /** @type {any} */ (exResource.contents[0]).text,
  );
  ok(
    "resource dialog/examples",
    exResData.totalExamples >= 4,
    `${exResData.totalExamples} examples`,
  );

  // spartan://component/sidebar/full
  const fullResource = await client.readResource({
    uri: "spartan://component/sidebar/full",
  });
  const fullResData = JSON.parse(
    /** @type {any} */ (fullResource.contents[0]).text,
  );
  ok(
    "resource sidebar/full",
    fullResData.helmCount === 23,
    `helm=${fullResData.helmCount}`,
  );
  ok(
    "resource sidebar/full has install",
    fullResData.installSnippets != null,
    "has install snippets",
  );

  // spartan://blocks/list
  const blocksResource = await client.readResource({
    uri: "spartan://blocks/list",
  });
  const blocksResData = JSON.parse(
    /** @type {any} */ (blocksResource.contents[0]).text,
  );
  ok(
    "resource blocks/list",
    blocksResData.totalVariants === 17,
    `${blocksResData.totalVariants} variants`,
  );

  // ── PROMPTS ────────────────────────────────────────────────────────────
  console.log("\n💬 PROMPTS\n");

  const prompts = await client.listPrompts();
  ok(
    "prompt count",
    prompts.prompts.length === 6,
    `${prompts.prompts.length} prompts`,
  );

  // spartan-get-started
  const startPrompt = await client.getPrompt({
    name: "spartan-get-started",
    arguments: { componentName: "button" },
  });
  const startText =
    /** @type {any} */ (startPrompt.messages[1]?.content).text || "";
  ok(
    "get-started has selector",
    startText.includes("[hlmBtn]") || startText.includes("hlmBtn"),
    "has Hlm selector",
  );
  ok(
    "get-started has CLI install",
    startText.includes("npx ng g @spartan-ng/cli:ui"),
    "correct install cmd",
  );

  // spartan-compare-apis
  const comparePrompt = await client.getPrompt({
    name: "spartan-compare-apis",
    arguments: { componentName: "dialog" },
  });
  const compareText =
    /** @type {any} */ (comparePrompt.messages[1]?.content).text || "";
  ok(
    "compare-apis has brain count",
    compareText.includes("7"),
    "brain count visible",
  );
  ok(
    "compare-apis has recommendation",
    compareText.includes("Recommendation"),
    "has recommendation",
  );

  // spartan-use-block
  const blockPrompt = await client.getPrompt({
    name: "spartan-use-block",
    arguments: { category: "sidebar" },
  });
  const blockText =
    /** @type {any} */ (blockPrompt.messages[1]?.content).text || "";
  ok(
    "use-block has variants",
    blockText.includes("sidebar-sticky-header"),
    "lists sidebar variants",
  );

  // ── SUMMARY ────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `✅ Passed: ${passed}  ❌ Failed: ${failed}  Total: ${passed + failed}`,
  );
  console.log(`${"=".repeat(60)}`);

  if (failed > 0) {
    console.log("\n⚠️  Some tests failed. Review output above.");
    process.exit(1);
  } else {
    console.log("\n🚀 All tests passed! MCP Server v1.0 is working correctly.");
  }
} catch (error) {
  const err = /** @type {Error} */ (error);
  console.error("\n💥 TEST CRASHED:", err.message);
  console.error(err.stack);
  process.exit(1);
} finally {
  await client.close();
}
