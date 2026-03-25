const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.swift': 'Swift',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.c': 'C',
  '.h': 'C',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.cxx': 'C++',
  '.hpp': 'C++',
  '.cs': 'C#',
  '.dart': 'Dart',
  '.lua': 'Lua',
  '.r': 'R',
  '.R': 'R',
  '.scala': 'Scala',
  '.ex': 'Elixir',
  '.exs': 'Elixir',
  '.erl': 'Erlang',
  '.hs': 'Haskell',
  '.clj': 'Clojure',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.sol': 'Solidity',
  '.zig': 'Zig',
  '.nim': 'Nim',
  '.ml': 'OCaml',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.zsh': 'Shell',
  '.sql': 'SQL',
};

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.avi', '.mov', '.wav', '.ogg',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.pptx',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.lock', '.map',
]);

export function getLanguage(ext: string): string | null {
  return LANGUAGE_MAP[ext] ?? null;
}

export function shouldSkip(ext: string): boolean {
  return SKIP_EXTENSIONS.has(ext);
}

export function getSupportedExtensions(): string[] {
  return Object.keys(LANGUAGE_MAP);
}
