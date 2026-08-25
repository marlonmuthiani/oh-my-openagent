# Oh-My-OpenAgent (OMO) — Local Fork User Manual

This manual covers **your fork**: `marlonmuthiani/oh-my-openagent` (upstream `code-yeongyu/oh-my-openagent`
+ adopted V2 foundation PR #7104 + full M1–M7 parity roadmap, merged via PRs #1 and #4).

## Editions at a glance

| Edition | What it is | Where you run it | Status here |
|---|---|---|---|
| **Ultimate (plugin)** | Full OMO as a plugin inside OpenCode v1/v2 | `opencode` / `opencode2` | ✅ built from this fork |
| **Light (Codex)** | Portable subset for OpenAI Codex CLI | `codex` | not used |
| **Senpi (standalone)** | Native `omo` command with its own engine | standalone terminal | see [04-senpi-edition.md](04-senpi-edition.md) |

## Guides

1. [Install the local version](01-install-local-version.md) — build from this clone and wire it into OpenCode v1 and/or v2.
2. [Agents, commands & skills](02-agents-commands-skills.md) — what gets materialized, where files land, model routing.
3. [Multi-agent compatibility](03-multi-agent-compat.md) — OpenCode v1/v2, Codex CLI, Claude Code compat layer, custom harnesses (DeepSeek endpoints etc.).
4. [Senpi edition](04-senpi-edition.md) — the standalone `omo` command: install, experience, configuration.

## Fast facts

- **Single source of truth for models/routing**: `~/.omo/omo.jsonc`, settings inside the `[opencode]` block.
- **Native artifacts beat plugin-API coupling**: agents/commands/skills are emitted as plain `.md`/directories that BOTH OpenCode hosts discover automatically.
- **Verify anytime**: `bunx oh-my-openagent doctor` · `opencode2 api get /api/plugin`.
- **Full deploy sequence**: [`docs/deploy-local-v2.md`](../docs/deploy-local-v2.md).
