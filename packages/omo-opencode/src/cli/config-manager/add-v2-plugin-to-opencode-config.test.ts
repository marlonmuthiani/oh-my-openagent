import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { addV2PluginToOpencodeConfig } from "./add-v2-plugin-to-opencode-config"
import { parseJsoncSafe } from "../../shared"

const V2_ENTRY = "C:\\fake\\oh-my-openagent\\dist\\v2\\index.js"

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "omo-v2-installer-"))
}

function v2PresentDeps() {
  return {
    getV1Version: () => null,
    getV2VersionOutput: () => "opencode2 v0.0.0-beta-17759",
  }
}

function v1OnlyDeps() {
  return {
    getV1Version: () => "1.18.19",
    getV2VersionOutput: () => null,
  }
}

describe("add-v2-plugin-to-opencode-config", () => {
  describe("#given opencode2 is not installed", () => {
    test("succeeds without creating any config file", async () => {
      // given
      const dir = makeTempDir()
      // when
      const result = await addV2PluginToOpencodeConfig({
        v2EntryPath: V2_ENTRY,
        configDir: dir,
        hostDeps: v1OnlyDeps(),
      })
      // then
      expect(result.success).toBe(true)
      expect(existsSync(join(dir, "opencode.json"))).toBe(false)
      expect(existsSync(join(dir, "opencode.jsonc"))).toBe(false)
      rmSync(dir, { recursive: true, force: true })
    })
  })

  describe("#given opencode2 is installed and no config exists", () => {
    test("creates opencode.json with the plugins entry", async () => {
      // given
      const dir = makeTempDir()
      // when
      const result = await addV2PluginToOpencodeConfig({
        v2EntryPath: V2_ENTRY,
        configDir: dir,
        hostDeps: v2PresentDeps(),
      })
      // then
      expect(result.success).toBe(true)
      const written = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf-8"))
      expect(written.plugins).toEqual([V2_ENTRY])
      rmSync(dir, { recursive: true, force: true })
    })
  })

  describe("#given an existing config with other content", () => {
    test("adds the plugins key while preserving existing keys", async () => {
      // given
      const dir = makeTempDir()
      writeFileSync(
        join(dir, "opencode.json"),
        JSON.stringify({ $schema: "https://example.com/schema.json", model: "anthropic/claude-opus-5", plugin: ["oh-my-openagent@5.0.0"] }, null, 2),
      )
      // when
      const result = await addV2PluginToOpencodeConfig({
        v2EntryPath: V2_ENTRY,
        configDir: dir,
        hostDeps: v2PresentDeps(),
      })
      // then
      expect(result.success).toBe(true)
      const written = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf-8"))
      expect(written.model).toBe("anthropic/claude-opus-5")
      expect(written.plugin).toEqual(["oh-my-openagent@5.0.0"])
      expect(written.plugins).toEqual([V2_ENTRY])
      rmSync(dir, { recursive: true, force: true })
    })

    test("is idempotent across repeated installs", async () => {
      // given
      const dir = makeTempDir()
      const options = {
        v2EntryPath: V2_ENTRY,
        configDir: dir,
        hostDeps: v2PresentDeps(),
      }
      // when
      await addV2PluginToOpencodeConfig(options)
      await addV2PluginToOpencodeConfig(options)
      // then
      const written = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf-8"))
      expect(written.plugins).toEqual([V2_ENTRY])
      rmSync(dir, { recursive: true, force: true })
    })
  })

  describe("#given an existing jsonc config", () => {
    test("updates the jsonc file instead of creating a json twin", async () => {
      // given
      const dir = makeTempDir()
      writeFileSync(join(dir, "opencode.jsonc"), '{\n  // my comments\n  "model": "a/b"\n}')
      // when
      const result = await addV2PluginToOpencodeConfig({
        v2EntryPath: V2_ENTRY,
        configDir: dir,
        hostDeps: v2PresentDeps(),
      })
      // then
      expect(result.success).toBe(true)
      expect(result.configPath.endsWith("opencode.jsonc")).toBe(true)
      const content = readFileSync(join(dir, "opencode.jsonc"), "utf-8")
      expect(content).toContain("// my comments")
      expect(content).toContain('"plugins"')
      expect(existsSync(join(dir, "opencode.json"))).toBe(false)
      rmSync(dir, { recursive: true, force: true })
    })
  })

    test("replaces an existing plugins array whose strings contain brackets without truncating", async () => {
      // given
      const dir = makeTempDir()
      writeFileSync(
        join(dir, "opencode.jsonc"),
        '{\n  // c\n  "plugins": ["./a[0].ts", { "package": "./b.ts", "options": { "glob": "[a-z]" } }],\n  "model": "m/n"\n}',
      )
      // when
      const result = await addV2PluginToOpencodeConfig({
        v2EntryPath: V2_ENTRY,
        configDir: dir,
        hostDeps: v2PresentDeps(),
      })
      // then: either a safe verified write happened, or an explicit refusal — never corruption
      const content = readFileSync(join(dir, "opencode.jsonc"), "utf-8")
      if (result.success) {
        const reparsed = parseJsoncSafe<{ plugins?: string[] }>(content)
        expect(reparsed.errors).toHaveLength(0)
        expect(reparsed.data?.plugins).toContain(V2_ENTRY)
        expect(reparsed.data?.plugins).toContain("./a[0].ts")
        expect(content).toContain("[a-z]")
      } else {
        expect(result.error ?? "").toContain("Refusing to write config")
        expect(content).toBe('{\n  // c\n  "plugins": ["./a[0].ts", { "package": "./b.ts", "options": { "glob": "[a-z]" } }],\n  "model": "m/n"\n}')
      }
      rmSync(dir, { recursive: true, force: true })
    })

    test("handles trailing comma before closing brace without producing invalid JSONC", async () => {
      // given
      const dir = makeTempDir()
      writeFileSync(join(dir, "opencode.jsonc"), '{\n  "model": "m/n",\n}')
      // when
      const result = await addV2PluginToOpencodeConfig({
        v2EntryPath: V2_ENTRY,
        configDir: dir,
        hostDeps: v2PresentDeps(),
      })
      // then
      const content = readFileSync(join(dir, "opencode.jsonc"), "utf-8")
      if (result.success) {
        const reparsed = parseJsoncSafe<{ plugins?: string[]; model?: string }>(content)
        expect(reparsed.errors).toHaveLength(0)
        expect(reparsed.data?.plugins).toContain(V2_ENTRY)
        expect(reparsed.data?.model).toBe("m/n")
      } else {
        expect(result.error ?? "").toContain("Refusing to write config")
      }
      rmSync(dir, { recursive: true, force: true })
    })

    test("never reports success when no safe edit was possible (comment-after-brace)", async () => {
      // given: comment AFTER the closing brace defeats naive anchors
      const dir = makeTempDir()
      const original = '{\n  "model": "m/n"\n} // trailing note'
      writeFileSync(join(dir, "opencode.jsonc"), original)
      // when
      const result = await addV2PluginToOpencodeConfig({
        v2EntryPath: V2_ENTRY,
        configDir: dir,
        hostDeps: v2PresentDeps(),
      })
      // then: success requires plugins present AND file still parseable; failure must be explicit
      const content = readFileSync(join(dir, "opencode.jsonc"), "utf-8")
      if (result.success) {
        const reparsed = parseJsoncSafe<{ plugins?: string[] }>(content)
        expect(reparsed.errors).toHaveLength(0)
        expect(reparsed.data?.plugins).toContain(V2_ENTRY)
        expect(content).toContain("// trailing note")
      } else {
        expect(result.error ?? "").toContain("Refusing to write config")
        expect(content).toBe(original)
      }
      rmSync(dir, { recursive: true, force: true })
    })

  describe("#given a corrupt existing config", () => {
    test("fails with an error instead of destroying the file", async () => {
      // given
      const dir = makeTempDir()
      writeFileSync(join(dir, "opencode.json"), "{ not valid json !!!")
      // when
      const result = await addV2PluginToOpencodeConfig({
        v2EntryPath: V2_ENTRY,
        configDir: dir,
        hostDeps: v2PresentDeps(),
      })
      // then
      expect(result.success).toBe(false)
      expect(result.error?.length ?? 0).toBeGreaterThan(0)
      expect(readFileSync(join(dir, "opencode.json"), "utf-8")).toBe("{ not valid json !!!")
      rmSync(dir, { recursive: true, force: true })
    })
  })
})
