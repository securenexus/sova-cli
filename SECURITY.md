# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Email security@securenexus.ai with:

1. Description of the vulnerability
2. Steps to reproduce
3. Impact assessment
4. Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a timeline
for a fix within 5 business days.

## Scope

SOVA parses dependency files from user-provided directories. Security
concerns include but are not limited to:

- Path traversal beyond the scan directory
- Unsafe parsing of XML, YAML, TOML, or JSON files
- Regular expression denial of service (ReDoS)
- Sensitive data leakage in generated manifests
- Supply chain vulnerabilities in SOVA's own dependencies
