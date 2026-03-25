import ignore, { type Ignore } from 'ignore';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const DEFAULT_IGNORES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '__pycache__',
  '.pytest_cache',
  'target',
  'vendor',
  '.venv',
  'venv',
  'env',
  '.tox',
  '.mypy_cache',
  'coverage',
  '.nyc_output',
  '.turbo',
  '.vercel',
  '.expo',
  '.cache',
];

export async function createFilter(projectPath: string): Promise<Ignore> {
  const ig = ignore();
  ig.add(DEFAULT_IGNORES);

  const gitignorePath = join(projectPath, '.gitignore');
  if (existsSync(gitignorePath)) {
    const content = await readFile(gitignorePath, 'utf-8');
    ig.add(content);
  }

  return ig;
}
