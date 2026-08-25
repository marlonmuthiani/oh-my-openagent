# 02 — Agents, commands & skills (what you get and where it lives)

All three surfaces are **materialized as plain files** under your OpenCode config dir, so they load
identically on v1 (`opencode`) and v2 (`opencode2`) with zero plugin-API coupling.

## Agents — `~/.config/opencode/agents/<name>.md`

| Agent | Role | Mode |
|---|---|---|
| sisyphus | Main orchestrator (plans, delegates, drives to done) | primary |
| atlas | Todo orchestrator | subagent |
| oracle | Architecture/debugging consultant (read-only) | subagent |
| librarian | External docs/code search | subagent |
| explore | Fast internal codebase grep | subagent |
| multimodal-looker | Vision/PDF analysis | subagent |
| metis | Pre-planning consultant | subagent |
| momus | High-accuracy plan reviewer | subagent |
| hephaestus | GPT-native deep worker | *GPT-family models only* |
| sisyphus-junior | Category dispatch worker | subagent |

Each file = frontmatter (`description`, `mode`, `model`, `temperature`, `tools` restrictions) + the
**real factory system prompt** extracted from OMO's own builders.

### Model routing

Models come from `~/.omo/omo.jsonc`:

```jsonc
{
  "[opencode]": {
    "agents": {
      "sisyphus": { "model": "alibaba/deepseek-v4-flash-0731", "reasoning": "high" },
      "oracle":   { "model": "alibaba/deepseek-v4-flash-0731" }
    }
  }
}
```

- Per-agent override wins; otherwise the Sisyphus model is used as fallback.
- **Hephaestus rule**: skipped with a note unless the model is GPT-family.
- Re-run the materializer after editing omo.jsonc to refresh the files.

## Commands — `~/.config/opencode/commands/<name>.md`

`goal` · `start-work` · `refactor` · `handoff` · `remove-ai-slops` · `hyperplan` · `stop-continuation`
(team-mode addenda included). Frontmatter carries `description` / `argument-hint`; body is the template.

## Skills — `~/.config/opencode/skills/<id>/SKILL.md`

17 shared skills: ast-grep, debugging, frontend, git-master, programming, refactor, review-work,
start-work, ultimate-browsing, ulw-plan, ulw-research, visual-qa, data-scientist,
coding-agent-sessions, lsp-setup, init-deep, remove-ai-slops.

## Regenerate everything

```powershell
bun packages/omo-opencode/src/cli/v2-materialize.ts `
  --out "$env:USERPROFILE\.config\opencode" `
  --config "$env:USERPROFILE\.omo\omo.jsonc"
```

Idempotent. Project-local overrides: place a `.omo/omo.jsonc` in a project; nearest file wins.
