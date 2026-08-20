import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { JavaScriptParser } from '../../src/parsers/javascript-parser.js';

const parser = new JavaScriptParser();
const tmp = mkdtempSync(join(tmpdir(), 'sova-js-fmt-'));

/** Write `file` with `body` into a fresh subdirectory and return its path. */
function write(dir: string, file: string, body: string): string {
  const d = join(tmp, dir);
  mkdirSync(d, { recursive: true });
  const p = join(d, file);
  writeFileSync(p, body);
  return p;
}

describe('JavaScriptParser — yarn.lock', () => {
  it('extracts packages and versions', async () => {
    const body = [
      '# yarn lockfile v1',
      '',
      'express@^4.18.0:',
      '  version "4.18.2"',
      '  resolved "https://registry.yarnpkg.com/express/-/express-4.18.2.tgz"',
      '',
      'lodash@^4.17.0:',
      '  version "4.17.21"',
      '',
    ].join('\n');
    const r = await parser.parse('javascript', write('yarn-basic', 'yarn.lock', body));
    expect(r.fileType).toBe('lockfile');
    expect(r.packageManager).toBe('yarn');
    const names = r.dependencies.map(d => d.name);
    expect(names).toContain('express');
    expect(names).toContain('lodash');
    expect(r.dependencies.find(d => d.name === 'express')?.version).toBe('4.18.2');
  });

  it('handles scoped packages in the header', async () => {
    const body = '"@types/node@^20.0.0":\n  version "20.5.0"\n';
    const r = await parser.parse('javascript', write('yarn-scoped', 'yarn.lock', body));
    expect(r.dependencies.map(d => d.name)).toContain('@types/node');
  });

  it('records one entry per name when a header lists several ranges', async () => {
    const body = '"express@^4.18.0", "express@~4.18.1":\n  version "4.18.2"\n';
    const r = await parser.parse('javascript', write('yarn-multi', 'yarn.lock', body));
    expect(r.dependencies.filter(d => d.name === 'express')).toHaveLength(1);
  });

  it('deduplicates identical name/version pairs across blocks', async () => {
    const body = 'express@^4.0.0:\n  version "4.18.2"\n\nexpress@^4.18.0:\n  version "4.18.2"\n';
    const r = await parser.parse('javascript', write('yarn-dupe', 'yarn.lock', body));
    expect(r.dependencies.filter(d => d.name === 'express')).toHaveLength(1);
  });

  it('returns an empty result for a missing yarn.lock', async () => {
    const r = await parser.parse('javascript', '/nonexistent/yarn.lock');
    expect(r.dependencies).toEqual([]);
  });
});

describe('JavaScriptParser — bower.json', () => {
  it('reads dependencies and devDependencies with correct scopes', async () => {
    const body = JSON.stringify({
      name: 'demo',
      dependencies: { jquery: '3.7.1' },
      devDependencies: { qunit: '2.19.0' },
    });
    const r = await parser.parse('javascript', write('bower-basic', 'bower.json', body));
    expect(r.fileType).toBe('manifest');
    expect(r.packageManager).toBe('bower');
    expect(r.dependencies.find(d => d.name === 'jquery')?.scope).toBe('runtime');
    expect(r.dependencies.find(d => d.name === 'qunit')?.scope).toBe('dev');
  });

  it('strips >=, <= and ^ from version constraints', async () => {
    const body = JSON.stringify({
      dependencies: { a: '>=1.2.3', b: '<=2.0.0', c: '^3.1.0', d: '4.0.0' },
    });
    const r = await parser.parse('javascript', write('bower-versions', 'bower.json', body));
    const v = (n: string) => r.dependencies.find(d => d.name === n)?.version;
    expect(v('a')).toBe('1.2.3');
    expect(v('b')).toBe('2.0.0');
    expect(v('c')).toBe('3.1.0');
    expect(v('d')).toBe('4.0.0');
  });

  it('returns an empty result for a missing bower.json', async () => {
    const r = await parser.parse('javascript', '/nonexistent/bower.json');
    expect(r.dependencies).toEqual([]);
  });
});

describe('JavaScriptParser — pnpm-lock.yaml', () => {
  it('reads the v6+ packages map', async () => {
    const body = [
      "lockfileVersion: '6.0'",
      'packages:',
      '  /express@4.18.2:',
      '    resolution: {integrity: sha512-aaa}',
      '  /lodash@4.17.21:',
      '    resolution: {integrity: sha512-bbb}',
    ].join('\n');
    const r = await parser.parse('javascript', write('pnpm-v6', 'pnpm-lock.yaml', body));
    expect(r.packageManager).toBe('pnpm');
    const names = r.dependencies.map(d => d.name);
    expect(names).toContain('express');
    expect(names).toContain('lodash');
    expect(r.dependencies.find(d => d.name === 'express')?.version).toBe('4.18.2');
  });

  it('handles scoped packages in the v6 packages map', async () => {
    const body = "packages:\n  /@types/node@20.5.0:\n    resolution: {integrity: sha512-x}\n";
    const r = await parser.parse('javascript', write('pnpm-scoped', 'pnpm-lock.yaml', body));
    const dep = r.dependencies.find(d => d.name === '@types/node');
    expect(dep).toBeDefined();
    expect(dep!.version).toBe('20.5.0');
  });

  it('strips peer-dependency suffixes from the version', async () => {
    const body = "packages:\n  /react-dom@18.2.0_react@18.2.0:\n    resolution: {integrity: sha512-x}\n";
    const r = await parser.parse('javascript', write('pnpm-peer', 'pnpm-lock.yaml', body));
    expect(r.dependencies.find(d => d.name === 'react-dom')?.version).toBe('18.2.0');
  });

  it('reads the legacy format with direct dependency sections', async () => {
    const body = [
      'dependencies:',
      '  express: 4.18.2',
      'devDependencies:',
      '  vitest:',
      "    version: 2.0.5",
    ].join('\n');
    const r = await parser.parse('javascript', write('pnpm-legacy', 'pnpm-lock.yaml', body));
    const names = r.dependencies.map(d => d.name);
    expect(names).toContain('express');
    expect(names).toContain('vitest');
    expect(r.dependencies.find(d => d.name === 'vitest')?.version).toBe('2.0.5');
  });

  it('returns an empty result when the YAML is malformed', async () => {
    const r = await parser.parse('javascript', write('pnpm-bad', 'pnpm-lock.yaml', 'packages:\n  - [unclosed\n'));
    expect(r.dependencies).toEqual([]);
  });

  it('returns an empty result for a missing pnpm-lock.yaml', async () => {
    const r = await parser.parse('javascript', '/nonexistent/pnpm-lock.yaml');
    expect(r.dependencies).toEqual([]);
  });
});

describe('JavaScriptParser — bun.lockb fallback', () => {
  it('falls back to package.json in the same directory', async () => {
    const dir = join(tmp, 'bun-with-pkg');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'bun-app', version: '2.0.0', dependencies: { hono: '4.0.0' },
    }));
    writeFileSync(join(dir, 'bun.lockb'), 'binary-placeholder');
    const r = await parser.parse('javascript', join(dir, 'bun.lockb'));
    expect(r.projectName).toBe('bun-app');
    expect(r.dependencies.map(d => d.name)).toContain('hono');
  });

  it('returns an empty bun result when no package.json sits alongside', async () => {
    const p = write('bun-alone', 'bun.lockb', 'binary-placeholder');
    const r = await parser.parse('javascript', p);
    expect(r.dependencies).toEqual([]);
    expect(r.packageManager).toBe('bun');
  });
});

describe('JavaScriptParser — package-lock v1', () => {
  it('reads the flat dependencies map and the requires tree', async () => {
    const body = JSON.stringify({
      name: 'demo', lockfileVersion: 1,
      dependencies: {
        express: { version: '4.18.2', requires: { accepts: '~1.3.8' } },
        accepts: { version: '1.3.8' },
      },
    });
    const r = await parser.parse('javascript', write('lock-v1', 'package-lock.json', body));
    const keys = r.dependencies.map(d => d.key);
    expect(keys).toContain('express_:_4.18.2');
    expect(keys).toContain('accepts_:_1.3.8');
    expect(r.additionalDependencies['express_:_4.18.2']).toContain('accepts_:_1.3.8');
  });

  it('falls back to the declared range when a child is not top-level', async () => {
    const body = JSON.stringify({
      lockfileVersion: 1,
      dependencies: { a: { version: '1.0.0', requires: { ghost: '9.9.9' } } },
    });
    const r = await parser.parse('javascript', write('lock-v1-ghost', 'package-lock.json', body));
    expect(r.additionalDependencies['a_:_1.0.0']).toContain('ghost_:_9.9.9');
  });

  it('reads npm-shrinkwrap.json with the same logic', async () => {
    const body = JSON.stringify({
      lockfileVersion: 1,
      dependencies: { express: { version: '4.18.2' } },
    });
    const r = await parser.parse('javascript', write('shrinkwrap', 'npm-shrinkwrap.json', body));
    expect(r.dependencies.map(d => d.name)).toContain('express');
  });
});

describe('JavaScriptParser — version specification handling', () => {
  const pkg = (deps: Record<string, string>, dir: string) =>
    write(dir, 'package.json', JSON.stringify({ name: 'v', version: '1.0.0', dependencies: deps }));

  it('extracts a version from a .tgz tarball URL', async () => {
    const r = await parser.parse('javascript', pkg({ a: 'https://example.com/pkg-1.2.3.tgz' }, 'ver-tgz'));
    expect(r.dependencies[0].version).toBe('1.2.3');
  });

  it('extracts a version from a .tar.gz tarball URL', async () => {
    const r = await parser.parse('javascript', pkg({ a: 'https://example.com/pkg-4.5.6.tar.gz' }, 'ver-targz'));
    expect(r.dependencies[0].version).toBe('4.5.6');
  });

  it('yields an empty version for a URL with no recognisable archive', async () => {
    const r = await parser.parse('javascript', pkg({ a: 'https://example.com/some/path' }, 'ver-url'));
    expect(r.dependencies[0].version).toBe('');
  });

  it('takes the upper bound of a hyphen range', async () => {
    const r = await parser.parse('javascript', pkg({ a: '1.0.0 - 2.0.0' }, 'ver-range'));
    expect(r.dependencies[0].version).toBe('2.0.0');
  });

  it('handles >= and <= operators', async () => {
    const r = await parser.parse('javascript', pkg({ a: '>=1.2.3', b: '<=4.5.6' }, 'ver-ops'));
    expect(r.dependencies.find(d => d.name === 'a')?.version).toBe('1.2.3');
    expect(r.dependencies.find(d => d.name === 'b')?.version).toBe('4.5.6');
  });

  it('takes the last alternative of an || union', async () => {
    const r = await parser.parse('javascript', pkg({ a: '^1.0.0 || ^2.0.0' }, 'ver-union'));
    // parseVersionSpec picks "^2.0.0"; makeApplication normalises the caret away.
    expect(r.dependencies[0].version).toBe('2.0.0');
  });

  it('passes a plain version through unchanged', async () => {
    const r = await parser.parse('javascript', pkg({ a: '1.2.3' }, 'ver-plain'));
    expect(r.dependencies[0].version).toBe('1.2.3');
  });

  it('yields an empty version for an empty specifier', async () => {
    const r = await parser.parse('javascript', pkg({ a: '' }, 'ver-empty'));
    expect(r.dependencies[0].version).toBe('');
  });
});
