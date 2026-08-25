# Local deploy sequence for OMO v2 full parity (run from repo root after merge)
# Usage: pwsh -File scripts\deploy-local-v2.ps1  (this file lives in repo as docs/deploy-local-v2.md guidance)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# 1. Sync merged dev
git pull origin dev

# 2. Dependencies (skip upstream's broken prepare; D:-backed staging avoids C: starvation)
$env:TEMP = "D:\fun\omo-v2-port\.tmp"
$env:TMP  = "D:\fun\omo-v2-port\.tmp"
bun install --ignore-scripts

# 3. Build the v2 plugin bundle
bun run build:v2

# 4. Materialize Ultimate surfaces natively (agents/commands/skills)
bun packages/omo-opencode/src/cli/v2-materialize.ts --out "$env:USERPROFILE\.config\opencode" --config "$env:USERPROFILE\.omo\omo.jsonc"

# 5. Restart the v2 service so it picks up everything
opencode2 service restart

# 6. Verify
Write-Host "`n=== /api/plugin (expect oh-my-openagent ACTIVE, tui:true) ==="
opencode2 api get /api/plugin
Write-Host "`n=== materialized agents ==="
Get-ChildItem "$env:USERPROFILE\.config\opencode\agents" | Select-Object Name, Length
Write-Host "`n=== materialized commands ==="
Get-ChildItem "$env:USERPROFILE\.config\opencode\commands" | Select-Object Name
Write-Host "`n=== OMO event stream (last lines) ==="
Get-Content "$env:LOCALAPPDATA\Temp\oh-my-opencode.log" -Tail 5 -ErrorAction SilentlyContinue
