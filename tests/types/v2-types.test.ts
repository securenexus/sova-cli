import { describe, it, expect } from 'vitest';
import type { Application, RuntimeConstraint, ParsedResult, ScanOptions } from '../../src/types/parser.js';
import type { SovaManifest, FileResult } from '../../src/types/manifest.js';

describe('v2 types', () => {
  it('Application enforces shape', () => {
    const a: Application = { name: 'x', version: '1.0', scope: 'runtime', key: 'x_:_1.0' };
    expect(a.scope).toBe('runtime');
  });

  it('RuntimeConstraint shape', () => {
    const c: RuntimeConstraint = { name: 'node', constraint: '>=18.0.0' };
    expect(c.name).toBe('node');
  });

  it('SovaManifest.manifestSchema is literal "2.0"', () => {
    const m: SovaManifest = {
      manifestSchema: '2.0',
      version: '1.1.0',
      generatedAt: '',
      tool: { name: 'sova', version: '1.1.0' },
      project: { name: '', version: '', path: '' },
      scan: { languagesDetected: [], totalFiles: 0, totalDependencies: 0, hasLockFiles: false },
      applications: {},
      engines: {},
      dependencyGraph: {},
      files: [],
      fileResults: [],
      securitySignals: { totalSignals: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0, signals: [] },
    };
    expect(m.manifestSchema).toBe('2.0');
  });

  it('FileResult.dependencies is Application[]', () => {
    const fr: FileResult = {
      file: 'pkg.json', language: 'javascript', packageManager: 'npm', fileType: 'manifest',
      dependencies: [{ name: 'x', version: '1.0', scope: 'runtime', key: 'x_:_1.0' }],
      additionalDependencies: {},
    };
    expect(fr.dependencies[0].scope).toBe('runtime');
  });

  it('ParsedResult includes engines', () => {
    const r: ParsedResult = {
      dependencies: [],
      additionalDependencies: {},
      engines: [],
      projectName: '',
      projectVersion: '',
      license: '',
      pathToParsedFile: '',
      fileType: 'manifest',
      packageManager: 'npm',
    };
    expect(r.engines).toEqual([]);
  });

  it('ScanOptions has includePeer + includeOptional', () => {
    const o: ScanOptions = {
      path: '/', maxDepth: 5, includeDev: true,
      includePeer: true, includeOptional: true, verbose: false,
    };
    expect(o.includePeer).toBe(true);
  });
});
