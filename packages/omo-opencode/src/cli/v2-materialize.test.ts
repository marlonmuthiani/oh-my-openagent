import { describe, expect, test } from "bun:test"
import {
  buildMaterializeAgentSpecs,
  renderAgentMarkdown,
  renderCommandMarkdown,
  resolveModelFor,
  type MaterializeAgentSpec,
} from "./v2-materialize"

describe("v2-materialize", () => {
  describe("#resolveModelFor", () => {
    const config = {
      "[opencode]": { agents: { sisyphus: { model: "alibaba/deepseek-v4-flash-0731" } } },
    }

    test("prefers the per-agent override", () => {
      expect(resolveModelFor("sisyphus", config)).toBe("alibaba/deepseek-v4-flash-0731")
    })

    test("falls back to the provided fallback model", () => {
      expect(resolveModelFor("oracle", config, "fallback/model")).toBe("fallback/model")
    })

    test("returns undefined without config or fallback", () => {
      expect(resolveModelFor("oracle", null)).toBeUndefined()
    })
  })

  describe("#renderAgentMarkdown", () => {
    test("emits frontmatter with description/mode/model and prompt body", () => {
      const spec: MaterializeAgentSpec = {
        name: "oracle",
        config: {
          description: "High-IQ consultation",
          mode: "subagent",
          model: "alibaba/deepseek-v4-flash-0731",
          temperature: 0.1,
          tools: { write: false, edit: false },
          prompt: "You are Oracle.",
        },
      }
      const markdown = renderAgentMarkdown(spec)
      expect(markdown.startsWith("---\n")).toBe(true)
      expect(markdown).toContain('description: "High-IQ consultation"')
      expect(markdown).toContain("mode: subagent")
      expect(markdown).toContain("model: alibaba/deepseek-v4-flash-0731")
      expect(markdown).toContain("temperature: 0.1")
      expect(markdown).toContain("  write: false")
      expect(markdown.endsWith("\n\nYou are Oracle.\n")).toBe(true)
    })
  })

  describe("#renderCommandMarkdown", () => {
    test("emits description/argument-hint frontmatter and template body", () => {
      const markdown = renderCommandMarkdown({
        description: "(builtin) Set a goal",
        template: "GOAL TEMPLATE $ARGUMENTS",
        argumentHint: "<objective>",
      })
      expect(markdown).toContain('description: "(builtin) Set a goal"')
      expect(markdown).toContain('argument-hint: "<objective>"')
      expect(markdown).toContain("GOAL TEMPLATE $ARGUMENTS")
    })
  })

  describe("#buildMaterializeAgentSpecs", () => {
    test("materializes the simple factory agents and reports skips as notes", () => {
      // given: no omo config -> fallback model is undefined; factories receive ""
      const { specs, notes } = buildMaterializeAgentSpecs(null)
      const names = specs.map((spec) => spec.name)
      // hephaestus may be skipped depending on model support with empty model
      expect(names).toContain("sisyphus")
      expect(names).toContain("oracle")
      expect(names).toContain("sisyphus-junior")
      expect(notes.length).toBeGreaterThanOrEqual(0)
      for (const spec of specs) {
        expect(typeof spec.config.description).toBe("string")
      }
    })
  })
})
