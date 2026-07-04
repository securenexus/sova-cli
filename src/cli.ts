#!/usr/bin/env node
/**
 * SOVA CLI - SecureNexus Supply Chain Orchestration & Visualization Assistant
 *
 * Enterprise-grade interactive CLI for dependency extraction.
 * Run `sova` for interactive mode, or `sova scan --path /dir` for direct mode.
 */

import { Command } from 'commander';
import { resolve, relative, basename, join } from 'node:path';
import { writeFileSync, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { scanProject } from './index.js';
import { SOVA_VERSION } from './utils/version.js';
import { theme, ok, fail } from './cli/theme.js';

// ── Brand banner ──────────────────────────────────────────────────

function printBanner(): void {
  const line = theme.brand('━'.repeat(62));

  console.log('');
  console.log(line);
  console.log('');
  console.log(`   ${theme.bold(theme.brand('███████╗'))} ${theme.bold(theme.brand('██████╗'))}  ${theme.bold(theme.brand('██╗   ██╗'))} ${theme.bold(theme.brand('█████╗'))}`);
  console.log(`   ${theme.bold(theme.brand('██╔════╝'))} ${theme.bold(theme.brand('██╔═══██╗'))}${theme.bold(theme.brand('██║   ██║'))}${theme.bold(theme.brand('██╔══██╗'))}`);
  console.log(`   ${theme.bold(theme.brand('███████╗'))} ${theme.bold(theme.brand('██║   ██║'))}${theme.bold(theme.brand('██║   ██║'))}${theme.bold(theme.brand('███████║'))}`);
  console.log(`   ${theme.bold(theme.brand('╚════██║'))} ${theme.bold(theme.brand('██║   ██║'))}${theme.bold(theme.brand('╚██╗ ██╔╝'))}${theme.bold(theme.brand('██╔══██║'))}`);
  console.log(`   ${theme.bold(theme.brand('███████║'))} ${theme.bold(theme.brand('╚██████╔╝'))} ${theme.bold(theme.brand('╚████╔╝'))} ${theme.bold(theme.brand('██║  ██║'))}`);
  console.log(`   ${theme.bold(theme.brand('╚══════╝'))}  ${theme.bold(theme.brand('╚═════╝'))}   ${theme.bold(theme.brand('╚═══╝'))}  ${theme.bold(theme.brand('╚═╝  ╚═╝'))}`);
  console.log('');
  console.log(`   ${theme.bold('Supply Chain Orchestration & Visualization Assistant')}`);
  console.log(`   ${theme.muted('by')} ${theme.bold(theme.brand('SecureNexus'))} ${theme.muted('|')} ${theme.muted('v' + SOVA_VERSION)} ${theme.muted('|')} ${theme.muted('securenexus.ai')}`);
  console.log('');
  console.log(line);
  console.log('');
}

// ── Spinner ───────────────────────────────────────────────────────

class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private interval: ReturnType<typeof setInterval> | null = null;
  private idx = 0;
  private text = '';

  start(text: string): void {
    this.text = text;
    this.idx = 0;
    process.stdout.write('\x1b[?25l'); // Hide cursor
    this.interval = setInterval(() => {
      const frame = theme.brand(this.frames[this.idx % this.frames.length]);
      process.stdout.write(`\r  ${frame} ${this.text}`);
      this.idx++;
    }, 80);
  }

  update(text: string): void {
    this.text = text;
  }

  succeed(text: string): void {
    this.stop();
    console.log(`\r  ${theme.success('✔')} ${text}`);
  }

  fail(text: string): void {
    this.stop();
    console.log(`\r  ${theme.error('✖')} ${text}`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write('\r\x1b[K'); // Clear line
    process.stdout.write('\x1b[?25h'); // Show cursor
  }
}

// ── Interactive prompts ───────────────────────────────────────────

async function promptInput(question: string, defaultVal?: string): Promise<string> {
  return new Promise((res) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const prompt = defaultVal
      ? `  ${theme.brand('?')} ${theme.bold(question)} ${theme.muted(`(${defaultVal})`)} ${theme.brand('>')} `
      : `  ${theme.brand('?')} ${theme.bold(question)} ${theme.brand('>')} `;

    rl.question(prompt, (answer: string) => {
      rl.close();
      res(answer.trim() || defaultVal || '');
    });
  });
}

// ── Interactive mode ──────────────────────────────────────────────

async function interactiveMode(): Promise<void> {
  printBanner();

  console.log(`  ${theme.bold('Welcome!')} SOVA extracts dependency information from your project`);
  console.log(`  so SecureNexus can generate a comprehensive SBOM without`);
  console.log(`  needing access to your source code.`);
  console.log('');
  console.log(theme.muted('  ─────────────────────────────────────────────────────────'));
  console.log('');

  // Prompt: Project path (the only required input)
  const pathInput = await promptInput(
    'Project path to scan',
    '.'
  );
  const projectPath = resolve(pathInput);

  if (!existsSync(projectPath)) {
    console.log('');
    console.log(`  ${theme.error('✖')} Directory not found: ${theme.bold(projectPath)}`);
    process.exit(1);
  }

  if (!statSync(projectPath).isDirectory()) {
    console.log('');
    console.log(`  ${theme.error('✖')} Not a directory: ${theme.bold(projectPath)}`);
    process.exit(1);
  }

  // Auto-defaults (no prompts)
  const outputPath = resolve(projectPath, 'sova-manifest.json');
  const includeDev = true;
  const languages: string[] | undefined = undefined;
  const verbose = false;

  console.log('');
  console.log(theme.muted('  ─────────────────────────────────────────────────────────'));
  console.log('');
  console.log(`  ${theme.bold('Scan Configuration')}`);
  console.log(`  ${theme.muted('Path        :')} ${theme.bold(projectPath)}`);
  console.log(`  ${theme.muted('Output      :')} ${theme.bold(outputPath)}`);
  console.log(`  ${theme.muted('Dev deps    :')} ${theme.success('included')}`);
  console.log(`  ${theme.muted('Languages   :')} ${theme.success('all')}`);
  console.log('');

  // Execute scan
  await executeScan({
    path: projectPath,
    output: outputPath,
    languages,
    includeDev,
    verbose,
    maxDepth: 10,
  });
}

// ── Scan execution (shared between interactive and direct mode) ───

interface ScanConfig {
  path: string;
  output: string;
  languages?: string[];
  includeDev: boolean;
  includePeer?: boolean;
  includeOptional?: boolean;
  verbose: boolean;
  maxDepth: number;
  includeSignalContent?: boolean;
  stripPaths?: boolean;
  signalLevel?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  force?: boolean;
  noSign?: boolean;
}

async function executeScan(config: ScanConfig): Promise<void> {
  const startTime = Date.now();
  const spinner = new Spinner();

  console.log('');

  // Load SOVA config
  const { loadConfig } = await import('./config/sovarc.js');
  const globalConfigDir = join(homedir(), '.sova');
  const sovaConfig = loadConfig(config.path, globalConfigDir, {
    limits: { maxDepth: config.maxDepth },
  });

  // Phase 1: Discovery
  spinner.start('Discovering dependency files...');

  try {
    const manifest = await scanProject({
      path: config.path,
      output: basename(config.output),
      languages: config.languages,
      includeDev: config.includeDev,
      includePeer: config.includePeer ?? true,
      includeOptional: config.includeOptional ?? true,
      verbose: config.verbose,
      maxDepth: config.maxDepth,
      includeSignalContent: config.includeSignalContent,
      stripPaths: config.stripPaths,
      signalLevel: config.signalLevel,
      config: sovaConfig,
      force: config.force,
      noSign: config.noSign,
    });

    const langCount = manifest.scan.languagesDetected.length;
    spinner.succeed(
      `Found ${theme.bold(String(manifest.scan.totalFiles))} files across ` +
      `${theme.bold(String(langCount))} language${langCount !== 1 ? 's' : ''}`
    );

    // Phase 2: Show what was found
    if (manifest.scan.languagesDetected.length > 0) {
      console.log('');
      console.log(`  ${theme.bold('Languages Detected')}`);

      for (const lang of manifest.scan.languagesDetected) {
        const depCount = (manifest.applications[lang] || []).length;
        const fileCount = manifest.files.filter(f => f.language === lang).length;
        const hasLock = manifest.files.some(f => f.language === lang && f.fileType === 'lockfile');

        const lockBadge = hasLock ? theme.success(' [lock]') : theme.warning(' [manifest]');
        const icon = getLanguageIcon(lang);

        console.log(
          `    ${icon} ${theme.bold(padRight(lang, 18))} ` +
          `${theme.info(padLeft(String(depCount), 5))} deps  ` +
          `${theme.muted(padLeft(String(fileCount), 3))} files` +
          `${lockBadge}`
        );
      }
    }

    // Security signals summary
    const ss = manifest.securitySignals;
    if (ss.totalSignals > 0) {
      console.log('');
      console.log(`  ${theme.warning('⚠')} ${theme.bold('Security Signals Detected:')}`);

      const sorted = [...ss.signals].sort((a, b) => {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
      });

      for (const signal of sorted.slice(0, 10)) {
        const colorFn = signal.severity === 'critical' ? theme.error
          : signal.severity === 'high' ? theme.warning
          : signal.severity === 'medium' ? theme.info
          : theme.dim;
        console.log(`    ${colorFn(signal.severity.toUpperCase().padEnd(8))} ${theme.dim(signal.file + ':')} ${signal.description}`);
      }

      if (ss.totalSignals > 10) {
        console.log(`    ${theme.dim(`... and ${ss.totalSignals - 10} more`)}`);
      }

      console.log('');
      console.log(`  ${theme.error(String(ss.critical))} critical ${theme.dim('·')} ${theme.warning(String(ss.high))} high ${theme.dim('·')} ${theme.info(String(ss.medium))} medium ${theme.dim('·')} ${theme.dim(String(ss.low) + ' low')}`);
    } else {
      console.log('');
      console.log(`  ${theme.success('✓')} No security signals detected`);
    }

    // Phase 3: Write output
    const outputAbsPath = resolve(config.output);
    const outputJson = JSON.stringify(manifest, null, 2);
    const outputBytes = Buffer.byteLength(outputJson, 'utf-8');

    // Check output size limit
    if (!config.force && outputBytes > sovaConfig.limits.maxOutputSize) {
      const { formatSize } = await import('./utils/parse-size.js');
      spinner.fail(
        `Output manifest size ${formatSize(outputBytes)} exceeds limit of ${formatSize(sovaConfig.limits.maxOutputSize)}. ` +
        `Consider narrowing scan scope or adjust via .sovarc.`,
      );
      process.exit(1);
    }

    console.log('');
    spinner.start('Writing manifest...');
    writeFileSync(outputAbsPath, outputJson, 'utf-8');
    spinner.succeed('Manifest generated successfully');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Phase 4: Summary
    console.log('');
    console.log(theme.brand('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log('');
    console.log(`  ${theme.success('✔')} ${theme.bold(theme.success('Scan Complete'))}  ${theme.muted(`(${elapsed}s)`)}`);
    console.log('');
    console.log(`    ${theme.muted('Languages      ')} ${theme.bold(manifest.scan.languagesDetected.join(', ') || 'none')}`);
    console.log(`    ${theme.muted('Files scanned  ')} ${theme.bold(String(manifest.scan.totalFiles))}`);
    console.log(`    ${theme.muted('Dependencies   ')} ${theme.bold(String(manifest.scan.totalDependencies))}`);
    console.log(`    ${theme.muted('Lock files     ')} ${manifest.scan.hasLockFiles ? theme.success('present') : theme.warning('not found')}`);
    if (manifest.integrity) {
      console.log(`    ${theme.muted('Signed         ')} ${theme.success('yes')} ${theme.muted('(keyId: ' + manifest.integrity.keyId + ')')}`);
    } else {
      console.log(`    ${theme.muted('Signed         ')} ${theme.warning('no')}`);
    }
    console.log(`    ${theme.muted('Graph edges    ')} ${theme.bold(String(Object.keys(manifest.dependencyGraph).length))}`);
    console.log('');
    console.log(`    ${theme.muted('Output file    ')} ${theme.bold(theme.brand(outputAbsPath))}`);
    console.log('');
    console.log(theme.brand('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log('');
    console.log(`  ${theme.bold('Next Step:')}`);
    console.log(`  Upload the manifest file at`);
    console.log(`  ${theme.bold(theme.brand('https://www.securenexus.ai/'))} to generate your SBOM.`);
    console.log('');
    console.log(`  ${theme.muted('Powered by')} ${theme.bold('SecureNexus SOVA')} ${theme.muted('| securenexus.ai')}`);
    console.log('');

  } catch (err) {
    spinner.fail(theme.error('Scan failed'));
    console.log('');
    console.log(`  ${theme.error('Error:')} ${err instanceof Error ? err.message : String(err)}`);
    if (config.verbose && err instanceof Error && err.stack) {
      console.log(theme.muted(err.stack));
    }
    console.log('');
    process.exit(1);
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function padRight(s: string, len: number): string {
  return s + ' '.repeat(Math.max(0, len - s.length));
}

function padLeft(s: string, len: number): string {
  return ' '.repeat(Math.max(0, len - s.length)) + s;
}

function getLanguageIcon(lang: string): string {
  const icons: Record<string, string> = {
    javascript: theme.accent('JS'),
    python: theme.info('PY'),
    java: theme.error('JV'),
    kotlin: theme.accent('KT'),
    groovy: theme.info('GR'),
    rust: theme.error('RS'),
    go: theme.brand('GO'),
    php: theme.accent('PH'),
    ruby: theme.error('RB'),
    dart: theme.info('DT'),
    swift: theme.error('SW'),
    dotNet: theme.accent('.N'),
    docker: theme.info('DK'),
    terraform: theme.accent('TF'),
    elixir: theme.accent('EX'),
    scala: theme.error('SC'),
    c: theme.info('C '),
    haskell: theme.accent('HS'),
    perl: theme.info('PL'),
    r: theme.info('R '),
    julia: theme.accent('JL'),
    erlang: theme.error('ER'),
    ocaml: theme.accent('ML'),
    html: theme.error('HT'),
    cocoa: theme.info('CO'),
    haxe: theme.accent('HX'),
    'github-actions': theme.muted('GA'),
  };
  return icons[lang] || theme.muted('??');
}

// ── CLI program ───────────────────────────────────────────────────

const program = new Command();

program
  .name('sova')
  .description('SecureNexus SOVA - Supply Chain Orchestration & Visualization Assistant')
  .version(SOVA_VERSION, '-V, --version', 'Show SOVA version');

// Direct scan command (non-interactive)
program
  .command('scan')
  .description('Scan a project for dependencies (non-interactive)')
  .option('-p, --path <dir>', 'Project root directory', '.')
  .option('--project <slug>', 'Optional project slug to tag this scan with')
  .option('-o, --output <file>', 'Output manifest file', 'sova-manifest.json')
  .option('-l, --languages <langs>', 'Comma-separated language filter')
  .option('--include-dev', 'Include dev dependencies', true)
  .option('--no-include-dev', 'Exclude dev dependencies')
  .option('--include-peer', 'Include peer dependencies', true)
  .option('--no-include-peer', 'Exclude peer dependencies')
  .option('--include-optional', 'Include optional dependencies', true)
  .option('--no-include-optional', 'Exclude optional dependencies')
  .option('-v, --verbose', 'Verbose output', false)
  .option('--max-depth <n>', 'Max directory depth', '10')
  .option('-q, --quiet', 'Minimal output (no banner)', false)
  .option('--include-signal-content', 'Include file content snippets in security signals', false)
  .option('--strip-paths', 'Replace absolute project path with "." in manifest', false)
  .option('--signal-level <level>', 'Minimum signal severity (critical|high|medium|low|info)', 'low')
  .option('--force', 'Bypass all scan size limits', false)
  .option('--no-sign', 'Skip manifest signing')
  .action(async (opts) => {
    const projectPath = resolve(opts.path);

    if (!existsSync(projectPath)) {
      console.error(`${theme.error('Error:')} Directory not found: ${projectPath}`);
      process.exit(1);
    }

    if (!opts.quiet) {
      printBanner();
    }

    const languages = opts.languages
      ? opts.languages.split(',').map((l: string) => l.trim())
      : undefined;

    await executeScan({
      path: projectPath,
      output: resolve(opts.output),
      languages,
      includeDev: opts.includeDev,
      includePeer: opts.includePeer,
      includeOptional: opts.includeOptional,
      verbose: opts.verbose,
      maxDepth: parseInt(opts.maxDepth, 10),
      includeSignalContent: opts.includeSignalContent,
      stripPaths: opts.stripPaths,
      signalLevel: opts.signalLevel as 'critical' | 'high' | 'medium' | 'low' | 'info' | undefined,
      force: opts.force,
      noSign: !opts.sign,
    });
  });

// Sign an existing manifest
program
  .command('sign')
  .description('Sign an existing SOVA manifest file')
  .argument('<manifest>', 'Path to sova-manifest.json')
  .option('--key-path <dir>', 'Custom key directory')
  .action(async (manifestPath: string, opts: { keyPath?: string }) => {
    const { readFileSync, writeFileSync } = await import('node:fs');
    const { loadConfig } = await import('./config/sovarc.js');
    const { ensureKeypair } = await import('./crypto/key-manager.js');
    const { signManifest } = await import('./crypto/signer.js');

    const absPath = resolve(manifestPath);
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(absPath, 'utf-8'));
    } catch (err) {
      console.error(`${theme.error('Error:')} Failed to read manifest: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }

    const globalConfigDir = join(homedir(), '.sova');
    const sovaConfig = loadConfig(process.cwd(), globalConfigDir);
    const keyPath = opts.keyPath || sovaConfig.signing.keyPath;
    const keypair = ensureKeypair(keyPath);

    const signed = signManifest(manifest, keypair);
    writeFileSync(absPath, JSON.stringify(signed, null, 2), 'utf-8');

    console.log(`${theme.success('✔')} Manifest signed`);
    console.log(`  ${theme.muted('keyId:')}    ${keypair.keyId}`);
    console.log(`  ${theme.muted('file:')}     ${absPath}`);
  });

// Verify a signed manifest
program
  .command('verify')
  .description('Verify the signature of a SOVA manifest')
  .argument('<manifest>', 'Path to sova-manifest.json')
  .action(async (manifestPath: string) => {
    const { readFileSync } = await import('node:fs');
    const { verifyManifest } = await import('./crypto/verifier.js');

    const absPath = resolve(manifestPath);
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(absPath, 'utf-8'));
    } catch (err) {
      console.error(`${theme.error('Error:')} Failed to read manifest: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }

    const result = verifyManifest(manifest);

    if (result.valid) {
      console.log(`${theme.success('✔')} Signature valid`);
      console.log(`  ${theme.muted('keyId:')}     ${result.keyId}`);
      console.log(`  ${theme.muted('signedAt:')}  ${result.signedAt}`);
      console.log(`  ${theme.muted('algorithm:')} ${result.algorithm}`);
    } else {
      console.log(`${theme.error('✖')} ${result.error}`);
      process.exit(1);
    }
  });

// Default: interactive mode when no command given
if (process.argv.length <= 2) {
  // User just typed `sova` with no arguments
  interactiveMode().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  program.parse();
}
