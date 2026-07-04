/**
 * SecuritySignalDetector - Orchestrates per-language security signal detection.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SecuritySignal, ManifestSecuritySignals, ISignalDetector } from './types.js';
import { summarizeSignals } from './types.js';

const TEST_DIR_PATTERNS = ['/test/', '/tests/', '/__tests__/', '/spec/', '/fixtures/'];

const detectorMap: Record<string, () => Promise<ISignalDetector>> = {
  javascript: () => import('./signals/javascript-signals.js').then(m => new m.JavaScriptSignals()),
  python: () => import('./signals/python-signals.js').then(m => new m.PythonSignals()),
  ruby: () => import('./signals/ruby-signals.js').then(m => new m.RubySignals()),
  rust: () => import('./signals/rust-signals.js').then(m => new m.RustSignals()),
  go: () => import('./signals/go-signals.js').then(m => new m.GoSignals()),
  java: () => import('./signals/java-signals.js').then(m => new m.JavaSignals()),
  kotlin: () => import('./signals/java-signals.js').then(m => new m.JavaSignals()),
  groovy: () => import('./signals/java-signals.js').then(m => new m.JavaSignals()),
  dotnet: () => import('./signals/dotnet-signals.js').then(m => new m.DotnetSignals()),
  php: () => import('./signals/php-signals.js').then(m => new m.PhpSignals()),
  docker: () => import('./signals/docker-signals.js').then(m => new m.DockerSignals()),
  terraform: () => import('./signals/terraform-signals.js').then(m => new m.TerraformSignals()),
  'github-actions': () => import('./signals/github-actions-signals.js').then(m => new m.GithubActionsSignals()),
  cocoa: () => import('./signals/cocoapods-signals.js').then(m => new m.CocoapodsSignals()),
  swift: () => import('./signals/swift-signals.js').then(m => new m.SwiftSignals()),
  dart: () => import('./signals/dart-signals.js').then(m => new m.DartSignals()),
  elixir: () => import('./signals/elixir-signals.js').then(m => new m.ElixirSignals()),
  erlang: () => import('./signals/erlang-signals.js').then(m => new m.ErlangSignals()),
  haskell: () => import('./signals/haskell-signals.js').then(m => new m.HaskellSignals()),
  scala: () => import('./signals/scala-signals.js').then(m => new m.ScalaSignals()),
  perl: () => import('./signals/perl-signals.js').then(m => new m.PerlSignals()),
  ocaml: () => import('./signals/ocaml-signals.js').then(m => new m.OcamlSignals()),
  julia: () => import('./signals/julia-signals.js').then(m => new m.JuliaSignals()),
  r: () => import('./signals/r-signals.js').then(m => new m.RSignals()),
  c: () => import('./signals/c-signals.js').then(m => new m.CSignals()),
  haxe: () => import('./signals/haxe-signals.js').then(m => new m.HaxeSignals()),
};

export class SecuritySignalDetector {
  private cache: Map<string, ISignalDetector> = new Map();

  async detect(
    files: Array<{ path: string; language: string }>,
    rootDir: string,
    verbose: boolean = false,
  ): Promise<ManifestSecuritySignals> {
    const allSignals: SecuritySignal[] = [];

    for (const file of files) {
      const isTestFile = TEST_DIR_PATTERNS.some(pattern => file.path.includes(pattern));
      if (isTestFile) continue;

      const detectorFactory = detectorMap[file.language];
      if (!detectorFactory) continue;

      let detector = this.cache.get(file.language);
      if (!detector) {
        try {
          detector = await detectorFactory();
          this.cache.set(file.language, detector);
        } catch (err) {
          if (verbose) console.warn(`  Warning: Failed to load ${file.language} signal detector: ${err instanceof Error ? err.message : err}`);
          continue;
        }
      }

      let content: string;
      try {
        const fullPath = resolve(rootDir, file.path);
        if (!fullPath.startsWith(rootDir)) {
          if (verbose) console.warn(`  Warning: Skipping ${file.path} — resolves outside scan root`);
          continue;
        }
        content = readFileSync(fullPath, 'utf-8');
      } catch (err) {
        if (verbose) console.warn(`  Warning: Cannot read ${file.path}: ${err instanceof Error ? err.message : err}`);
        continue;
      }

      const signals = detector.detect(file.path, content);
      if (signals.length > 0) {
        allSignals.push(...signals);
        if (verbose) {
          for (const s of signals) {
            console.log(`  ⚠ [${s.severity.toUpperCase()}] ${s.file}: ${s.description}`);
          }
        }
      }
    }

    return summarizeSignals(allSignals);
  }
}
