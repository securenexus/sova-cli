# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.1.0 — 2026-05-11

### Breaking changes — manifest schema v2.0

`SovaManifest.applications` shape changed from `Record<string, string[]>` to `Record<string, Application[]>`.
`Application` is `{ name, version, scope, rawScope?, purl?, key }`.

New top-level field `engines: Record<string, RuntimeConstraint[]>` carries runtime constraints
(e.g. Node `engines.node`, Python `python_requires`, PHP platform requirements,
R `Depends:R`) — previously misclassified as dependencies.

New top-level field `manifestSchema: "2.0"` identifies the schema version.

The SecureNexus backend rejects v1 manifests. There is no transitional v1+v2 acceptance
window — this is a hard cutover, so the SOVA CLI ≥ 1.1.0 and the SecureNexus backend v2
must be used together.

### Fixes

- `engines.node` no longer emitted as a phantom npm package.
- Each dependency carries explicit `scope` ∈ `{runtime, dev, peer, optional, build}`.
- `--no-include-dev` now actually filters dev dependencies (was a silent no-op).
- New flags: `--include-peer` / `--no-include-peer`, `--include-optional` / `--no-include-optional`.
- All 27 parsers emit Application objects with scope tags + PURLs (where ecosystem supports PURL).

### Migration

For backend integrators: branch on `manifest.manifestSchema`. Absent or any value other than `"2.0"` → reject.

For CLI consumers parsing `applications` JSON directly: each entry is now an object `{name, version, scope, rawScope?, purl?, key}` — not a `name_:_version` string. Use `entry.key` to recover the legacy string format if needed.

## [Unreleased]

### Added
- Initial open-source release
- 27 language parsers for dependency extraction
- Security signal detection across all supported languages
- Interactive and non-interactive CLI modes
- JSON manifest output compatible with SecureNexus platform
- Apache-2.0 license

### Security
- Safe XML parsing (XXE protection)
- Symlink traversal protection in file discovery
- ReDoS-safe regex patterns in signal detectors
- Path traversal prevention in signal detector file reads
