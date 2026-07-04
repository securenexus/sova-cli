import { describe, it, expect } from 'vitest';
import { ScalaParser } from '../../src/parsers/scala-parser.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixtureDir = resolve(__dirname, '../fixtures/scala');
const parser = new ScalaParser();

describe('ScalaParser', () => {
  it('has correct supported languages', () => {
    expect(parser.supportedLanguages).toContain('scala');
  });

  describe('build.sbt', () => {
    const fixturePath = resolve(fixtureDir, 'build.sbt');

    it('extracts project metadata', async () => {
      const result = await parser.parse('scala', fixturePath);
      expect(result.projectName).toBe('my-scala-project');
      expect(result.projectVersion).toBe('1.0.0');
    });

    it('extracts dependencies', async () => {
      const result = await parser.parse('scala', fixturePath);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('includes akka-actor with group:artifact format', async () => {
      const result = await parser.parse('scala', fixturePath);
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('com.typesafe.akka:akka-actor_:_2.8.5');
    });

    it('includes circe-core', async () => {
      const result = await parser.parse('scala', fixturePath);
      const keys = result.dependencies.map(a => a.key);
      expect(keys).toContain('io.circe:circe-core_:_0.14.6');
    });

    it('has packageManager sbt and fileType manifest', async () => {
      const result = await parser.parse('scala', fixturePath);
      expect(result.packageManager).toBe('sbt');
      expect(result.fileType).toBe('manifest');
    });
  });

  it('returns empty for nonexistent file', async () => {
    const result = await parser.parse('scala', '/nonexistent/build.sbt');
    expect(result.dependencies).toEqual([]);
  });
});

import { describe as describeV2, it as itV2, expect as expectV2 } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join as joinV2 } from 'node:path';
import { tmpdir as tmpdirV2 } from 'node:os';
import { ScalaParser as ScalaV2 } from '../../src/parsers/scala-parser.js';

const scV2 = new ScalaV2();

describeV2('ScalaParser v2 — scope tagging', () => {
  const tmp = mkdtempSync(joinV2(tmpdirV2(), 'sova-sc-v2-'));

  itV2('build.sbt: % "test" or % Test → dev; default → runtime', async () => {
    const p = joinV2(tmp, 'build.sbt');
    writeFileSync(p, [
      'name := "x"',
      'version := "0.1.0"',
      'libraryDependencies += "com.typesafe.akka" %% "akka-actor" % "2.6.0"',
      'libraryDependencies += "org.scalatest" %% "scalatest" % "3.2.0" % "test"',
      'libraryDependencies += "io.spray" %% "spray-json" % "1.3.6" % Test',
      ''
    ].join('\n'));
    const r = await scV2.parse('scala', p);
    const akka = r.dependencies.find(a => a.name.includes('akka-actor'));
    const scalatest = r.dependencies.find(a => a.name.includes('scalatest'));
    const sprayjson = r.dependencies.find(a => a.name.includes('spray-json'));
    if (akka) expectV2(akka.scope).toBe('runtime');
    if (scalatest) expectV2(scalatest.scope).toBe('dev');
    if (sprayjson) expectV2(sprayjson.scope).toBe('dev');
  });
});
