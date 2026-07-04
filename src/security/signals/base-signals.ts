/**
 * Base signal detection shared across languages.
 */

import { createSignal, type SecuritySignal } from '../types.js';

export function detectGitUrlDependency(
  file: string, language: string, depString: string
): SecuritySignal | null {
  if (/git(\+https?|@|:\/\/)/.test(depString)) {
    return createSignal(file, language, 'dependency-confusion', 'git-url-dependency',
      'Dependency installed from git URL — bypasses registry integrity checks',
      'high', depString);
  }
  return null;
}

export function detectUrlDependency(
  file: string, language: string, depString: string
): SecuritySignal | null {
  if (/^https?:\/\//.test(depString) && !depString.includes('registry')) {
    return createSignal(file, language, 'dependency-confusion', 'url-dependency',
      'Dependency installed from direct URL — bypasses registry integrity checks',
      'high', depString);
  }
  return null;
}

export function detectObfuscationInScript(
  file: string, language: string, scriptContent: string
): SecuritySignal[] {
  const signals: SecuritySignal[] = [];

  if (/\beval\s*\(/.test(scriptContent) || /\bexec\s*\(/.test(scriptContent) || /\bFunction\s*\(/.test(scriptContent)) {
    signals.push(createSignal(file, language, 'obfuscation', 'eval-usage',
      'Script uses eval/exec/Function — can execute arbitrary code',
      'critical', scriptContent));
  }

  // The `base64` literal already covers Buffer.from(..., 'base64') and friends;
  // the old `Buffer\.from\(.+,...` alternative was redundant and used an unbounded `.+`.
  if (/base64|atob|btoa|b64decode/.test(scriptContent)) {
    signals.push(createSignal(file, language, 'obfuscation', 'base64-encoding',
      'Script contains base64 encoding/decoding — possible obfuscation',
      'high', scriptContent));
  }

  if (/\b(curl|wget|fetch|http\.get|https\.get|urllib|requests\.get)\b/.test(scriptContent)) {
    signals.push(createSignal(file, language, 'obfuscation', 'network-in-install',
      'Script makes network calls — may download malicious payloads',
      'critical', scriptContent));
  }

  if (/process\.env|os\.environ|ENV\[|System\.getenv|getenv\(/.test(scriptContent)) {
    signals.push(createSignal(file, language, 'obfuscation', 'env-access',
      'Script reads environment variables — possible credential exfiltration',
      'high', scriptContent));
  }

  if (/os\.system|subprocess|child_process|Runtime\.exec|system\(/.test(scriptContent)) {
    signals.push(createSignal(file, language, 'obfuscation', 'shell-execution',
      'Script executes shell commands',
      'critical', scriptContent));
  }

  return signals;
}

export function detectMissingMetadata(
  file: string, language: string, json: Record<string, unknown>
): SecuritySignal[] {
  const signals: SecuritySignal[] = [];

  if (!json.author && !json.authors && !json.maintainer && !json.maintainers) {
    signals.push(createSignal(file, language, 'suspicious-metadata', 'missing-author',
      'Package has no author/maintainer information', 'low'));
  }

  if (!json.repository && !json.homepage && !json.url) {
    signals.push(createSignal(file, language, 'suspicious-metadata', 'missing-repository',
      'Package has no repository or homepage URL', 'low'));
  }

  return signals;
}

const SECRET_PATTERNS: Array<{ pattern: RegExp; type: string; description: string }> = [
  {
    pattern: /AKIA[0-9A-Z]{16}/,
    type: 'aws-access-key',
    description: 'Potential AWS access key ID detected',
  },
  {
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    type: 'private-key',
    description: 'Private key detected in source file',
  },
  {
    pattern: /(?:API_KEY|APIKEY|SECRET_KEY|SECRET|PASSWORD|PASSWD|TOKEN|AUTH_TOKEN)\s*[=:]\s*(['"])[^'"]{8,}\1/i,
    type: 'hardcoded-credential',
    description: 'Potential hardcoded credential detected',
  },
  {
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    type: 'jwt-token',
    description: 'JWT token detected in source file',
  },
];

export function detectHardcodedSecrets(
  file: string, language: string, content: string
): SecuritySignal[] {
  const signals: SecuritySignal[] = [];
  for (const { pattern, type, description } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      signals.push(createSignal(file, language, 'hardcoded-secret', type, description, 'high'));
    }
  }
  return signals;
}

export function detectWildcardVersion(
  file: string, language: string, pkg: string, version: string
): SecuritySignal | null {
  if (version === '*' || version === 'latest' || version === '') {
    return createSignal(file, language, 'suspicious-metadata', 'wildcard-version',
      `Unpinned/wildcard version for ${pkg}`,
      'medium', `${pkg}: ${version}`);
  }
  return null;
}
