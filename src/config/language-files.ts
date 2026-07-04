/**
 * Dependency file patterns per language.
 *
 * Entries prefixed with "*." are extension-based glob patterns.
 * All other entries are exact filename matches (case-insensitive).
 */

export const LANGUAGE_FILES: Record<string, string[]> = {
  elixir: ['mix.lock', 'mix.exs'],

  go: ['go.mod', 'go.sum', 'Gopkg.lock'],

  java: [
    'build.gradle',
    'pom.xml',
    'build.gradle.kts',
    'gradle.lockfile',
    'buildscript-gradle.lockfile',
  ],

  groovy: ['build.gradle', 'build.gradle.kts', 'gradle.lockfile'],

  javascript: [
    'package.json',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'yarn.lock',
    'bower.json',
    'pnpm-lock.yaml',
    'bun.lockb',
  ],

  kotlin: ['build.gradle', 'build.gradle.kts', 'gradle.lockfile'],

  dotNet: [
    'packages.config',
    'web.config',
    'web.release.config',
    'web.debug.config',
    'app.config',
    '*.csproj',
    '*.appinstaller',
    '*.appxmanifest',
    '*.msixbundle',
    '*.appx',
    '*.deps.json',
    '*.nupkg',
    '*.nuspec',
    '*.dgspec.json',
    'project.json',
    'project.lock.json',
    'packages.lock.json',
    '*.dll',
  ],

  php: ['composer.lock', 'composer.json'],

  python: [
    'requirements.txt',
    'poetry.lock',
    'pipfile.lock',
    'Pipfile.lock',
    'pyproject.toml',
    'setup.cfg',
    'setup.py',
    'uv.lock',
    'environment.yml',
    'environment.yaml',
    'conda.yaml',
  ],

  ruby: ['gemfile.lock', 'Gemfile', '*.gemspec'],

  rust: ['Cargo.toml', 'Cargo.lock'],

  scala: ['*.sbt'],

  c: ['CMakeLists.txt', '*.cmake', 'vcpkg.json', 'conanfile.txt'],

  cocoa: ['*.podspec', 'Podfile.lock'],

  perl: ['cpanfile'],

  swift: ['Package.swift'],

  haskell: ['*.cabal', 'package.yaml', 'stack.yaml'],

  haxe: ['haxelib.json'],

  html: [
    '*.html',
    '*.aspx',
    '*.jsp',
    '*.jspx',
    '*.jspf',
    '*.asp',
    '*.shtml',
    '*.cshtml',
    '*.xhtml',
    '*.twig',
    '*.erb',
    '*.dwt',
    '*.vdw',
  ],

  dart: ['pubspec.yaml', 'pubspec.yml', 'pubspec.lock'],

  ocaml: ['dune-project'],

  docker: [
    'Dockerfile',
    '*.dockerfile',
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
  ],

  terraform: ['*.tf', '.terraform.lock.hcl'],

  julia: ['Project.toml', 'Manifest.toml'],

  erlang: ['rebar.lock', 'rebar.config'],

  r: ['DESCRIPTION', 'renv.lock'],

  'github-actions': [
    '.github/workflows/*.yml',
    '.github/workflows/*.yaml',
  ],
};

/**
 * Directories to skip during file discovery.
 * These are build artifacts, caches, and dependency folders
 * that should never be scanned.
 */
export const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  '.env',
  '.tox',
  'dist',
  'build',
  'target',
  '.gradle',
  '.idea',
  '.vs',
  '.vscode',
  'bin',
  'obj',
  'vendor',
  '.next',
  '.nuxt',
  '.output',
  'coverage',
  '.pytest_cache',
  '.mypy_cache',
  '.cargo',
  'pkg',
  '_build',
  '.bundle',
  '.dart_tool',
  '.pub-cache',
  '.terraform',
  '.stack-work',
  'deps',         // Elixir
  '_deps',        // CMake
  'Pods',         // CocoaPods
  '.packages',    // Dart
  '.pub',
  'bower_components',
]);
