import { loadSubJson, saveSubJson, ensureSubDir } from '../storage/store.js';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { Recipe } from './types.js';

const RECIPES_DIR = 'recipes';

export async function loadRecipe(domain: string): Promise<Recipe | null> {
  return loadSubJson<Recipe>(RECIPES_DIR, `${domain}.json`);
}

export async function saveRecipe(domain: string, recipe: Recipe): Promise<void> {
  await saveSubJson(RECIPES_DIR, `${domain}.json`, recipe);
}

export async function listRecipes(): Promise<string[]> {
  await ensureSubDir(RECIPES_DIR);
  const dirPath = join(homedir(), '.hiregraph', RECIPES_DIR);
  try {
    const files = await readdir(dirPath);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

export async function updateRecipeStats(domain: string, success: boolean): Promise<void> {
  const recipe = await loadRecipe(domain);
  if (!recipe) return;
  if (success) recipe.metadata.success_count++;
  else recipe.metadata.failure_count++;
  recipe.metadata.last_validated_at = new Date().toISOString();
  await saveRecipe(domain, recipe);
}
