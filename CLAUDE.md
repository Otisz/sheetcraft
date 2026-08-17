# CLAUDE.md

The app is already running inside a docker compose container using compose. \
Use that container to run bun commands.

Otherwise download other docker images to run necessary commands, if the command is not available on the host machine.

**DO NOT INSTALL ANYTHING ON THE HOST MACHINE**

## Standards

Follow the [Bulletproof React](https://github.com/alan2207/bulletproof-react) standards as much as you can.

- File names are kebab-cased
- Features directory

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `Otisz/sheetcraft`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using the default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
