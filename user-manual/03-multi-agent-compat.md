# 03 — Multi-agent compatibility (OpenCode v1/v2, Codex, Claude Code, custom harnesses)

## OpenCode v1 vs v2 — one fork serves both

| Concern | opencode (v1) | opencode2 (v2 beta) |
|---|---|---|
| Agent prompts/models | ✅ full registry + dynamic delegation tables | ✅ via materialized markdown (static prompts) |
| Slash commands | ✅ plugin-registered + files | ✅ native command files |
| Skills | ✅ | ✅ native discovery |
| Team Mode / tmux viz | ✅ full | ⚠️ core tools only (`omo_team_*`) |
| Compaction preservation / IntentGate | ✅ | ❌ no host hook yet |
| Config keys read | `plugin[]`, `tui.json` | `plugin[]`+`plugins[]` merged, `cli.json` |

Both binaries read the same `~/.config/opencode/opencode.json(c)`; v2 normalizes legacy fields
in memory without rewriting them. Keep the v1 `plugin[]` key while v1 remains installed.

## Codex CLI coexistence

- The **Light edition** (`npx lazycodex-ai install`) targets Codex separately and writes only under
  `~/.codex/`. It never touches OpenCode config — safe alongside this fork.
- Shared state to know about: `~/.omo/` runtime dirs are used by Ultimate; Light uses
  `~/.codex/plugins/cache/sisyphuslabs/`.

## Claude Code compatibility layer

Ultimate includes a compat layer that reads Claude Code paths for hooks/commands/skills/MCPs/plugins:
`~/.claude/*`, `.claude/*`, `~/.claude.json`. Toggle per-surface from `~/.omo/omo.jsonc`:

```jsonc
{ "claude_code": { "mcp": false, "commands": true, "skills": true, "agents": false } }
```

This means Claude Code setups can feed the same content into OpenCode hosts.

## Custom harnesses / endpoints (DeepSeek-style)

Model routing is just strings of the form `provider/model` resolved by OpenCode's provider config.
To use a custom DeepSeek-style endpoint:

1. Declare the provider in `~/.config/opencode/opencode.json(c)` (`provider.<id>` with `npm`,
   `options.baseURL`, `options.apiKey`).
2. Reference it anywhere as `<id>/<model>` — in `~/.omo/omo.jsonc` agent overrides, or directly in
   agent markdown frontmatter after re-materializing.

The same provider entries work on v1 and v2 (v2 normalizes V1 provider syntax).

## Other harnesses (Hermes etc.)

Anything that speaks MCP can consume the same servers OMO provisions (codegraph, git-bash, LSP tools)
— register them per-harness in that harness's own config. Anything that reads AGENTS.md/skills-md
can share the materialized skill directories directly.
