/**
 * Java/Kotlin/Groovy security signal detection (pom.xml, build.gradle, build.gradle.kts).
 */

import type { SecuritySignal, ISignalDetector } from '../types.js';
import { createSignal } from '../types.js';
import { detectObfuscationInScript } from './base-signals.js';

export class JavaSignals implements ISignalDetector {
  language = 'java';

  detect(filePath: string, content: string): SecuritySignal[] {
    const base = filePath.split('/').pop() ?? '';
    const signals: SecuritySignal[] = [];

    if (base === 'pom.xml') signals.push(...this.detectPom(filePath, content));
    else if (base === 'build.gradle' || base === 'build.gradle.kts') signals.push(...this.detectGradle(filePath, content));

    signals.push(...this.detectSourcePatterns(filePath, content));
    return signals;
  }

  private detectPom(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // Critical: exec-maven-plugin
    if (content.includes('exec-maven-plugin')) {
      signals.push(createSignal(file, this.language, 'install-script', 'exec-maven-plugin',
        'POM uses exec-maven-plugin -- can execute arbitrary commands during build',
        'critical'));
    }

    // Critical: maven-antrun-plugin
    if (content.includes('maven-antrun-plugin')) {
      signals.push(createSignal(file, this.language, 'install-script', 'antrun-plugin',
        'POM uses maven-antrun-plugin -- executes Ant tasks with shell access',
        'critical'));
    }

    // High: non-central repository
    const repoPattern = /<repository>\s*[\s\S]*?<url>([^<]+)<\/url>[\s\S]*?<\/repository>/g;
    let match;
    while ((match = repoPattern.exec(content)) !== null) {
      const url = match[1];
      if (!url.includes('repo.maven.apache.org') && !url.includes('central.maven.org') && !url.includes('repo1.maven.org')) {
        signals.push(createSignal(file, this.language, 'dependency-confusion', 'non-central-repo',
          `POM declares non-central repository: ${url}`,
          'high', match[0].substring(0, 200)));
      }
    }

    return signals;
  }

  private detectGradle(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // Critical: Exec task type
    if (/type\s*[:=]\s*Exec\b/.test(content) || /Exec::class/.test(content)) {
      signals.push(createSignal(file, this.language, 'install-script', 'gradle-exec-task',
        'Gradle build defines Exec task -- runs arbitrary system commands',
        'critical'));
    }

    // High: buildscript block (can inject plugins from arbitrary repos)
    if (/buildscript\s*\{/.test(content)) {
      signals.push(createSignal(file, this.language, 'install-script', 'gradle-buildscript',
        'Gradle uses buildscript block -- can load plugins from arbitrary sources',
        'high'));
    }

    // High: doLast / doFirst (task action injection)
    if (/\bdoLast\s*\{/.test(content) || /\bdoFirst\s*\{/.test(content)) {
      signals.push(createSignal(file, this.language, 'install-script', 'gradle-task-action',
        'Gradle build uses doLast/doFirst -- injects code into task execution',
        'high'));
    }

    // High: custom repositories
    const hasCustomRepo = /repositories\s*\{/.test(content)
      && (/maven\s*\{/.test(content) || /url\s*[=(]/.test(content))
      && !(/mavenCentral\(\)/.test(content) && !/maven\s*\{/.test(content));
    if (hasCustomRepo) {
      signals.push(createSignal(file, this.language, 'dependency-confusion', 'gradle-custom-repo',
        'Gradle declares custom Maven repositories beyond mavenCentral',
        'high'));
    }

    // General obfuscation
    signals.push(...detectObfuscationInScript(file, this.language, content));

    return signals;
  }

  private detectSourcePatterns(file: string, content: string): SecuritySignal[] {
    const signals: SecuritySignal[] = [];

    // unsafe-deserialization
    if (/\bObjectInputStream\b/.test(content) || /\breadObject\s*\(/.test(content)) {
      signals.push(createSignal(file, this.language, 'unsafe-deserialization', 'java-deserialization',
        'Java ObjectInputStream — unsafe deserialization risk', 'critical'));
    }

    // code-injection
    if (/Runtime\.getRuntime\(\)\.exec\s*\(/.test(content)) {
      signals.push(createSignal(file, this.language, 'code-injection', 'runtime-exec',
        'Runtime.exec() — command injection risk', 'high'));
    }

    return signals;
  }
}
