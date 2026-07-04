import { describe, it, expect } from 'vitest';
import { SCOPE_MAPS } from '../../src/parsers/scope-mapping.js';

describe('SCOPE_MAPS', () => {
  it('npm has 4 sections, no engines', () => {
    const sections = SCOPE_MAPS.npm.map(m => m.section);
    expect(sections).toEqual(['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']);
    expect(sections).not.toContain('engines');
  });

  it('cargo has build-dependencies → build', () => {
    const build = SCOPE_MAPS.cargo.find(m => m.section === 'build-dependencies');
    expect(build?.scope).toBe('build');
  });

  it('maven preserves rawScope per ecosystem term', () => {
    const provided = SCOPE_MAPS.maven.find(m => m.rawScope === 'provided');
    expect(provided?.scope).toBe('runtime');
  });

  it('cran Suggests → dev', () => {
    expect(SCOPE_MAPS.cran.find(m => m.section === 'Suggests')?.scope).toBe('dev');
  });

  it('go single-scope mapping', () => {
    expect(SCOPE_MAPS.go).toEqual([{ section: 'require', scope: 'runtime' }]);
  });

  it('contains npm + python_* + maven + gradle + cargo + composer + bower + pub + rubygems + hex + cabal + opam + sbt + cpan + swift + cocoapods + julia + rebar + cran + go + nuget + haxe + conan + vcpkg + terraform + docker + github_actions + html', () => {
    const expected = [
      'npm', 'pypi_poetry', 'pypi_pep621', 'pypi_pip', 'pypi_pipfile',
      'cargo', 'maven', 'gradle', 'composer', 'bower', 'pub', 'rubygems',
      'hex', 'cabal', 'opam', 'sbt', 'cpan', 'swift', 'cocoapods',
      'julia', 'rebar', 'cran', 'go', 'nuget', 'haxe', 'conan', 'vcpkg',
      'terraform', 'docker', 'github_actions', 'html',
    ];
    for (const key of expected) {
      expect(SCOPE_MAPS).toHaveProperty(key);
    }
  });
});
