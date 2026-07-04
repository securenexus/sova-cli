import type { Application } from '../types/parser.js';

export interface SectionMapping {
  section: string;
  scope: Application['scope'];
  rawScope?: string;
}

export const SCOPE_MAPS = {
  npm: [
    { section: 'dependencies', scope: 'runtime' },
    { section: 'devDependencies', scope: 'dev' },
    { section: 'peerDependencies', scope: 'peer' },
    { section: 'optionalDependencies', scope: 'optional' },
  ],
  pypi_poetry: [
    { section: 'dependencies', scope: 'runtime' },
    { section: 'dev-dependencies', scope: 'dev', rawScope: 'dev-dependencies' },
  ],
  pypi_pep621: [
    { section: 'dependencies', scope: 'runtime' },
    { section: 'optional-dependencies', scope: 'optional' },
  ],
  pypi_pip: [
    { section: 'requirements.txt', scope: 'runtime' },
    { section: 'requirements-dev.txt', scope: 'dev' },
  ],
  pypi_pipfile: [
    { section: 'packages', scope: 'runtime' },
    { section: 'dev-packages', scope: 'dev' },
  ],
  cargo: [
    { section: 'dependencies', scope: 'runtime' },
    { section: 'dev-dependencies', scope: 'dev' },
    { section: 'build-dependencies', scope: 'build' },
  ],
  maven: [
    { section: 'compile', scope: 'runtime', rawScope: 'compile' },
    { section: 'runtime', scope: 'runtime', rawScope: 'runtime' },
    { section: 'test', scope: 'dev', rawScope: 'test' },
    { section: 'provided', scope: 'runtime', rawScope: 'provided' },
    { section: 'system', scope: 'runtime', rawScope: 'system' },
  ],
  gradle: [
    { section: 'implementation', scope: 'runtime' },
    { section: 'api', scope: 'runtime' },
    { section: 'compileOnly', scope: 'runtime' },
    { section: 'runtimeOnly', scope: 'runtime' },
    { section: 'testImplementation', scope: 'dev' },
    { section: 'testCompile', scope: 'dev' },
    { section: 'testRuntime', scope: 'dev' },
  ],
  composer: [
    { section: 'require', scope: 'runtime' },
    { section: 'require-dev', scope: 'dev' },
  ],
  bower: [
    { section: 'dependencies', scope: 'runtime' },
    { section: 'devDependencies', scope: 'dev' },
  ],
  pub: [
    { section: 'dependencies', scope: 'runtime' },
    { section: 'dev_dependencies', scope: 'dev' },
  ],
  rubygems: [
    { section: 'runtime', scope: 'runtime' },
    { section: 'development', scope: 'dev' },
    { section: 'test', scope: 'dev', rawScope: 'test' },
  ],
  hex: [
    { section: 'deps', scope: 'runtime' },
    { section: 'dev', scope: 'dev' },
    { section: 'test', scope: 'dev', rawScope: 'test' },
  ],
  cabal: [
    { section: 'build-depends', scope: 'runtime' },
    { section: 'test-suite', scope: 'dev' },
    { section: 'benchmark', scope: 'dev', rawScope: 'benchmark' },
  ],
  opam: [
    { section: 'depends', scope: 'runtime' },
    { section: 'with-test', scope: 'dev' },
    { section: 'with-doc', scope: 'dev', rawScope: 'with-doc' },
  ],
  sbt: [
    { section: 'Compile', scope: 'runtime' },
    { section: 'Runtime', scope: 'runtime' },
    { section: 'Test', scope: 'dev' },
    { section: 'IntegrationTest', scope: 'dev', rawScope: 'IntegrationTest' },
  ],
  cpan: [
    { section: 'requires', scope: 'runtime' },
    { section: 'test_requires', scope: 'dev' },
    { section: 'develop_requires', scope: 'dev', rawScope: 'develop_requires' },
  ],
  swift: [
    { section: 'target', scope: 'runtime' },
    { section: 'test_target', scope: 'dev' },
  ],
  cocoapods: [
    { section: 'pod', scope: 'runtime' },
    { section: 'pod_debug', scope: 'dev', rawScope: 'Debug-config' },
  ],
  julia: [
    { section: 'deps', scope: 'runtime' },
    { section: 'extras', scope: 'dev' },
    { section: 'targets', scope: 'dev' },
  ],
  rebar: [
    { section: 'deps', scope: 'runtime' },
    { section: 'profiles.test.deps', scope: 'dev' },
  ],
  cran: [
    { section: 'Imports', scope: 'runtime' },
    { section: 'Depends', scope: 'runtime' },
    { section: 'Suggests', scope: 'dev' },
  ],
  go: [{ section: 'require', scope: 'runtime' }],
  nuget: [{ section: 'PackageReference', scope: 'runtime' }],
  haxe: [{ section: 'dependencies', scope: 'runtime' }],
  conan: [{ section: 'requires', scope: 'runtime' }],
  vcpkg: [{ section: 'dependencies', scope: 'runtime' }],
  terraform: [{ section: 'required_providers', scope: 'runtime' }],
  docker: [{ section: 'FROM', scope: 'runtime' }],
  github_actions: [{ section: 'uses', scope: 'runtime' }],
  html: [{ section: 'script', scope: 'runtime' }],
} as const satisfies Record<string, readonly SectionMapping[]>;
