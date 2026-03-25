import { readdir, readFile } from 'fs/promises';
import { join, extname, relative } from 'path';
import type { Ignore } from 'ignore';
import { createFilter } from '../utils/gitignore.js';
import { getLanguage, shouldSkip } from '../utils/language-map.js';
import type { FileDiscoveryResult } from '../graph/schema.js';

const CONFIG_PATTERNS = [
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.github', '.gitlab-ci.yml', '.circleci',
  'tsconfig.json', 'jest.config', 'vitest.config', 'vite.config',
  '.eslintrc', '.prettierrc', 'prettier.config',
  'biome.json', 'ruff.toml', '.flake8',
  'Makefile', 'Procfile', 'vercel.json', 'netlify.toml',
  'turbo.json', 'lerna.json',
];

interface FileInfo {
  relativePath: string;
  language: string;
  loc: number;
}

export async function analyzeFileDiscovery(projectPath: string): Promise<FileDiscoveryResult> {
  const ig = await createFilter(projectPath);
  const files: FileInfo[] = [];
  const configFiles: string[] = [];

  await walkDir(projectPath, projectPath, ig, files, configFiles);

  const languages: Record<string, { files: number; loc: number }> = {};
  let totalLoc = 0;

  for (const file of files) {
    if (!languages[file.language]) {
      languages[file.language] = { files: 0, loc: 0 };
    }
    languages[file.language].files++;
    languages[file.language].loc += file.loc;
    totalLoc += file.loc;
  }

  let primaryLanguage = '';
  let maxLoc = 0;
  for (const [lang, stats] of Object.entries(languages)) {
    if (stats.loc > maxLoc) {
      maxLoc = stats.loc;
      primaryLanguage = lang;
    }
  }

  return {
    total_files: files.length,
    total_loc: totalLoc,
    languages,
    config_files: configFiles,
    primary_language: primaryLanguage,
  };
}

async function walkDir(
  basePath: string,
  currentPath: string,
  ig: Ignore,
  files: FileInfo[],
  configFiles: string[],
): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(currentPath, entry.name);
    const relPath = relative(basePath, fullPath).replace(/\\/g, '/');

    if (ig.ignores(relPath)) continue;

    if (entry.isDirectory()) {
      // Check for config directories
      if (CONFIG_PATTERNS.some(p => entry.name === p || entry.name.startsWith(p))) {
        configFiles.push(entry.name);
      }
      await walkDir(basePath, fullPath, ig, files, configFiles);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();

      // Check for config files
      if (CONFIG_PATTERNS.some(p => entry.name === p || entry.name.startsWith(p))) {
        configFiles.push(entry.name);
      }

      if (shouldSkip(ext)) continue;

      const language = getLanguage(ext);
      if (!language) continue;

      try {
        const content = await readFile(fullPath, 'utf-8');
        const loc = countLines(content);
        files.push({ relativePath: relPath, language, loc });
      } catch {
        // Skip files that can't be read
      }
    }
  }
}

function countLines(content: string): number {
  const lines = content.split('\n');
  let count = 0;
  for (const line of lines) {
    if (line.trim().length > 0) count++;
  }
  return count;
}
