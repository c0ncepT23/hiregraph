import { homedir } from 'os';
import { join } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const HIREGRAPH_DIR = join(homedir(), '.hiregraph');

export async function ensureDir(): Promise<void> {
  if (!existsSync(HIREGRAPH_DIR)) {
    await mkdir(HIREGRAPH_DIR, { recursive: true });
  }
}

export function getPath(filename: string): string {
  return join(HIREGRAPH_DIR, filename);
}

export async function loadJson<T>(filename: string): Promise<T | null> {
  const filepath = getPath(filename);
  if (!existsSync(filepath)) return null;
  const raw = await readFile(filepath, 'utf-8');
  return JSON.parse(raw) as T;
}

export async function saveJson(filename: string, data: unknown): Promise<void> {
  await ensureDir();
  const filepath = getPath(filename);
  await writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function ensureSubDir(subdir: string): Promise<void> {
  const dirPath = join(HIREGRAPH_DIR, subdir);
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

export async function loadSubJson<T>(subdir: string, filename: string): Promise<T | null> {
  await ensureSubDir(subdir);
  const filepath = join(HIREGRAPH_DIR, subdir, filename);
  if (!existsSync(filepath)) return null;
  const raw = await readFile(filepath, 'utf-8');
  return JSON.parse(raw) as T;
}

export async function saveSubJson(subdir: string, filename: string, data: unknown): Promise<void> {
  await ensureSubDir(subdir);
  const filepath = join(HIREGRAPH_DIR, subdir, filename);
  await writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
}
