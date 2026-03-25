import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { DependencyResult } from '../graph/schema.js';

const FRAMEWORK_MAP: Record<string, string> = {
  // Frontend
  'react': 'React', 'react-dom': 'React', 'next': 'Next.js', 'vue': 'Vue',
  'nuxt': 'Nuxt', 'svelte': 'Svelte', '@sveltejs/kit': 'SvelteKit',
  'angular': 'Angular', '@angular/core': 'Angular', 'solid-js': 'Solid',
  'astro': 'Astro', 'gatsby': 'Gatsby', 'remix': 'Remix',
  // Mobile
  'react-native': 'React Native', 'expo': 'Expo', 'flutter': 'Flutter',
  // Backend
  'express': 'Express', 'fastify': 'Fastify', 'koa': 'Koa', 'hono': 'Hono',
  'nestjs': 'NestJS', '@nestjs/core': 'NestJS',
  // Database
  'prisma': 'Prisma', '@prisma/client': 'Prisma', 'drizzle-orm': 'Drizzle',
  'typeorm': 'TypeORM', 'sequelize': 'Sequelize', 'mongoose': 'Mongoose',
  '@supabase/supabase-js': 'Supabase', 'firebase': 'Firebase',
  // Python frameworks (from requirements.txt)
  'django': 'Django', 'flask': 'Flask', 'fastapi': 'FastAPI',
  'tornado': 'Tornado', 'starlette': 'Starlette',
  'sqlalchemy': 'SQLAlchemy', 'pandas': 'Pandas', 'numpy': 'NumPy',
  'tensorflow': 'TensorFlow', 'torch': 'PyTorch', 'pytorch': 'PyTorch',
  // Rust frameworks
  'actix-web': 'Actix', 'axum': 'Axum', 'rocket': 'Rocket', 'warp': 'Warp',
  'tokio': 'Tokio', 'serde': 'Serde',
  // Go frameworks
  'github.com/gin-gonic/gin': 'Gin', 'github.com/gofiber/fiber': 'Fiber',
  'github.com/labstack/echo': 'Echo',
  // AI/ML
  '@anthropic-ai/sdk': 'Anthropic SDK', 'openai': 'OpenAI',
  'langchain': 'LangChain', '@langchain/core': 'LangChain',
};

export async function analyzeDependencies(projectPath: string): Promise<DependencyResult> {
  const deps: string[] = [];
  const devDeps: string[] = [];
  const frameworks: Set<string> = new Set();
  let ecosystem = 'unknown';
  let hasLockfile = false;

  // Node.js
  const pkgPath = join(projectPath, 'package.json');
  if (existsSync(pkgPath)) {
    ecosystem = 'node';
    hasLockfile = existsSync(join(projectPath, 'package-lock.json')) ||
                  existsSync(join(projectPath, 'yarn.lock')) ||
                  existsSync(join(projectPath, 'pnpm-lock.yaml')) ||
                  existsSync(join(projectPath, 'bun.lockb'));
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
      if (pkg.dependencies) {
        for (const dep of Object.keys(pkg.dependencies)) {
          deps.push(dep);
          const fw = FRAMEWORK_MAP[dep];
          if (fw) frameworks.add(fw);
        }
      }
      if (pkg.devDependencies) {
        for (const dep of Object.keys(pkg.devDependencies)) {
          devDeps.push(dep);
          const fw = FRAMEWORK_MAP[dep];
          if (fw) frameworks.add(fw);
        }
      }
    } catch { /* skip malformed package.json */ }
  }

  // Python
  const reqPath = join(projectPath, 'requirements.txt');
  if (existsSync(reqPath)) {
    ecosystem = ecosystem === 'node' ? 'multi' : 'python';
    hasLockfile = hasLockfile || existsSync(join(projectPath, 'Pipfile.lock')) ||
                  existsSync(join(projectPath, 'poetry.lock'));
    try {
      const content = await readFile(reqPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
        const name = trimmed.split(/[=<>!~]/)[0].trim().toLowerCase();
        if (name) {
          deps.push(name);
          const fw = FRAMEWORK_MAP[name];
          if (fw) frameworks.add(fw);
        }
      }
    } catch { /* skip */ }
  }

  // pyproject.toml (basic parsing)
  const pyprojectPath = join(projectPath, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    ecosystem = ecosystem === 'unknown' ? 'python' : ecosystem === 'python' ? 'python' : 'multi';
    try {
      const content = await readFile(pyprojectPath, 'utf-8');
      const depMatches = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
      if (depMatches) {
        const items = depMatches[1].match(/"([^"]+)"/g);
        if (items) {
          for (const item of items) {
            const name = item.replace(/"/g, '').split(/[=<>!~]/)[0].trim().toLowerCase();
            if (name && !deps.includes(name)) {
              deps.push(name);
              const fw = FRAMEWORK_MAP[name];
              if (fw) frameworks.add(fw);
            }
          }
        }
      }
    } catch { /* skip */ }
  }

  // Rust
  const cargoPath = join(projectPath, 'Cargo.toml');
  if (existsSync(cargoPath)) {
    ecosystem = ecosystem === 'unknown' ? 'rust' : 'multi';
    hasLockfile = hasLockfile || existsSync(join(projectPath, 'Cargo.lock'));
    try {
      const content = await readFile(cargoPath, 'utf-8');
      const depSection = content.match(/\[dependencies\]([\s\S]*?)(?=\[|$)/);
      if (depSection) {
        for (const line of depSection[1].split('\n')) {
          const match = line.match(/^(\S+)\s*=/);
          if (match) {
            const name = match[1].trim();
            deps.push(name);
            const fw = FRAMEWORK_MAP[name];
            if (fw) frameworks.add(fw);
          }
        }
      }
      const devSection = content.match(/\[dev-dependencies\]([\s\S]*?)(?=\[|$)/);
      if (devSection) {
        for (const line of devSection[1].split('\n')) {
          const match = line.match(/^(\S+)\s*=/);
          if (match) devDeps.push(match[1].trim());
        }
      }
    } catch { /* skip */ }
  }

  // Go
  const goModPath = join(projectPath, 'go.mod');
  if (existsSync(goModPath)) {
    ecosystem = ecosystem === 'unknown' ? 'go' : 'multi';
    hasLockfile = hasLockfile || existsSync(join(projectPath, 'go.sum'));
    try {
      const content = await readFile(goModPath, 'utf-8');
      const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/);
      if (requireBlock) {
        for (const line of requireBlock[1].split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('//')) continue;
          const parts = trimmed.split(/\s+/);
          if (parts[0]) {
            deps.push(parts[0]);
            const fw = FRAMEWORK_MAP[parts[0]];
            if (fw) frameworks.add(fw);
          }
        }
      }
    } catch { /* skip */ }
  }

  return {
    ecosystem,
    dependencies: deps,
    dev_dependencies: devDeps,
    frameworks: [...frameworks],
    has_lockfile: hasLockfile,
  };
}
