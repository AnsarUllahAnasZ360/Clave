# Contributing to Clave

Thanks for your interest in contributing to Clave! This guide will help you get started.

## Prerequisites

- [Bun](https://bun.sh) (runtime and package manager)
- [Node.js](https://nodejs.org) 20+
- A [Convex](https://convex.dev) account (free tier works)
- Git

## Getting Started

1. **Fork and clone** the repository:
   ```bash
   git clone https://github.com/<your-username>/Clave.git
   cd Clave
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env.local
   ```
   Fill in the required values. At minimum you need:
   - `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` (from `npx convex dev`)
   - Auth provider credentials (Google OAuth or password-based)

4. **Start the dev server**:
   ```bash
   bun run dev
   ```
   This launches both Convex and Next.js on port 4000.

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. Make your changes following the project conventions (see below).

3. Run checks before committing:
   ```bash
   bun run lint        # Biome linting
   bun run typecheck   # TypeScript
   bun run test:unit   # Unit tests
   ```

4. Add a changeset for user-facing changes:
   ```bash
   bun run changeset
   ```

5. Open a pull request against `main`.

## Branch Naming

- `feat/description` - New features
- `fix/description` - Bug fixes
- `chore/description` - Maintenance
- `docs/description` - Documentation

## Commit Messages

Use conventional commits:

```
feat: add user authentication
fix: resolve login redirect issue
chore: update dependencies
docs: add API documentation
refactor: simplify auth flow
test: add login tests
```

## Project Conventions

- **Formatting/Linting**: Biome handles both. Run `bun run lint:fix` to autofix.
- **Components**: Use [shadcn/ui](https://ui.shadcn.com) components. Do not create custom UI primitives.
- **Icons**: Use Lucide React. Do not add new icon libraries.
- **Styling**: Tailwind CSS 4, dark-mode first. Sienna is the only brand accent color.
- **Backend**: All backend code lives in `convex/`. Always check auth in mutations.
- **Testing**: Write tests for features you change. Run only your feature's tests locally.
- **TypeScript**: Strict mode enabled. Server Components by default.

## Required Accounts for Full Features

Some features require third-party accounts:

| Feature | Service | Required? |
|---------|---------|-----------|
| Backend | [Convex](https://convex.dev) | Yes |
| Auth (Google) | Google Cloud Console | Optional |
| AI features | Azure OpenAI | Optional |
| File uploads | [UploadThing](https://uploadthing.com) | Optional |
| Billing | [Stripe](https://stripe.com) | Optional |
| Email | [Resend](https://resend.com) | Optional |

See `.env.example` for all configuration options.

## Pull Request Guidelines

- Keep PRs focused on a single concern
- Include tests for new features or bug fixes
- Include a changeset for user-facing changes
- Ensure CI passes (lint, typecheck, tests)
- Do not force-push after review has started

## Reporting Issues

- Use [GitHub Issues](https://github.com/AnsarUllahAnasZ360/Clave/issues) for bugs and feature requests
- For security vulnerabilities, see [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
