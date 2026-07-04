# Contributing to SOVA

Thank you for contributing! SOVA is an open-source project by SecureNexus.

## Getting Started

```bash
git clone https://github.com/securenexus/sova.git
cd sova
npm install          # also runs `npm run build` via prepare script
npm test             # run the test suite
```

## Development

```bash
npm run dev          # watch mode (recompile on change)
npm run test:watch   # vitest in watch mode
npm run lint         # type-check without emitting
```

## Pull Request Process

1. Fork the repository and create a feature branch
2. Write tests for your changes (TDD preferred)
3. Ensure all tests pass: `npm test`
4. Ensure type-check passes: `npm run lint`
5. Sign your commits with DCO: `git commit -s`
6. Open a PR against `main`

## DCO Sign-Off

We use the [Developer Certificate of Origin](https://developercertificate.org/).
Every commit must include a `Signed-off-by` line:

```
Signed-off-by: Your Name <your.email@example.com>
```

Use `git commit -s` to add this automatically.

## Adding a New Language Parser

See [docs/contributing/adding-a-parser.md](docs/contributing/adding-a-parser.md)
for a step-by-step guide with template files.

## Adding Signal Detector Rules

See [docs/contributing/adding-a-signal-detector.md](docs/contributing/adding-a-signal-detector.md)
for a step-by-step guide.

## Code Style

- TypeScript with `strict: true`
- No `any` types — use `unknown` and narrow
- Prefer `import` over `require`
- All public API exports must have JSDoc
- Follow existing patterns (check similar parsers/signals)

## Reporting Issues

- **Bugs:** Use the bug report template
- **Features:** Use the feature request template
- **New language support:** Use the parser request template
- **Security:** See SECURITY.md (do not open public issues)
