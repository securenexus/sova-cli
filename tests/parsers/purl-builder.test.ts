import { describe, it, expect } from 'vitest';
import { buildPurl } from '../../src/parsers/purl-builder.js';

describe('buildPurl', () => {
  it('npm unscoped', () => {
    expect(buildPurl('npm', 'chalk', '5.3.0')).toBe('pkg:npm/chalk@5.3.0');
  });
  it('npm scoped — encodes @', () => {
    expect(buildPurl('npm', '@types/node', '22.5.0')).toBe('pkg:npm/%40types/node@22.5.0');
  });
  it('pypi lowercases name', () => {
    expect(buildPurl('pypi', 'Django', '5.0.0')).toBe('pkg:pypi/django@5.0.0');
  });
  it('maven splits group:artifact', () => {
    expect(buildPurl('maven', 'org.apache.commons:commons-lang3', '3.12.0'))
      .toBe('pkg:maven/org.apache.commons/commons-lang3@3.12.0');
  });
  it('maven without colon falls back', () => {
    expect(buildPurl('maven', 'commons-lang3', '3.12.0')).toBe('pkg:maven/commons-lang3@3.12.0');
  });
  it('go', () => {
    expect(buildPurl('go', 'github.com/foo/bar', 'v1.2.3')).toBe('pkg:golang/github.com/foo/bar@v1.2.3');
  });
  it('cargo', () => {
    expect(buildPurl('cargo', 'serde', '1.0.0')).toBe('pkg:cargo/serde@1.0.0');
  });
  it('terraform returns undefined (no PURL type)', () => {
    expect(buildPurl('terraform', 'aws', '5.0.0')).toBeUndefined();
  });
  it('empty inputs return undefined', () => {
    expect(buildPurl('npm', '', '5.0.0')).toBeUndefined();
    expect(buildPurl('npm', 'chalk', '')).toBeUndefined();
  });
  it('unknown manager returns undefined', () => {
    expect(buildPurl('madeup', 'x', '1.0.0')).toBeUndefined();
  });
  it('yarn/pnpm/bun → npm purl', () => {
    expect(buildPurl('yarn', 'chalk', '5.3.0')).toBe('pkg:npm/chalk@5.3.0');
    expect(buildPurl('pnpm', 'chalk', '5.3.0')).toBe('pkg:npm/chalk@5.3.0');
    expect(buildPurl('bun', 'chalk', '5.3.0')).toBe('pkg:npm/chalk@5.3.0');
  });
  it('gem alias', () => {
    expect(buildPurl('gem', 'rails', '7.0.0')).toBe('pkg:gem/rails@7.0.0');
    expect(buildPurl('rubygems', 'rails', '7.0.0')).toBe('pkg:gem/rails@7.0.0');
  });
});
