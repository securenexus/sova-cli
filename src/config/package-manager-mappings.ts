/**
 * Package manager mappings.
 *
 * Maps file patterns to their package manager and language context.
 */

export interface PackageManagerInfo {
  filePatterns: string[];
  languages: string[];
}

export const PACKAGE_MANAGER_MAPPINGS: Record<string, PackageManagerInfo> = {
  npm: {
    filePatterns: ['package.json', 'package-lock.json'],
    languages: ['javascript', 'typescript'],
  },
  yarn: {
    filePatterns: ['yarn.lock'],
    languages: ['javascript'],
  },
  pnpm: {
    filePatterns: ['pnpm-lock.yaml'],
    languages: ['javascript'],
  },
  pip: {
    filePatterns: ['requirements.txt', 'Pipfile', 'Pipfile.lock', 'setup.py'],
    languages: ['python'],
  },
  poetry: {
    filePatterns: ['poetry.lock', 'pyproject.toml'],
    languages: ['python'],
  },
  uv: {
    filePatterns: ['uv.lock'],
    languages: ['python'],
  },
  conda: {
    filePatterns: ['environment.yml', 'environment.yaml', 'conda.yaml'],
    languages: ['python'],
  },
  maven: {
    filePatterns: ['pom.xml'],
    languages: ['java'],
  },
  gradle: {
    filePatterns: ['build.gradle', 'build.gradle.kts', 'gradle.lockfile'],
    languages: ['java', 'kotlin', 'groovy'],
  },
  bundler: {
    filePatterns: ['Gemfile', 'Gemfile.lock', 'gemfile.lock'],
    languages: ['ruby'],
  },
  composer: {
    filePatterns: ['composer.json', 'composer.lock'],
    languages: ['php'],
  },
  cargo: {
    filePatterns: ['Cargo.toml', 'Cargo.lock'],
    languages: ['rust'],
  },
  'go-modules': {
    filePatterns: ['go.mod', 'go.sum'],
    languages: ['go'],
  },
  nuget: {
    filePatterns: ['packages.config', '*.csproj', '*.fsproj', 'packages.lock.json'],
    languages: ['dotNet'],
  },
  mix: {
    filePatterns: ['mix.exs', 'mix.lock'],
    languages: ['elixir'],
  },
  sbt: {
    filePatterns: ['build.sbt'],
    languages: ['scala'],
  },
  'swift-pm': {
    filePatterns: ['Package.swift'],
    languages: ['swift'],
  },
  pub: {
    filePatterns: ['pubspec.yaml', 'pubspec.lock'],
    languages: ['dart'],
  },
  cran: {
    filePatterns: ['DESCRIPTION', 'renv.lock'],
    languages: ['r'],
  },
  cpan: {
    filePatterns: ['cpanfile'],
    languages: ['perl'],
  },
  cocoapods: {
    filePatterns: ['Podfile.lock', '*.podspec'],
    languages: ['cocoa'],
  },
  hex: {
    filePatterns: ['rebar.lock', 'rebar.config'],
    languages: ['erlang'],
  },
  vcpkg: {
    filePatterns: ['vcpkg.json'],
    languages: ['c'],
  },
  conan: {
    filePatterns: ['conanfile.txt'],
    languages: ['c'],
  },
  cmake: {
    filePatterns: ['CMakeLists.txt', '*.cmake'],
    languages: ['c'],
  },
  terraform: {
    filePatterns: ['*.tf', '.terraform.lock.hcl'],
    languages: ['terraform'],
  },
  docker: {
    filePatterns: ['Dockerfile', '*.dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'],
    languages: ['docker'],
  },
  'github-actions': {
    filePatterns: ['.github/workflows/*.yml', '.github/workflows/*.yaml'],
    languages: ['github-actions'],
  },
};

/**
 * Determine the package manager for a given file path and language.
 */
export function detectPackageManager(fileName: string, language: string): string {
  const lowerFile = fileName.toLowerCase();

  for (const [pm, info] of Object.entries(PACKAGE_MANAGER_MAPPINGS)) {
    for (const pattern of info.filePatterns) {
      if (pattern.startsWith('*')) {
        // Extension match
        const ext = pattern.slice(1).toLowerCase();
        if (lowerFile.endsWith(ext)) return pm;
      } else if (pattern.includes('*')) {
        // Path glob — check if filename portion matches
        const parts = pattern.split('*');
        if (parts.length === 2 && lowerFile.startsWith(parts[0].toLowerCase()) && lowerFile.endsWith(parts[1].toLowerCase())) {
          return pm;
        }
      } else {
        // Exact match
        if (lowerFile === pattern.toLowerCase() || lowerFile.endsWith('/' + pattern.toLowerCase())) {
          return pm;
        }
      }
    }
  }

  // Fallback: return language as package manager
  return language;
}

/**
 * Known lock files — if parsed, the dependency tree is complete.
 */
export const LOCK_FILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'poetry.lock',
  'pipfile.lock',
  'uv.lock',
  'Cargo.lock',
  'composer.lock',
  'gemfile.lock',
  'Gemfile.lock',
  'go.sum',
  'gradle.lockfile',
  'buildscript-gradle.lockfile',
  'packages.lock.json',
  'project.lock.json',
  'mix.lock',
  'pubspec.lock',
  'Podfile.lock',
  'rebar.lock',
  'renv.lock',
  '.terraform.lock.hcl',
  'Manifest.toml',
  'Gopkg.lock',
  'stack.yaml.lock',
]);

/**
 * Check if a file is a lock file.
 */
export function isLockFile(fileName: string): boolean {
  const base = fileName.split('/').pop() || fileName;
  return LOCK_FILES.has(base) || LOCK_FILES.has(base.toLowerCase());
}
