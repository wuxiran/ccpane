# Contributing to CC-Panes

Thank you for your interest in contributing to CC-Panes! This guide will help you get started.

## Table of Contents

- [Development Environment](#development-environment)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Commit Message Format](#commit-message-format)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

## Development Environment

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 22+ | JavaScript runtime |
| Rust | 1.83+ | Backend toolchain |
| npm | 10+ | Package manager (bundled with Node.js) |

You also need the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform (e.g., WebView2 on Windows, webkit2gtk on Linux).

### Setup

```bash
# Clone the repository
git clone https://github.com/wuxiran/cc-panes.git
cd cc-panes

# Install frontend dependencies
npm install

# Start in development mode (frontend + Rust backend)
npm run tauri dev
```

### Useful Commands

```bash
# Frontend type checking
npx tsc --noEmit

# Frontend tests
npm run test:run

# Rust checks
cargo check --workspace
cargo clippy --workspace -- -D warnings
cargo fmt --all -- --check

# Rust tests
cargo test --workspace

# Build the application
npm run tauri build
```

## Project Structure

CC-Panes follows a layered architecture:

```
React Component -> Zustand Store -> Service (invoke) -> Tauri IPC -> Command -> Service -> Repository -> SQLite/FS
```

- **Frontend** (`src/`): React 19 + TypeScript + Zustand + shadcn/ui
- **Backend** (`src-tauri/src/`): Rust with Command -> Service -> Repository layers

For detailed architecture documentation, see [CLAUDE.md](./CLAUDE.md).

## Coding Standards

### General

- Keep files small (< 800 lines) and functions small (< 50 lines)
- Prefer immutable data patterns -- never mutate existing objects
- Handle errors explicitly; never silently swallow them
- Validate inputs at system boundaries

### TypeScript (Frontend)

- Use **functional components + Hooks** (no class components)
- Use **Zustand + Immer** for immutable state updates (`set((state) => { state.x = y })`)
- Wrap all `invoke()` calls in a **Service layer** -- components must not call Tauri APIs directly
- Use the `@/` path alias (maps to `src/`)
- Place test files next to the implementation file (`*.test.ts`)

### Rust (Backend)

- Use **`AppResult<T>`** (`Result<T, AppError>`) for unified error handling
- Inject services via `State<'_, Arc<XxxService>>`
- Follow the **Command -> Service -> Repository** layered separation of concerns
- Use in-memory SQLite (`:memory:`) for tests

### New Feature Workflow (7 Steps)

1. **Model**: `src-tauri/src/models/` (Rust) + `src/types/` (TS)
2. **Repository**: `src-tauri/src/repository/`
3. **Service (Rust)**: `src-tauri/src/services/`
4. **Command**: `src-tauri/src/commands/` + register in `lib.rs` invoke_handler
5. **Service (TS)**: `src/services/`
6. **Store**: `src/stores/` (Zustand + Immer)
7. **Component**: `src/components/`

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

[optional body]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `docs` | Documentation only changes |
| `test` | Adding or correcting tests |
| `chore` | Maintenance tasks (deps, config, etc.) |
| `perf` | Performance improvements |
| `ci` | CI/CD changes |

### Examples

```
feat: add workspace export functionality
fix: resolve terminal resize issue on Windows
refactor: extract pane tree helpers into separate module
docs: update development setup instructions
```

## Pull Request Process

1. **Fork** the repository and create a feature branch from `main`.
2. **Implement** your changes following the coding standards above.
3. **Test** your changes:
   - Run `npx tsc --noEmit` (frontend type check)
   - Run `npm run test:run` (frontend tests)
   - Run `cargo check --workspace` and `cargo clippy --workspace -- -D warnings` (Rust checks)
   - Run `cargo test --workspace` (Rust tests)
4. **Commit** with a clear, conventional commit message.
5. **Open a Pull Request** against `main` with:
   - A concise title (< 70 characters)
   - A summary of what changed and why
   - A test plan describing how the changes were verified
6. **Address feedback** from code review promptly.

### PR Checklist

- [ ] Code follows the project's coding standards
- [ ] All existing tests pass
- [ ] New tests added for new functionality
- [ ] TypeScript check passes (`npx tsc --noEmit`)
- [ ] Rust clippy passes (`cargo clippy --workspace -- -D warnings`)
- [ ] Commit messages follow Conventional Commits format

## Reporting Bugs

Please [open an issue](https://github.com/wuxiran/cc-panes/issues/new) with:

- **Title**: A clear, concise description of the bug
- **Environment**: OS, OS version, app version
- **Steps to reproduce**: Numbered steps to trigger the bug
- **Expected behavior**: What you expected to happen
- **Actual behavior**: What actually happened
- **Screenshots/Logs**: If applicable, attach screenshots or relevant log output

## Feature Requests

We welcome feature suggestions! Please [open an issue](https://github.com/wuxiran/cc-panes/issues/new) with:

- **Title**: A short description of the feature
- **Problem**: What problem does this feature solve?
- **Proposed solution**: How you envision the feature working
- **Alternatives considered**: Any alternative approaches you thought of

## License

By contributing to CC-Panes, you agree that your contributions will be licensed under the [GPL-3.0 License](./LICENSE).
