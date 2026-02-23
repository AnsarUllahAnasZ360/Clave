# Integration tests

- Use `tests/integration/**/*.test.ts(x)` for cross-module or workflow behavior.
- Prefer real process boundaries (scripts, git, CLI, service seams) over isolated unit logic.
- Keep fixtures local to each test and clean them up within the test file.
