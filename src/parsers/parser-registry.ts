/**
 * Parser Registry - Maps languages to their parser implementations.
 *
 * Parsers are lazily loaded to avoid importing unused parsers.
 */

import type { IParser } from '../types/parser.js';

type ParserFactory = () => Promise<IParser>;

const registry: Record<string, ParserFactory> = {
  javascript: async () => {
    const { JavaScriptParser } = await import('./javascript-parser.js');
    return new JavaScriptParser();
  },
  python: async () => {
    const { PythonParser } = await import('./python-parser.js');
    return new PythonParser();
  },
  java: async () => {
    const { JavaParser } = await import('./java-parser.js');
    return new JavaParser();
  },
  groovy: async () => {
    const { JavaParser } = await import('./java-parser.js');
    return new JavaParser();
  },
  kotlin: async () => {
    const { JavaParser } = await import('./java-parser.js');
    return new JavaParser();
  },
  rust: async () => {
    const { RustParser } = await import('./rust-parser.js');
    return new RustParser();
  },
  go: async () => {
    const { GoParser } = await import('./go-parser.js');
    return new GoParser();
  },
  dotNet: async () => {
    const { DotNetParser } = await import('./dotnet-parser.js');
    return new DotNetParser();
  },
  php: async () => {
    const { PhpParser } = await import('./php-parser.js');
    return new PhpParser();
  },
  ruby: async () => {
    const { RubyParser } = await import('./ruby-parser.js');
    return new RubyParser();
  },
  dart: async () => {
    const { DartParser } = await import('./dart-parser.js');
    return new DartParser();
  },
  docker: async () => {
    const { DockerParser } = await import('./docker-parser.js');
    return new DockerParser();
  },
  swift: async () => {
    const { SwiftParser } = await import('./swift-parser.js');
    return new SwiftParser();
  },
  elixir: async () => {
    const { ElixirParser } = await import('./elixir-parser.js');
    return new ElixirParser();
  },
  scala: async () => {
    const { ScalaParser } = await import('./scala-parser.js');
    return new ScalaParser();
  },
  c: async () => {
    const { CParser } = await import('./c-parser.js');
    return new CParser();
  },
  haskell: async () => {
    const { HaskellParser } = await import('./haskell-parser.js');
    return new HaskellParser();
  },
  perl: async () => {
    const { PerlParser } = await import('./perl-parser.js');
    return new PerlParser();
  },
  r: async () => {
    const { RParser } = await import('./r-parser.js');
    return new RParser();
  },
  julia: async () => {
    const { JuliaParser } = await import('./julia-parser.js');
    return new JuliaParser();
  },
  erlang: async () => {
    const { ErlangParser } = await import('./erlang-parser.js');
    return new ErlangParser();
  },
  ocaml: async () => {
    const { OcamlParser } = await import('./ocaml-parser.js');
    return new OcamlParser();
  },
  terraform: async () => {
    const { TerraformParser } = await import('./terraform-parser.js');
    return new TerraformParser();
  },
  html: async () => {
    const { HtmlParser } = await import('./html-parser.js');
    return new HtmlParser();
  },
  'github-actions': async () => {
    const { GithubActionsParser } = await import('./github-actions-parser.js');
    return new GithubActionsParser();
  },
  cocoa: async () => {
    const { CocoaParser } = await import('./cocoa-parser.js');
    return new CocoaParser();
  },
  haxe: async () => {
    const { HaxeParser } = await import('./haxe-parser.js');
    return new HaxeParser();
  },
};

/** Cache of instantiated parsers */
const parserCache = new Map<string, IParser>();

/**
 * Get a parser for the given language. Returns null if unsupported.
 */
export async function getParser(language: string): Promise<IParser | null> {
  if (parserCache.has(language)) {
    return parserCache.get(language)!;
  }

  const factory = registry[language];
  if (!factory) return null;

  try {
    const parser = await factory();
    parserCache.set(language, parser);
    return parser;
  } catch (err) {
    console.warn(`Warning: Failed to load parser for "${language}": ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * List all supported languages.
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(registry);
}
