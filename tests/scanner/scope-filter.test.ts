import { describe, it, expect } from 'vitest';
import { scanProject } from '../../src/index.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'sova-filter-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'x', version: '1.0.0',
    dependencies: { chalk: '5.3.0' },
    devDependencies: { typescript: '5.5.4' },
    peerDependencies: { react: '18.0.0' },
    optionalDependencies: { fsevents: '2.3.0' },
    engines: { node: '>=18.0.0' },
  }));
  return dir;
}

describe('scanProject — scope filter', () => {
  it('default includes all scopes', async () => {
    const m = await scanProject({
      path: makeFixture(), maxDepth: 5, includeDev: true, verbose: false, noSign: true,
    });
    expect(m.applications.javascript).toHaveLength(4);
    expect(m.engines.javascript).toEqual([{ name: 'node', constraint: '>=18.0.0' }]);
  });

  it('--no-include-dev drops dev scope', async () => {
    const m = await scanProject({
      path: makeFixture(), maxDepth: 5, includeDev: false, verbose: false, noSign: true,
    });
    const scopes = m.applications.javascript.map(a => a.scope);
    expect(scopes).not.toContain('dev');
    expect(scopes).toContain('runtime');
    expect(scopes).toContain('peer');
  });

  it('--no-include-peer drops peer scope', async () => {
    const m = await scanProject({
      path: makeFixture(), maxDepth: 5, includeDev: true, includePeer: false, verbose: false, noSign: true,
    });
    expect(m.applications.javascript.map(a => a.scope)).not.toContain('peer');
  });

  it('--no-include-optional drops optional scope', async () => {
    const m = await scanProject({
      path: makeFixture(), maxDepth: 5, includeDev: true, includeOptional: false, verbose: false, noSign: true,
    });
    expect(m.applications.javascript.map(a => a.scope)).not.toContain('optional');
  });

  it('all filters combined → only runtime survives', async () => {
    const m = await scanProject({
      path: makeFixture(), maxDepth: 5,
      includeDev: false, includePeer: false, includeOptional: false,
      verbose: false, noSign: true,
    });
    expect([...new Set(m.applications.javascript.map(a => a.scope))]).toEqual(['runtime']);
  });

  it('manifestSchema is "2.0"', async () => {
    const m = await scanProject({
      path: makeFixture(), maxDepth: 5, includeDev: true, verbose: false, noSign: true,
    });
    expect(m.manifestSchema).toBe('2.0');
  });
});
