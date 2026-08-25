# 01 — Install the local version (OpenCode v1 + v2)

## 0. Prerequisites

- Bun 1.4.x on PATH (`bun --version`). npm alone is NOT enough: this monorepo uses bun workspaces and `bun build`.
- OpenCode v1 (`opencode`) ≥ 1.4.0, and/or OpenCode v2 beta (`opencode2`).
- ~1 GB free on the drive holding this clone. If installs fail with `ENOSPC`, redirect extraction staging to a roomy drive:
  ```powershell
  $env:TEMP = "D:\some\tmp"; $env:TMP = $env:TEMP
  ```

## 1. Get the code

```powershell
git clone https://github.com/marlonmuthiani/oh-my-openagent.git
cd oh-my-openagent
```

## 2. Install dependencies (no lifecycle scripts)

```powershell
bun install --ignore-scripts
```

Why `--ignore-scripts`: the root `prepare` script runs the full maintainer build (materialize frontends,
lsp-daemon `npm ci`) which is irrelevant for consuming the plugin and is a known local failure point.
Upstream's own CI uses `--ignore-scripts` for its build/typecheck jobs too.

## 3. Build both artifacts

```powershell
# V1 host bundle (classic named exports)
bun run build          # -> dist/index.js

# V2 host bundle (default-export {id, setup})
bun run build:v2       # -> dist/v2/index.js
```

## 4a. Register for OpenCode v1 (`plugin` key)

In `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugin": [
    "oh-my-openagent@latest"   // or an absolute path to dist/index.js for this fork
  ]
}
```

## 4b. Register for OpenCode v2 (`plugins` key)

```jsonc
{
  "plugins": [
    "D:\\path\\to\\oh-my-openagent\\dist\\v2\\index.js"
  ]
}
```

Notes:
- Absolute paths are the reliable registration form; npm specifiers require the package to publish a
  V2 entrypoint (`dist/v2/index.js` + default export `{id, setup}`) — upstream has not shipped one yet.
- Keep BOTH keys if you use both hosts. v2 reads/merges the legacy `plugin` key too; never delete it while v1 is in use.

## 5. Materialize Ultimate surfaces (agents / commands / skills)

```powershell
bun packages/omo-opencode/src/cli/v2-materialize.ts `
  --out "$env:USERPROFILE\.config\opencode" `
  --config "$env:USERPROFILE\.omo\omo.jsonc"
```

Writes:
- `agents/<name>.md` — Sisyphus, Oracle, Metis, Momus, Atlas, Explore, Librarian, Multimodal-Looker, sisyphus-junior
  (real factory prompts; `model:` taken from your `[opencode].agents` overrides)
- `commands/<name>.md` — goal, start-work, refactor, handoff, remove-ai-slops, hyperplan, stop-continuation
- `skills/<id>/` — all shared skills (ast-grep, debugging, frontend, ulw-plan, …)

Hephaestus is auto-skipped unless the configured model is GPT-family (OMO doctrine).

## 6. Restart + verify

```powershell
opencode2 service restart
opencode2 api get /api/plugin     # expect {"id":"oh-my-openagent","status":"active","tui":true}
```

Also check `%LOCALAPPDATA%\Temp\oh-my-opencode.log` for `[v2-setup]` / `[v2-event]` lines.

## Rollback

Every config write path backs up first. To unregister: remove the entry (or whole key) from
`opencode.json(c)` and restart. Nothing under `~/.omo` needs to change.
