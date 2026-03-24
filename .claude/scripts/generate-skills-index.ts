import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Interfaces ───────────────────────────────────────────────
interface SkillGroup {
  /** Relative path from .claude/ (e.g. "skills/aurora-cqrs") */
  relativePath: string;
  /** .md files found in this group */
  files: string[];
}

interface IndexResult {
  groups: SkillGroup[];
  totalSkills: number;
  totalCommands: number;
  totalAgents: number;
  totalFiles: number;
}

interface ProjectResult {
  /** Project directory name (e.g. "backend", "frontend", or "root") */
  name: string;
  /** Absolute path to the project directory */
  projectDir: string;
  /** Index generation result */
  stats: IndexResult;
}

interface ValidationWarning {
  path: string;
  message: string;
}

// ─── Constants ────────────────────────────────────────────────
// Script lives in .claude/scripts/, so __dirname/../.. = monorepo root
const MONOREPO_ROOT = path.resolve(__dirname, '..', '..');
const MARKER_START = '<!-- SKILLS-INDEX-START -->';
const MARKER_END = '<!-- SKILLS-INDEX-END -->';
const DEBOUNCE_MS = 500;

// ─── Project discovery ───────────────────────────────────────

/** Discover all projects in the monorepo that have both .claude/ and CLAUDE.md */
function discoverProjects(): { name: string; projectDir: string }[] {
  const projects: { name: string; projectDir: string }[] = [];

  // Root project
  const rootClaudeDir = path.join(MONOREPO_ROOT, '.claude');
  const rootClaudeMd = path.join(MONOREPO_ROOT, 'CLAUDE.md');
  if (fs.existsSync(rootClaudeDir) && fs.existsSync(rootClaudeMd)) {
    projects.push({ name: 'root', projectDir: MONOREPO_ROOT });
  }

  // Scan immediate subdirectories
  const entries = fs.readdirSync(MONOREPO_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const projectDir = path.join(MONOREPO_ROOT, entry.name);
    const claudeDir = path.join(projectDir, '.claude');
    const claudeMd = path.join(projectDir, 'CLAUDE.md');

    if (fs.existsSync(claudeDir) && fs.existsSync(claudeMd)) {
      projects.push({ name: entry.name, projectDir });
    }
  }

  return projects;
}

// ─── Scanning functions ───────────────────────────────────────

/** Recursively find .md files, ignoring logs/ and scripts/ */
function scanMdFiles(dir: string, baseDir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const rel = path.relative(baseDir, fullPath);

    // Skip logs and scripts directories
    if (rel.startsWith('logs') || rel.startsWith('scripts')) continue;

    if (entry.isDirectory()) {
      results.push(...scanMdFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(rel);
    }
  }
  return results;
}

/** Group files by category and subfolder */
function groupFiles(files: string[]): SkillGroup[] {
  const groupMap = new Map<string, string[]>();

  for (const file of files) {
    const parts = file.split(path.sep);

    let groupKey: string;
    if (parts[0] === 'skills' && parts.length > 2) {
      // skills/aurora-cqrs/SKILL.md → "skills/aurora-cqrs"
      groupKey = `${parts[0]}/${parts[1]}`;
    } else if (
      parts[0] === 'agents' &&
      parts.length > 2 &&
      parts[1] === 'assets'
    ) {
      // agents/assets/phone-patterns.md → "agents/assets"
      groupKey = 'agents/assets';
    } else {
      // commands/create-skill.md → "commands"
      // agents/aurora-schema-manager.md → "agents"
      groupKey = parts[0];
    }

    if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
    groupMap.get(groupKey)!.push(parts[parts.length - 1]);
  }

  // Sort groups: skills/* first, then the rest
  const sortedKeys = [...groupMap.keys()].sort((a, b) => {
    const catOrder = (k: string) => {
      if (k.startsWith('skills/')) return 0;
      if (k === 'commands') return 1;
      if (k.startsWith('agents')) return 2;
      return 3;
    };
    const diff = catOrder(a) - catOrder(b);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  return sortedKeys.map((key) => {
    const rawFiles = groupMap.get(key)!;
    // SKILL.md first, then alphabetical
    const sorted = rawFiles.sort((a, b) => {
      if (a === 'SKILL.md') return -1;
      if (b === 'SKILL.md') return 1;
      return a.localeCompare(b);
    });
    // Remove duplicates
    const unique = [...new Set(sorted)];
    return { relativePath: key, files: unique };
  });
}

/** Generate the full compressed index */
function generateIndex(groups: SkillGroup[]): string {
  const header =
    '[Project Skills Index]|root:.claude|IMPORTANT:Prefer retrieval-led reasoning over pre-training.Read SKILL.md first,then related files.';
  const lines = groups.map((g) => `|${g.relativePath}:{${g.files.join(',')}}`);
  return MARKER_START + '\n' + header + lines.join('') + '\n' + MARKER_END;
}

/** Compute statistics from grouped results */
function computeStats(groups: SkillGroup[]): IndexResult {
  let totalSkills = 0;
  let totalCommands = 0;
  let totalAgents = 0;
  let totalFiles = 0;

  for (const g of groups) {
    totalFiles += g.files.length;
    if (g.relativePath.startsWith('skills/')) totalSkills++;
    else if (g.relativePath === 'commands') totalCommands = g.files.length;
    else if (g.relativePath.startsWith('agents')) totalAgents++;
  }

  return { groups, totalSkills, totalCommands, totalAgents, totalFiles };
}

// ─── CLAUDE.md injection ──────────────────────────────────────

function injectIndex(claudeMdPath: string, index: string): void {
  let content: string;

  if (fs.existsSync(claudeMdPath)) {
    content = fs.readFileSync(claudeMdPath, 'utf-8');
  } else {
    content = '';
  }

  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace between markers
    content =
      content.substring(0, startIdx) +
      index +
      content.substring(endIdx + MARKER_END.length);
  } else {
    // Append at end
    content = content.trimEnd() + '\n\n' + index + '\n';
  }

  fs.writeFileSync(claudeMdPath, content, 'utf-8');
}

// ─── Validation ───────────────────────────────────────────────

function validate(groups: SkillGroup[]): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  for (const g of groups) {
    if (!g.relativePath.startsWith('skills/')) continue;

    if (!g.files.includes('SKILL.md')) {
      warnings.push({
        path: g.relativePath,
        message: 'SKILL.md not found',
      });
    } else if (g.files.length === 1) {
      warnings.push({
        path: g.relativePath,
        message: 'only contains SKILL.md (consider adding more docs)',
      });
    }
  }

  return warnings;
}

// ─── Watch mode ───────────────────────────────────────────────

function watchMode(verbose: boolean): void {
  console.log('👀 Watching for changes in all .claude/ directories...');

  let timeout: NodeJS.Timeout | null = null;

  const regenerate = (event?: string, filename?: string) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      const timestamp = new Date().toLocaleTimeString('en-US', {
        hour12: false,
      });
      if (filename) {
        console.log(`[${timestamp}] Change detected: ${filename}`);
      }
      const results = runAll(false, false, verbose);
      for (const r of results) {
        console.log(
          `[${timestamp}] ✓ ${r.name}: ${r.stats.totalSkills} skills, ${r.stats.totalCommands} commands, ${r.stats.totalAgents} agents`,
        );
      }
    }, DEBOUNCE_MS);
  };

  // Watch all .claude directories
  const projects = discoverProjects();
  for (const project of projects) {
    const claudeDir = path.join(project.projectDir, '.claude');
    try {
      fs.watch(claudeDir, { recursive: true }, (event, filename) => {
        if (filename?.endsWith('.md')) {
          regenerate(event, `${project.name}/${filename}`);
        }
      });
    } catch {
      // Directory might not support recursive watch
    }
  }

  if (verbose) {
    console.log(
      `  Watching ${projects.length} project(s): ${projects.map((p) => p.name).join(', ')}`,
    );
  }

  // Clean Ctrl+C exit
  process.on('SIGINT', () => {
    console.log('\n✓ Watch stopped');
    process.exit(0);
  });
}

// ─── Single project run ──────────────────────────────────────

function runProject(
  project: { name: string; projectDir: string },
  dryRun: boolean,
  validateFlag: boolean,
  verbose: boolean,
): ProjectResult {
  const claudeDir = path.join(project.projectDir, '.claude');
  const claudeMd = path.join(project.projectDir, 'CLAUDE.md');

  const files = scanMdFiles(claudeDir, claudeDir);
  const groups = groupFiles(files);
  const stats = computeStats(groups);
  const index = generateIndex(groups);

  if (verbose) {
    console.log(`\n  [${project.name}]`);
    console.log(`    .claude dir: ${claudeDir}`);
    console.log(`    .md files found: ${files.length}`);
    console.log(`    Groups generated: ${groups.length}`);
    for (const g of groups) {
      console.log(`      ${g.relativePath}: ${g.files.join(', ')}`);
    }
  }

  if (validateFlag) {
    const warnings = validate(groups);
    for (const g of groups) {
      if (g.relativePath.startsWith('skills/')) {
        const w = warnings.find((w) => w.path === g.relativePath);
        if (w) {
          console.log(`  ⚠ [${project.name}] ${g.relativePath}: ${w.message}`);
        } else {
          console.log(
            `  ✓ [${project.name}] ${g.relativePath}: SKILL.md found (${g.files.length} files)`,
          );
        }
      }
    }
  }

  if (dryRun) {
    console.log(`[dry-run] [${project.name}] Index generated (not written):`);
    console.log(index);
  } else {
    injectIndex(claudeMd, index);
  }

  return { name: project.name, projectDir: project.projectDir, stats };
}

// ─── Main execution ───────────────────────────────────────────

function runAll(
  dryRun: boolean,
  validateFlag: boolean,
  verbose: boolean,
): ProjectResult[] {
  const projects = discoverProjects();
  const results: ProjectResult[] = [];

  for (const project of projects) {
    results.push(runProject(project, dryRun, validateFlag, verbose));
  }

  if (!dryRun && !validateFlag) {
    for (const r of results) {
      console.log(
        `✓ ${r.name}: ${r.stats.totalSkills} skills, ${r.stats.totalCommands} commands, ${r.stats.totalAgents} agents`,
      );
    }
    console.log(`✓ ${results.length} CLAUDE.md files updated`);
  }

  return results;
}

// ─── CLI ──────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    console.log(`
Usage: npx tsx .claude/scripts/generate-skills-index.ts [options]

Scans all project directories in the monorepo that have a .claude/ directory
and a CLAUDE.md file. For each one, generates a skills index from its .claude/
contents and injects it into its CLAUDE.md between the marker comments.

Flags:
  --dry-run     Show index in console without writing to CLAUDE.md
  --watch       Watch all .claude/ dirs for changes and regenerate automatically
  --validate    Verify each skill has SKILL.md, report warnings
  --verbose     Show detailed process information
  --help        Show help

Examples:
  npx tsx .claude/scripts/generate-skills-index.ts --dry-run --validate
  npx tsx .claude/scripts/generate-skills-index.ts --watch --verbose
`);
    return;
  }

  const dryRun = args.includes('--dry-run');
  const validateFlag = args.includes('--validate');
  const verbose = args.includes('--verbose');
  const watch = args.includes('--watch');

  // Initial run
  runAll(dryRun, validateFlag, verbose);

  // Watch mode
  if (watch) {
    watchMode(verbose);
  }
}

main();
