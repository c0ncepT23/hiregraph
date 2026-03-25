import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'fs';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  onSuccess: async () => {
    mkdirSync('dist/data', { recursive: true });
    copyFileSync('src/data/companies.json', 'dist/data/companies.json');
  },
});
