# 04 — Senpi edition (standalone `omo`)

Senpi is the **standalone** OMO edition: instead of loading as a plugin into OpenCode/Codex, it ships
a pinned Senpi engine with the full OMO extension built in. One command, no plugin registration.

## Install

```powershell
npm i -g omo-ai@beta
omo
```

- The `@beta` tag is **mandatory** — bare `npm i -g omo-ai` fails on purpose (every release is a prerelease).
- ⚠️ Do NOT install plain `omo` from npm: unrelated package, different author.
- ⚠️ If an old global oh-my-openagent/oh-my-opencode (≤ 4.19.4) owns a global `omo` bin you get EEXIST —
  uninstall that first. (This machine installs OMO locally, not globally, so you are clean.)

## What experience you get

| Aspect | Senpi reality |
|---|---|
| Host | Its own engine (pinned Senpi release), not OpenCode/Codex |
| UI | Minimal/none — CLI-first; community reports "no TUI to speak of" but stable loops and lower resource use vs OpenCode |
| Orchestration | Full OMO roles natively (no plugin API layer at all → no V1/V2 compatibility issues, ever) |
| State | `~/.omo/agent/` (`settings.json`, `auth.json`, `models.json`); legacy flat `~/.omo` adopted once via marker file |
| Override location | `OMO_CODING_AGENT_DIR` env var |

Community reports (issue #6169 thread): fewer orchestration bugs than the plugin route, noticeably
lighter resources — at the cost of leaving the OpenCode TUI ecosystem behind.

## Configure it for YOUR agents/providers

### Step 1 — credential detection & import

```powershell
omo setup
```

Three stages:
1. **Detect (read-only)** scans provider credentials from: senpi dir, **OpenCode** (`~/.local/share/opencode/auth.json`, XDG-aware), oh-my-pi (`~/.omp/agent/agent.db`), gajae-code (`~/.gjc/agent/agent.db`). Never prints values.
2. **Import (consent-gated)** copies compatible **API-key** credentials into senpi's `auth.json`
   (timestamped backup, never overwrites existing entries). **OAuth entries are reported but NOT imported.**
3. **Model report** prints provider/model availability + a ready-to-paste config snippet for custom endpoints.

### Step 2 — your specific stack

| You have | How Senpi gets it |
|---|---|
| DeepSeek via Alibaba endpoint (custom baseURL) | Not auto-imported if stored as custom provider options — paste the snippet from the setup report into senpi's model settings, or edit `~/.omo/agent/models.json` directly |
| Claude / GPT / Gemini / Kimi / MiniMax subscriptions | Import works only for plain API keys; subscription OAuth stays in each host — re-auth inside senpi where supported |
| Codex CLI credentials | Not a detect source today; keep using Codex separately with the Light edition if needed |
| Hermes / other harnesses | No integration layer — point them at the same provider APIs independently |

### Step 3 — agent-model matching

Edit `~/.omo/agent/settings.json`/`models.json` per the Agent Model Matching guide
(docs/guide/agent-model-matching.md upstream). The same dangerous-override rules apply
(don't put Explore on Opus, don't put Hephaestus on Claude).

## Uninstall

```powershell
npm uninstall -g omo-ai
```

State under `~/.omo/agent/` is left intact.
