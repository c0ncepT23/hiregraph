import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { FileDiscoveryResult, QualitySignalsResult } from '../graph/schema.js';

const TEST_PATTERNS = [
  /\.test\.\w+$/, /\.spec\.\w+$/, /_test\.\w+$/,
  /\/__tests__\//, /\/tests?\//, /\/spec\//,
];

const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*["'][^"']{8,}["']/i,
  /AKIA[0-9A-Z]{16}/,
  /(?:secret|password|credential|token)\s*[:=]\s*["'][^"']{8,}["']/i,
  /ghp_[a-zA-Z0-9]{36}/,
  /sk-[a-zA-Z0-9]{20,}/,
];

const LINT_CONFIGS = [
  '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts',
  '.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js',
  'biome.json', 'biome.jsonc',
  'ruff.toml', '.flake8', 'mypy.ini',
  'clippy.toml', '.clippy.toml',
  '.golangci.yml', '.golangci.yaml',
];

export async function analyzeQualitySignals(
  projectPath: string,
  fileDiscovery: FileDiscoveryResult,
): Promise<QualitySignalsResult> {
  // Test ratio
  let testLoc = 0;
  let sourceLoc = 0;
  for (const [, stats] of Object.entries(fileDiscovery.languages)) {
    sourceLoc += stats.loc;
  }
  // Estimate test LOC from file discovery data — we'll use a heuristic based on the project
  // A more accurate version would track test files separately in file discovery
  testLoc = await estimateTestLoc(projectPath, fileDiscovery);
  const testRatio = sourceLoc > 0 ? Math.round((testLoc / sourceLoc) * 100) / 100 : 0;

  // Type safety
  const { typeSafety, typeSafetyDetails } = await checkTypeSafety(projectPath);

  // Secrets scan
  const { secretsClean, secretsFound } = await scanSecrets(projectPath);

  // Lint tools
  const lintTools: string[] = [];
  for (const config of LINT_CONFIGS) {
    if (existsSync(join(projectPath, config))) {
      const tool = config.includes('eslint') ? 'ESLint'
        : config.includes('prettier') ? 'Prettier'
        : config.includes('biome') ? 'Biome'
        : config.includes('ruff') ? 'Ruff'
        : config.includes('flake8') ? 'Flake8'
        : config.includes('mypy') ? 'mypy'
        : config.includes('clippy') ? 'Clippy'
        : config.includes('golangci') ? 'golangci-lint'
        : config;
      if (!lintTools.includes(tool)) lintTools.push(tool);
    }
  }

  // Complexity (simplified: count branching keywords per function)
  const complexityAvg = await estimateComplexity(projectPath, fileDiscovery);

  return {
    test_ratio: testRatio,
    complexity_avg: complexityAvg,
    type_safety: typeSafety,
    type_safety_details: typeSafetyDetails,
    secrets_clean: secretsClean,
    secrets_found: secretsFound,
    lint_tools: lintTools,
  };
}

async function estimateTestLoc(
  projectPath: string,
  fileDiscovery: FileDiscoveryResult,
): Promise<number> {
  // Rough estimate: count test files' LOC as a fraction of total
  // We'd need the full file list for precision, but we can estimate
  // by checking common test directories
  let testLoc = 0;
  const testDirs = ['__tests__', 'tests', 'test', 'spec'];

  for (const dir of testDirs) {
    if (existsSync(join(projectPath, dir))) {
      // Estimate ~20% of total LOC per test directory found
      testLoc += Math.round(fileDiscovery.total_loc * 0.05);
    }
  }

  // Also check for colocated test files
  if (fileDiscovery.config_files.some(f => f.includes('jest') || f.includes('vitest'))) {
    testLoc += Math.round(fileDiscovery.total_loc * 0.1);
  }

  return Math.min(testLoc, Math.round(fileDiscovery.total_loc * 0.5));
}

async function checkTypeSafety(projectPath: string): Promise<{ typeSafety: boolean; typeSafetyDetails: string }> {
  // TypeScript strict mode
  const tsconfigPath = join(projectPath, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    try {
      const content = await readFile(tsconfigPath, 'utf-8');
      const tsconfig = JSON.parse(content);
      if (tsconfig.compilerOptions?.strict === true) {
        return { typeSafety: true, typeSafetyDetails: 'TypeScript strict mode' };
      }
      return { typeSafety: false, typeSafetyDetails: 'TypeScript without strict mode' };
    } catch { /* skip */ }
  }

  // Python type checking
  if (existsSync(join(projectPath, 'mypy.ini')) ||
      existsSync(join(projectPath, 'pyrightconfig.json'))) {
    return { typeSafety: true, typeSafetyDetails: 'Python type checker configured' };
  }

  const pyprojectPath = join(projectPath, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    try {
      const content = await readFile(pyprojectPath, 'utf-8');
      if (content.includes('[tool.mypy]') || content.includes('[tool.pyright]')) {
        return { typeSafety: true, typeSafetyDetails: 'Python type checker configured' };
      }
    } catch { /* skip */ }
  }

  return { typeSafety: false, typeSafetyDetails: 'No type checking configured' };
}

async function scanSecrets(projectPath: string): Promise<{ secretsClean: boolean; secretsFound: number }> {
  let found = 0;
  // Check common files that might have secrets
  const filesToCheck = ['.env', '.env.local', '.env.production'];
  for (const file of filesToCheck) {
    const filePath = join(projectPath, file);
    if (existsSync(filePath)) {
      try {
        const content = await readFile(filePath, 'utf-8');
        for (const pattern of SECRET_PATTERNS) {
          const matches = content.match(pattern);
          if (matches) found += matches.length;
        }
      } catch { /* skip */ }
    }
  }

  return { secretsClean: found === 0, secretsFound: found };
}

async function estimateComplexity(
  projectPath: string,
  fileDiscovery: FileDiscoveryResult,
): Promise<number> {
  // Simplified cyclomatic complexity estimate
  // Count branching keywords relative to function count
  const branchKeywords = /\b(if|else|elif|switch|case|for|while|catch|except|&&|\|\||\?)\b/g;

  // Read a sample of source files
  const tsconfigExists = existsSync(join(projectPath, 'tsconfig.json'));
  const mainFile = tsconfigExists
    ? join(projectPath, 'src', 'index.ts')
    : join(projectPath, 'src', 'index.js');

  if (!existsSync(mainFile)) {
    // Default moderate complexity
    return 3.5;
  }

  try {
    const content = await readFile(mainFile, 'utf-8');
    const branches = (content.match(branchKeywords) || []).length;
    const functions = (content.match(/\b(function|def|fn|func)\b/g) || []).length || 1;
    return Math.round((branches / functions) * 10) / 10;
  } catch {
    return 3.5;
  }
}
