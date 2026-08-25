import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { AgentConfig } from "@opencode-ai/sdk"
import { parseJsonc } from "../shared"
import { createBuiltinCommandDefinitions } from "../features/builtin-commands/commands"
import { createSisyphusAgent } from "../agents/sisyphus"
import { createHephaestusAgent, isHephaestusSupportedModel } from "../agents/hephaestus"
import { createOracleAgent } from "../agents/oracle"
import { createLibrarianAgent } from "../agents/librarian"
import { createExploreAgent } from "../agents/explore"
import { createMultimodalLookerAgent } from "../agents/multimodal-looker"
import { createMetisAgent } from "../agents/metis"
import { createMomusAgent } from "../agents/momus"
import { createAtlasAgent } from "../agents/atlas"
import { createSisyphusJuniorAgentWithOverrides } from "../agents/sisyphus-junior/agent"
import { loadBuiltinCommands } from "../features/builtin-commands/commands"

/**
 * Materializes oh-my-openagent Ultimate surfaces as NATIVE OpenCode files so
 * both v1 and v2 hosts load them without plugin-API coupling:
 *   - agents/<name>.md     (M1) from OMO's own agent factories
 *   - commands/<name>.md   (M3) from OMO's builtin command templates
 *   - skills/<id>/         (M3) copied from packages/shared-skills/skills
 *
 * Model routing comes from ~/.omo/omo.jsonc ([opencode].agents.<name>.model),
 * falling back to the host default when unset. Hephaestus is skipped with a
 * note when the configured model is not GPT-family (OMO doctrine).
 */

export interface MaterializeAgentSpec {
  readonly name: string
  readonly config: AgentConfig
}

type OmoJsoncAgentsBlock = {
  agents?: Record<string, { model?: string }>
}
type OmoJsoncRoot = {
  opencode?: OmoJsoncAgentsBlock
  "[opencode]"?: OmoJsoncAgentsBlock
}

const SIMPLE_FACTORIES: Record<string, (model: string) => AgentConfig> = {
  sisyphus: createSisyphusAgent,
  hephaestus: createHephaestusAgent,
  oracle: createOracleAgent,
  librarian: createLibrarianAgent,
  explore: createExploreAgent,
  "multimodal-looker": createMultimodalLookerAgent,
  metis: createMetisAgent,
  momus: createMomusAgent,
  atlas: createAtlasAgent as unknown as (model: string) => AgentConfig,
}

export function resolveModelFor(
  name: string,
  omoConfig: OmoJsoncRoot | null,
  fallbackModel?: string,
): string | undefined {
  const block = omoConfig?.["[opencode]"] ?? omoConfig?.opencode
  const explicit = block?.agents?.[name]?.model
  if (typeof explicit === "string") return explicit
  return fallbackModel
}

export function buildMaterializeAgentSpecs(omoConfig: OmoJsoncRoot | null): {
  specs: MaterializeAgentSpec[]
  notes: string[]
} {
  const notes: string[] = []
  const sisyphusModel = resolveModelFor("sisyphus", omoConfig)
  const fallbackModel = sisyphusModel ?? resolveModelFor("oracle", omoConfig)

  const specs: MaterializeAgentSpec[] = []
  for (const [name, factory] of Object.entries(SIMPLE_FACTORIES)) {
    const model = resolveModelFor(name, omoConfig, fallbackModel)
    try {
      if (name === "hephaestus" && model && !isHephaestusSupportedModel(model)) {
        notes.push(`hephaestus skipped: model "${model}" is not GPT-family (OMO doctrine)`)
        continue
      }
      const config = factory(model ?? "")
      specs.push({ name, config })
    } catch (error) {
      notes.push(`${name} skipped: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  try {
    const juniorModel = resolveModelFor("sisyphus-junior", omoConfig, fallbackModel)
    const config = createSisyphusJuniorAgentWithOverrides(undefined, juniorModel)
    specs.push({ name: "sisyphus-junior", config })
  } catch (error) {
    notes.push(`sisyphus-junior skipped: ${error instanceof Error ? error.message : String(error)}`)
  }

  return { specs, notes }
}

export function renderAgentMarkdown(spec: MaterializeAgentSpec): string {
  const cfg = spec.config
  const lines: string[] = ["---"]
  lines.push(`description: ${JSON.stringify(cfg.description ?? spec.name)}`)
  if (cfg.mode) lines.push(`mode: ${cfg.mode}`)
  if (typeof cfg.model === "string") lines.push(`model: ${cfg.model}`)
  if (typeof (cfg as Record<string, unknown>).temperature === "number") {
    lines.push(`temperature: ${(cfg as Record<string, unknown>).temperature}`)
  }
  const tools = (cfg as Record<string, unknown>).tools
  if (tools && typeof tools === "object" && !Array.isArray(tools)) {
    lines.push("tools:")
    for (const [toolName, enabled] of Object.entries(tools as Record<string, unknown>)) {
      lines.push(`  ${toolName}: ${enabled === false ? "false" : "true"}`)
    }
  }
  lines.push("---")
  const body = typeof cfg.prompt === "string" ? cfg.prompt : ""
  return `${lines.join("\n")}\n\n${body}\n`
}

export function renderCommandMarkdown(command: {
  description?: string
  template: string
  argumentHint?: string
}): string {
  const lines: string[] = ["---"]
  if (command.description) lines.push(`description: ${JSON.stringify(command.description)}`)
  if (command.argumentHint) lines.push(`argument-hint: ${JSON.stringify(command.argumentHint)}`)
  lines.push("---")
  return `${lines.join("\n")}\n\n${command.template}\n`
}

function readOmoConfig(configPath: string): OmoJsoncRoot | null {
  if (!existsSync(configPath)) return null
  return parseJsonc<OmoJsoncRoot>(readFileSync(configPath, "utf-8")) ?? null
}

function copySkills(sourceDir: string, targetDir: string): number {
  if (!existsSync(sourceDir)) return 0
  let count = 0
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const destination = join(targetDir, entry.name)
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(join(sourceDir, entry.name), destination, { recursive: true })
    count++
  }
  return count
}

async function main(argv: string[]): Promise<number> {
  const flag = (name: string, fallback: string): string => {
    const index = argv.indexOf(`--${name}`)
    return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback
  }

  const repoRoot = join(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..")
  const outDir = flag("out", join(homedir(), ".config", "opencode"))
  const configPath = flag("config", join(homedir(), ".omo", "omo.jsonc"))
  const skillsSource = flag(
    "skills-source",
    join(repoRoot, "packages", "shared-skills", "skills"),
  )

  const omoConfig = readOmoConfig(configPath)
  const { specs, notes } = buildMaterializeAgentSpecs(omoConfig)

  const agentsDir = join(outDir, "agents")
  mkdirSync(agentsDir, { recursive: true })
  for (const spec of specs) {
    const target = join(agentsDir, `${spec.name}.md`)
    writeFileSync(target, renderAgentMarkdown(spec))
  }

  const commandsDir = join(outDir, "commands")
  mkdirSync(commandsDir, { recursive: true })
  const definitions = loadBuiltinCommands(undefined, { teamModeEnabled: true })
  let commandCount = 0
  for (const [name, definition] of Object.entries(definitions)) {
    writeFileSync(join(commandsDir, `${name}.md`), renderCommandMarkdown(definition))
    commandCount++
  }

  const skillsDir = join(outDir, "skills")
  mkdirSync(skillsDir, { recursive: true })
  const skillCount = copySkills(skillsSource, skillsDir)

  console.log(`[v2-materialize] agents: ${specs.length} written`)
  console.log(`[v2-materialize] commands: ${commandCount} written`)
  console.log(`[v2-materialize] skills: ${skillCount} copied`)
  for (const note of notes) console.log(`[v2-materialize] note: ${note}`)
  return 0
}

const invokedDirectly =
  process.argv[1] != null &&
  fileURLToPath(import.meta.url) === process.argv[1].replace(/\.js$/, ".ts")

if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error)
      process.exit(1)
    },
  )
}
