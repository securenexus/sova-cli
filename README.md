# SOVA

**Supply Chain Orchestration & Visualization Assistant**
by [SecureNexus](https://www.securenexus.ai/)

> Extract dependency information from any project for SBOM generation.
> Supports 27 languages. Detects supply chain security signals.

## Quick Start

```bash
npm install -g @securenexus/sova
sova scan --path .
```

## What it does

SOVA scans your project's package manifests and lock files to produce a structured `sova-manifest.json`. It extracts direct and transitive dependencies per language, builds a dependency graph from lock files, and detects supply chain security signals — all without ever reading your source code. Upload the manifest to [securenexus.ai](https://www.securenexus.ai/) to generate a full SBOM and vulnerability report.

Run `sova` (no arguments) for interactive guided mode, or `sova scan --help` for all CLI options.

## Supported Languages

| Language | Manifest / Lock Files | Package Manager |
|---|---|---|
| JavaScript / Node.js | `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` | npm / yarn / pnpm |
| Python | `requirements.txt`, `Pipfile`, `pyproject.toml`, `poetry.lock`, `setup.py` | pip / pipenv / poetry |
| Java | `pom.xml`, `build.gradle`, `build.gradle.kts` | Maven / Gradle |
| Kotlin | `build.gradle.kts` | Gradle |
| Groovy | `build.gradle` | Gradle |
| Rust | `Cargo.toml`, `Cargo.lock` | Cargo |
| Go | `go.mod`, `go.sum` | Go modules |
| PHP | `composer.json`, `composer.lock` | Composer |
| Ruby | `Gemfile`, `Gemfile.lock`, `*.gemspec` | Bundler |
| Dart / Flutter | `pubspec.yaml`, `pubspec.lock` | pub |
| Swift | `Package.swift`, `Package.resolved` | SwiftPM |
| .NET (C# / F#) | `*.csproj`, `*.fsproj`, `packages.config`, `*.nuspec` | NuGet / Paket |
| Docker | `Dockerfile`, `docker-compose.yml` | Docker |
| Terraform | `*.tf` | Terraform providers |
| Elixir | `mix.exs`, `mix.lock` | Mix / Hex |
| Scala | `build.sbt` | sbt |
| C / C++ | `Makefile`, `CMakeLists.txt`, `conanfile.txt`, `vcpkg.json` | Conan / vcpkg |
| Haskell | `*.cabal`, `package.yaml`, `stack.yaml` | Cabal / Stack |
| Perl | `Makefile.PL`, `cpanfile`, `META.json` | CPAN |
| R | `DESCRIPTION`, `renv.lock` | CRAN / renv |
| Julia | `Project.toml`, `Manifest.toml` | Pkg |
| Erlang | `rebar.config`, `rebar.lock` | Rebar3 |
| OCaml | `*.opam`, `dune-project` | opam / dune |
| HTML (CDN scripts) | `*.html`, `*.htm` | CDN |
| Cocoa (iOS / macOS) | `Podfile`, `Podfile.lock`, `Cartfile` | CocoaPods / Carthage |
| Haxe | `haxelib.json` | haxelib |
| GitHub Actions | `.github/workflows/*.yml` | GitHub Actions marketplace |

## Security Signals

SOVA detects ten categories of supply chain attack patterns in manifest and lock files:

- **install-script** — lifecycle hooks that execute code at install time
- **native-code** — native binary compilation declarations
- **dependency-confusion** — package names vulnerable to registry substitution attacks
- **suspicious-metadata** — missing descriptions, version `0.0.0`, empty author fields
- **obfuscation** — base64/hex-encoded payloads in manifest scripts
- **unsafe-deserialization** — dependencies on libraries with known unsafe deserializers
- **code-injection** — dynamic code execution enablers declared as dependencies
- **unsafe-archive-extraction** — archive extraction without path traversal protection
- **unbounded-resource** — XML/regex parsers without resource limits
- **hardcoded-secret** — API keys or tokens embedded in manifest files

Signals are reported with severity levels: `critical`, `high`, `medium`, `low`, `info`.

## Use as Library

```typescript
import { scanProject } from '@securenexus/sova';

const manifest = await scanProject({ path: '/path/to/project' });
console.log(manifest.scan.totalDependencies); // e.g. 312
console.log(manifest.securitySignals.critical); // e.g. 0
```

The package ships full TypeScript type definitions. Run `sova scan --help` for all CLI options.

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, or jump straight to:
- [Adding a parser](src/parsers/_template/TEMPLATE-parser.ts) — copy this template to add a new language
- [Adding a signal detector](src/security/signals/_template/TEMPLATE-signals.ts) — copy this template to add a new security rule

## License

Apache-2.0 — see [LICENSE](LICENSE)
