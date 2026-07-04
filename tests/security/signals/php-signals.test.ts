import { describe, it, expect } from 'vitest';
import { PhpSignals } from '../../../src/security/signals/php-signals.js';

const detector = new PhpSignals();
const SRC = '/project/src/Controller.php';

describe('PhpSignals', () => {
  it('language property is "php"', () => {
    expect(detector.language).toBe('php');
  });

  // Existing manifest detection still works
  it('detects post-install-cmd in composer.json', () => {
    const content = JSON.stringify({
      scripts: { 'post-install-cmd': 'php artisan migrate' },
    });
    const signals = detector.detect('/project/composer.json', content);
    expect(signals.some(s => s.type === 'composer-post-install-cmd')).toBe(true);
  });

  it('detects non-packagist repository in composer.json', () => {
    const content = JSON.stringify({
      repositories: [{ type: 'vcs', url: 'https://github.com/org/private-pkg' }],
    });
    const signals = detector.detect('/project/composer.json', content);
    expect(signals.some(s => s.type === 'non-packagist-repo')).toBe(true);
  });

  // Source pattern: unsafe-deserialization
  describe('unsafe-deserialization', () => {
    it('detects unserialize() call', () => {
      const signals = detector.detect(SRC, '$data = unserialize($input);');
      expect(signals.some(s => s.type === 'unserialize')).toBe(true);
      expect(signals.find(s => s.type === 'unserialize')!.severity).toBe('critical');
      expect(signals.find(s => s.type === 'unserialize')!.category).toBe('unsafe-deserialization');
    });
  });

  // Source pattern: code-injection
  describe('code-injection', () => {
    it('detects eval() call', () => {
      const signals = detector.detect(SRC, 'eval($userCode);');
      expect(signals.some(s => s.type === 'eval-call')).toBe(true);
      expect(signals.find(s => s.type === 'eval-call')!.severity).toBe('critical');
      expect(signals.find(s => s.type === 'eval-call')!.category).toBe('code-injection');
    });

    it('detects exec() call', () => {
      const signals = detector.detect(SRC, '$output = exec($cmd);');
      expect(signals.some(s => s.type === 'shell-exec')).toBe(true);
      expect(signals.find(s => s.type === 'shell-exec')!.severity).toBe('critical');
      expect(signals.find(s => s.type === 'shell-exec')!.category).toBe('code-injection');
    });

    it('detects system() call', () => {
      const signals = detector.detect(SRC, 'system($command);');
      expect(signals.some(s => s.type === 'shell-exec')).toBe(true);
    });

    it('detects passthru() call', () => {
      const signals = detector.detect(SRC, 'passthru($command);');
      expect(signals.some(s => s.type === 'shell-exec')).toBe(true);
    });
  });

  it('returns no source signals for clean PHP code', () => {
    const clean = `<?php
namespace App\\Controllers;

class HomeController {
    public function index() {
        return view('home');
    }
}
`;
    const signals = detector.detect(SRC, clean);
    expect(signals).toHaveLength(0);
  });

  it('scans source patterns on arbitrary .php files (not just composer.json)', () => {
    const signals = detector.detect('/project/app/Helper.php', 'unserialize($data)');
    expect(signals.some(s => s.type === 'unserialize')).toBe(true);
  });
});
