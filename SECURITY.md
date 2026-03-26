# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | Yes                |

## Reporting a Vulnerability

If you discover a security vulnerability in Clave, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email **security@goclave.app** with:

1. A description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if any)

We will acknowledge your report within 48 hours and aim to provide a fix within 7 days for critical issues.

## Security Practices

- All secrets and API keys must be stored in environment variables, never in source code
- Authentication is required on all mutations and actions that modify data
- Input validation is enforced on all user-facing API routes
- Security headers (HSTS, X-Frame-Options, X-Content-Type-Options) are set on all responses
- Dependencies are regularly audited and updated

## Disclosure Policy

We follow coordinated disclosure. Once a fix is available, we will:

1. Release the patch
2. Credit the reporter (unless they prefer anonymity)
3. Publish a brief advisory if the issue is significant
