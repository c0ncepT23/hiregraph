import { readFile, readdir } from 'fs/promises';
import { join, extname, relative } from 'path';
import type { Ignore } from 'ignore';
import { createFilter } from '../utils/gitignore.js';
import type { AstAnalysisResult } from '../graph/schema.js';

// Regex-based AST analysis (no tree-sitter dependency for now — keeps install simple)
// Covers TypeScript, JavaScript, Python, Rust, Go via pattern matching on source text.
// A tree-sitter upgrade path exists if deeper analysis is needed later.

const MAX_FILES = 100;

const EMPTY_RESULT: AstAnalysisResult = {
  functions: 0,
  classes: 0,
  interfaces: 0,
  components: 0,
  hooks: 0,
  services: 0,
  max_nesting_depth: 0,
  avg_params_per_function: 0,
  imports_used: [],
  advanced_features: [],
};

interface FileAnalysis {
  functions: number;
  classes: number;
  interfaces: number;
  components: number;
  hooks: number;
  services: number;
  nestingDepth: number;
  paramCounts: number[];
  imports: string[];
  features: string[];
}

export async function analyzeAst(
  projectPath: string,
  languages: Record<string, { files: number; loc: number }>,
): Promise<AstAnalysisResult> {
  const ig = await createFilter(projectPath);
  const files = await collectSourceFiles(projectPath, projectPath, ig);

  // Sample if too many files
  const sampled = files.length > MAX_FILES
    ? files.sort(() => Math.random() - 0.5).slice(0, MAX_FILES)
    : files;

  const totals: FileAnalysis = {
    functions: 0, classes: 0, interfaces: 0, components: 0,
    hooks: 0, services: 0, nestingDepth: 0, paramCounts: [],
    imports: [], features: [],
  };

  for (const filePath of sampled) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const ext = extname(filePath).toLowerCase();
      const analysis = analyzeFile(content, ext);
      totals.functions += analysis.functions;
      totals.classes += analysis.classes;
      totals.interfaces += analysis.interfaces;
      totals.components += analysis.components;
      totals.hooks += analysis.hooks;
      totals.services += analysis.services;
      totals.nestingDepth = Math.max(totals.nestingDepth, analysis.nestingDepth);
      totals.paramCounts.push(...analysis.paramCounts);
      totals.imports.push(...analysis.imports);
      totals.features.push(...analysis.features);
    } catch { /* skip unreadable files */ }
  }

  const uniqueImports = [...new Set(totals.imports)];
  const uniqueFeatures = [...new Set(totals.features)];
  const avgParams = totals.paramCounts.length > 0
    ? Math.round((totals.paramCounts.reduce((a, b) => a + b, 0) / totals.paramCounts.length) * 100) / 100
    : 0;

  return {
    functions: totals.functions,
    classes: totals.classes,
    interfaces: totals.interfaces,
    components: totals.components,
    hooks: totals.hooks,
    services: totals.services,
    max_nesting_depth: totals.nestingDepth,
    avg_params_per_function: avgParams,
    imports_used: uniqueImports,
    advanced_features: uniqueFeatures,
  };
}

function analyzeFile(content: string, ext: string): FileAnalysis {
  const result: FileAnalysis = {
    functions: 0, classes: 0, interfaces: 0, components: 0,
    hooks: 0, services: 0, nestingDepth: 0, paramCounts: [],
    imports: [], features: [],
  };

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
    analyzeTypeScript(content, ext, result);
  } else if (ext === '.py') {
    analyzePython(content, result);
  } else if (ext === '.rs') {
    analyzeRust(content, result);
  } else if (ext === '.go') {
    analyzeGo(content, result);
  }

  return result;
}

function analyzeTypeScript(content: string, ext: string, result: FileAnalysis): void {
  // Functions
  const funcMatches = content.match(/(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\(|(?:async\s+)?(?:export\s+)?(?:default\s+)?function)/g);
  if (funcMatches) {
    result.functions += funcMatches.length;
    for (const m of funcMatches) {
      const params = m.match(/\(([^)]*)\)/);
      if (params && params[1]) {
        result.paramCounts.push(params[1].split(',').filter(p => p.trim()).length);
      }
    }
  }

  // Arrow functions in methods
  const arrowFuncs = content.match(/=>\s*{/g);
  if (arrowFuncs) result.functions += arrowFuncs.length;

  // Classes
  const classMatches = content.match(/\bclass\s+\w+/g);
  if (classMatches) result.classes += classMatches.length;

  // Interfaces and types
  const ifaceMatches = content.match(/\b(?:interface|type)\s+\w+/g);
  if (ifaceMatches) result.interfaces += ifaceMatches.length;

  // React components (function returning JSX in .tsx/.jsx)
  if (['.tsx', '.jsx'].includes(ext)) {
    const componentMatches = content.match(/(?:export\s+)?(?:default\s+)?function\s+[A-Z]\w*/g);
    if (componentMatches) result.components += componentMatches.length;
    const arrowComponents = content.match(/(?:const|export\s+const)\s+[A-Z]\w+\s*[=:]/g);
    if (arrowComponents) result.components += arrowComponents.length;
  }

  // Custom hooks
  const hookMatches = content.match(/(?:function|const)\s+use[A-Z]\w*/g);
  if (hookMatches) result.hooks += hookMatches.length;

  // Services
  const serviceMatches = content.match(/class\s+\w*(?:Service|Repository|Controller)\b/g);
  if (serviceMatches) result.services += serviceMatches.length;

  // Imports
  const importMatches = content.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g);
  for (const m of importMatches) {
    const pkg = m[1];
    if (!pkg.startsWith('.') && !pkg.startsWith('/')) {
      result.imports.push(pkg.split('/').slice(0, pkg.startsWith('@') ? 2 : 1).join('/'));
    }
  }

  // Advanced features
  if (content.match(/<\w+(?:\s+extends|\s*,)/)) result.features.push('generics');
  if (content.match(/\bkeyof\b|\bin\s+keyof\b/)) result.features.push('mapped-types');
  if (content.match(/\binfer\b/)) result.features.push('conditional-types');
  if (content.match(/@\w+/)) result.features.push('decorators');
  if (content.match(/\basync\s+/)) result.features.push('async-await');

  // Nesting depth
  result.nestingDepth = estimateNesting(content);
}

function analyzePython(content: string, result: FileAnalysis): void {
  const funcMatches = content.match(/\bdef\s+\w+/g);
  if (funcMatches) result.functions += funcMatches.length;

  const classMatches = content.match(/\bclass\s+\w+/g);
  if (classMatches) result.classes += classMatches.length;

  // Imports
  const importMatches = content.matchAll(/(?:from\s+(\S+)\s+import|import\s+(\S+))/g);
  for (const m of importMatches) {
    const pkg = (m[1] || m[2]).split('.')[0];
    if (pkg && !pkg.startsWith('.')) result.imports.push(pkg);
  }

  // Advanced features
  if (content.match(/@\w+/)) result.features.push('decorators');
  if (content.match(/@dataclass/)) result.features.push('dataclasses');
  if (content.match(/->\s*\w+|:\s*\w+\s*[=,)]/)) result.features.push('type-hints');
  if (content.match(/\basync\s+def\b/)) result.features.push('async-await');

  // Services
  const serviceMatches = content.match(/class\s+\w*(?:Service|Repository|Controller)\b/g);
  if (serviceMatches) result.services += serviceMatches.length;

  result.nestingDepth = estimateIndentNesting(content);
}

function analyzeRust(content: string, result: FileAnalysis): void {
  const fnMatches = content.match(/\bfn\s+\w+/g);
  if (fnMatches) result.functions += fnMatches.length;

  const structMatches = content.match(/\bstruct\s+\w+/g);
  if (structMatches) result.classes += structMatches.length;

  const traitMatches = content.match(/\btrait\s+\w+/g);
  if (traitMatches) result.interfaces += traitMatches.length;

  const implMatches = content.match(/\bimpl\b/g);
  if (implMatches) result.features.push('impl-blocks');

  // Imports
  const useMatches = content.matchAll(/use\s+(\w+)/g);
  for (const m of useMatches) {
    if (m[1] !== 'std' && m[1] !== 'self' && m[1] !== 'super' && m[1] !== 'crate') {
      result.imports.push(m[1]);
    }
  }

  if (content.match(/\basync\s+fn\b/)) result.features.push('async-await');
  if (content.match(/macro_rules!/)) result.features.push('macros');
  if (content.match(/<[^>]+>/)) result.features.push('generics');
  if (content.match(/\bunsafe\b/)) result.features.push('unsafe');

  result.nestingDepth = estimateNesting(content);
}

function analyzeGo(content: string, result: FileAnalysis): void {
  const funcMatches = content.match(/\bfunc\s+(?:\([^)]*\)\s*)?\w+/g);
  if (funcMatches) result.functions += funcMatches.length;

  const structMatches = content.match(/\btype\s+\w+\s+struct\b/g);
  if (structMatches) result.classes += structMatches.length;

  const ifaceMatches = content.match(/\btype\s+\w+\s+interface\b/g);
  if (ifaceMatches) result.interfaces += ifaceMatches.length;

  // Imports
  const importBlock = content.match(/import\s*\(([\s\S]*?)\)/);
  if (importBlock) {
    const imports = importBlock[1].matchAll(/"([^"]+)"/g);
    for (const m of imports) {
      const parts = m[1].split('/');
      result.imports.push(parts[parts.length - 1]);
    }
  }

  if (content.match(/\bgo\s+\w+/)) result.features.push('goroutines');
  if (content.match(/\bchan\b/)) result.features.push('channels');
  if (content.match(/\binterface\s*\{/)) result.features.push('interfaces');

  result.nestingDepth = estimateNesting(content);
}

function estimateNesting(content: string): number {
  let max = 0;
  let current = 0;
  for (const char of content) {
    if (char === '{') { current++; max = Math.max(max, current); }
    else if (char === '}') { current = Math.max(0, current - 1); }
  }
  return max;
}

function estimateIndentNesting(content: string): number {
  let max = 0;
  for (const line of content.split('\n')) {
    if (line.trim().length === 0) continue;
    const indent = line.match(/^(\s*)/);
    if (indent) {
      const level = Math.floor(indent[1].length / 4);
      max = Math.max(max, level);
    }
  }
  return max;
}

async function collectSourceFiles(
  basePath: string,
  currentPath: string,
  ig: Ignore,
): Promise<string[]> {
  const files: string[] = [];
  const codeExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.rs', '.go']);

  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(currentPath, entry.name);
    const relPath = relative(basePath, fullPath).replace(/\\/g, '/');

    if (ig.ignores(relPath)) continue;

    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(basePath, fullPath, ig));
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (codeExts.has(ext)) files.push(fullPath);
    }
  }

  return files;
}
