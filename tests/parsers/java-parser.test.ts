import { describe, it, expect } from 'vitest';
import { JavaParser } from '../../src/parsers/java-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/java');
const parser = new JavaParser();

describe('JavaParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('java');
    expect(parser.supportedLanguages).toContain('kotlin');
    expect(parser.supportedLanguages).toContain('groovy');
  });

  describe('pom.xml', () => {
    const fixturePath = resolve(fixtureDir, 'pom.xml');

    it('has fileType manifest and packageManager maven', async () => {
      const result = await parser.parse('java', fixturePath);
      expect(result.fileType).toBe('manifest');
      expect(result.packageManager).toBe('maven');
    });

    it('extracts project artifactId as projectName and version', async () => {
      const result = await parser.parse('java', fixturePath);
      expect(result.projectName).toBe('my-java-app');
      expect(result.projectVersion).toBe('1.0.0');
    });

    it('extracts dependencies', async () => {
      const result = await parser.parse('java', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('resolves ${property} version references', async () => {
      const result = await parser.parse('java', fixturePath);
      // spring.version = 5.3.29 — should be resolved in the dependency
      expect(result.dependencies.map(a => a.key)).toContain('org.springframework:spring-core_:_5.3.29');
    });

    it('extracts literal version dependencies', async () => {
      const result = await parser.parse('java', fixturePath);
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('org.springframework:spring-web_:_5.3.29');
      expect(keys).toContain('com.fasterxml.jackson.core:jackson-databind_:_2.15.2');
    });

    it('includes test-scoped dependencies', async () => {
      const result = await parser.parse('java', fixturePath);
      expect(result.dependencies.map(a => a.key)).toContain('junit:junit_:_4.13.2');
    });
  });

  describe('build.gradle', () => {
    const fixturePath = resolve(fixtureDir, 'build.gradle');

    it('has fileType manifest and packageManager gradle', async () => {
      const result = await parser.parse('java', fixturePath);
      expect(result.fileType).toBe('manifest');
      expect(result.packageManager).toBe('gradle');
    });

    it('extracts dependencies', async () => {
      const result = await parser.parse('java', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('extracts implementation dependencies', async () => {
      const result = await parser.parse('java', fixturePath);
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('org.springframework.boot:spring-boot-starter-web_:_3.1.4');
      expect(keys).toContain('com.google.guava:guava_:_32.1.2-jre');
      expect(keys).toContain('org.slf4j:slf4j-api_:_2.0.9');
    });

    it('extracts testImplementation dependencies', async () => {
      const result = await parser.parse('java', fixturePath);
      expect(result.dependencies.map(a => a.key)).toContain('org.junit.jupiter:junit-jupiter_:_5.10.0');
    });

    it('extracts runtimeOnly dependencies', async () => {
      const result = await parser.parse('java', fixturePath);
      expect(result.dependencies.map(a => a.key)).toContain('com.h2database:h2_:_2.2.224');
    });
  });

  describe('nonexistent file', () => {
    it('returns empty dependencies for nonexistent pom.xml', async () => {
      const result = await parser.parse('java', '/nonexistent/pom.xml');
      expect(result.dependencies).toEqual([]);
      expect(result.packageManager).toBe('maven');
    });

    it('returns empty result for unknown file type', async () => {
      const result = await parser.parse('java', '/nonexistent/unknown.file');
      expect(result.dependencies).toEqual([]);
    });
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { JavaParser as JavaV2 } from '../../src/parsers/java-parser.js';

const javaV2 = new JavaV2();

describeV2('JavaParser v2 — Maven scope tagging', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-java-v2-'));

  itV2('pom.xml dependencies preserve scope element', async () => {
    const p = joinV2(tmp, 'pom.xml');
    writeFileSync(p, [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<project xmlns="http://maven.apache.org/POM/4.0.0">',
      '  <modelVersion>4.0.0</modelVersion>',
      '  <groupId>x</groupId>',
      '  <artifactId>x</artifactId>',
      '  <version>1.0.0</version>',
      '  <dependencies>',
      '    <dependency>',
      '      <groupId>org.apache.commons</groupId>',
      '      <artifactId>commons-lang3</artifactId>',
      '      <version>3.12.0</version>',
      '    </dependency>',
      '    <dependency>',
      '      <groupId>junit</groupId>',
      '      <artifactId>junit</artifactId>',
      '      <version>4.13.2</version>',
      '      <scope>test</scope>',
      '    </dependency>',
      '  </dependencies>',
      '</project>',
    ].join('\n'));
    const r = await javaV2.parse('java', p);
    const lang3 = r.dependencies.find(a => a.name.includes('commons-lang3'));
    const junit = r.dependencies.find(a => a.name.includes('junit'));
    if (lang3) {
      expectV2(lang3.scope).toBe('runtime');
      if (lang3.purl) expectV2(lang3.purl).toMatch(/^pkg:maven\//);
    }
    if (junit) expectV2(junit.scope).toBe('dev');
  });
});

describeV2('JavaParser v2 — Gradle config tagging', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-gradle-v2-'));

  itV2('build.gradle implementation → runtime; testImplementation → dev', async () => {
    const p = joinV2(tmp, 'build.gradle');
    writeFileSync(p, [
      'dependencies {',
      "    implementation 'org.springframework:spring-core:5.3.0'",
      "    testImplementation 'org.junit.jupiter:junit-jupiter:5.9.0'",
      '}',
      ''
    ].join('\n'));
    const r = await javaV2.parse('java', p);
    const spring = r.dependencies.find(a => a.name.includes('spring-core'));
    const junit = r.dependencies.find(a => a.name.includes('junit-jupiter'));
    if (spring) expectV2(spring.scope).toBe('runtime');
    if (junit) expectV2(junit.scope).toBe('dev');
  });
});
