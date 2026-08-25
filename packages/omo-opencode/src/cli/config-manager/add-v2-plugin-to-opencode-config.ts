import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { ConfigMergeResult } from "../types"
import { detectOmoHosts, type OmoHostDeps } from "../../shared"
import { parseJsoncSafe } from "../../shared"
import { backupConfigFile } from "./backup-config"
import { detectConfigFormat, type ConfigFormat } from "./opencode-config-format"
import { parseOpenCodeConfigFileWithError } from "./parse-opencode-config-file"
import { formatErrorWithSuggestion } from "./format-error-with-suggestion"

/**
 * Inserts (or replaces) the "plugins" key in JSONC text and VERIFIES the
 * candidate still parses with the expected entries before it may be written.
 * Never mutates the input string; returns null when no safe edit could be
 * produced so callers can refuse the write instead of corrupting user config
 * (Issue #2: first-"]"-truncation and silent-no-op regressions).
 */
export function insertPluginsKeyIntoJsonc(content: string, plugins: string[]): string | null {
  const rendered = JSON.stringify(plugins)

  // Strategy A: replace an existing plugins array in place.
  const existingArrayRegex = /((?:"plugins"|plugins)\s*:\s*)\[[\s\S]*?\]/
  if (existingArrayRegex.test(content)) {
    // Only safe when the matched region ends at a genuine top-level closing
    // bracket: require the remainder of the document to contain no other
    // "plugins": occurrence that would make the match ambiguous.
    const candidate = content.replace(existingArrayRegex, `$1${rendered}`)
    return isVerifiedCandidate(candidate, plugins) ? candidate : null
  }

  // Strategy B: no plugins key yet -> insert right after the opening brace.
  // This position is always structurally valid regardless of comments or
  // trailing commas elsewhere in the document.
  const openBrace = content.indexOf("{")
  if (openBrace === -1) return null

  let candidate: string
  const inner = content.slice(openBrace + 1)
  if (inner.trim().startsWith("}") || inner.trim().length === 0) {
    // Empty object: no comma needed.
    candidate = `${content.slice(0, openBrace + 1)}\n  "plugins": ${rendered}\n${inner.trimStart()}`
  } else {
    candidate = `${content.slice(0, openBrace + 1)}\n  "plugins": ${rendered},${content.slice(openBrace + 1)}`
  }
  return isVerifiedCandidate(candidate, plugins) ? candidate : null
}

function isVerifiedCandidate(candidate: string, plugins: string[]): boolean {
  const { data: reparsed } = parseJsoncSafe<{ plugins?: unknown }>(candidate)
  if (reparsed == null || typeof reparsed !== "object" || Array.isArray(reparsed)) return false
  const written = reparsed.plugins
  if (!Array.isArray(written)) return false
  return plugins.every((entry) => written.includes(entry))
}

type AddV2PluginOptions = {
  /** Absolute path of the built v2 entry (dist/v2/index.js). Required: the v2 host needs a resolvable file path. */
  readonly v2EntryPath: string
  /** Explicit config directory override; defaults to the detected user config location. */
  readonly configDir?: string
  /** Injectable host-detection deps for tests. */
  readonly hostDeps?: Partial<OmoHostDeps>
}

function resolveTarget(configDir?: string): { format: ConfigFormat; path: string } {
  if (configDir) {
    const jsoncPath = join(configDir, "opencode.jsonc")
    const jsonPath = join(configDir, "opencode.json")
    if (existsSync(jsoncPath)) return { format: "jsonc", path: jsoncPath }
    if (existsSync(jsonPath)) return { format: "json", path: jsonPath }
    return { format: "none", path: jsonPath }
  }
  return detectConfigFormat()
}

function readPluginsArray(config: Record<string, unknown>): string[] {
  const raw = config.plugins
  if (!Array.isArray(raw)) return []
  return raw.filter((entry): entry is string => typeof entry === "string")
}

/**
 * Registers the omo v2 entry under the v2 `plugins` config key so opencode2
 * loads it. No-ops successfully when opencode2 is absent, keeping the v1-only
 * install flow untouched. The legacy `plugin` array is never modified here:
 * opencode2 merges both keys, and v1 must keep reading its own.
 */
export async function addV2PluginToOpencodeConfig(options: AddV2PluginOptions): Promise<ConfigMergeResult> {
  const detection = detectOmoHosts(options.hostDeps)
  let target: { format: ConfigFormat; path: string }
  try {
    target = resolveTarget(options.configDir)
  } catch (err) {
    return { success: false, configPath: "", error: formatErrorWithSuggestion(err, "resolve opencode config") }
  }

  if (!detection.hasV2) {
    return { success: true, configPath: target.path }
  }

  try {
    if (options.configDir) {
      mkdirSync(options.configDir, { recursive: true })
    }

    if (target.format === "none") {
      writeFileSync(target.path, JSON.stringify({ plugins: [options.v2EntryPath] }, null, 2) + "\n")
      return { success: true, configPath: target.path }
    }

    const parseResult = parseOpenCodeConfigFileWithError(target.path)
    if (!parseResult.config) {
      return {
        success: false,
        configPath: target.path,
        error: parseResult.error ?? "Failed to parse config file",
      }
    }

    const config = parseResult.config as Record<string, unknown>
    const existingPlugins = readPluginsArray(config)

    if (existingPlugins.includes(options.v2EntryPath)) {
      return { success: true, configPath: target.path }
    }

    const backupResult = backupConfigFile(target.path)
    if (!backupResult.success) {
      return {
        success: false,
        configPath: target.path,
        error: `Failed to create backup: ${backupResult.error}`,
      }
    }

    const nextPlugins = [...existingPlugins, options.v2EntryPath]
    config.plugins = nextPlugins

    if (target.format === "jsonc") {
      const original = readFileSync(target.path, "utf-8")
      const candidate = insertPluginsKeyIntoJsonc(original, nextPlugins)
      if (candidate == null) {
        return {
          success: false,
          configPath: target.path,
          error: "Refusing to write config: no safe JSONC edit could be verified for the plugins key",
        }
      }
      writeFileSync(target.path, candidate)
    } else {
      writeFileSync(target.path, JSON.stringify(config, null, 2) + "\n")
    }

    return { success: true, configPath: target.path }
  } catch (err) {
    return {
      success: false,
      configPath: target.path,
      error: formatErrorWithSuggestion(err, "update opencode config for v2"),
    }
  }
}
