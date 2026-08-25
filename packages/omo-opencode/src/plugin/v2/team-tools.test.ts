import { describe, expect, test } from "bun:test"
import type { V2PluginContext } from "./types"
import { buildTeamTools, omoStatusTool, resetTrackedTeamsForTests } from "./team-tools"

function createContextStub(sessionIds: string[]): {
  context: V2PluginContext
  createdTitles: string[]
  prompted: Array<Record<string, unknown>>
} {
  const createdTitles: string[] = []
  const prompted: Array<Record<string, unknown>> = []
  let next = 0

  const context = {
    app: { name: "cli", version: "0.0.0-beta-18050", channel: "beta" },
    options: {},
    session: {
      create: async (input?: unknown) => {
        const record = (input ?? {}) as Record<string, unknown>
        createdTitles.push(typeof record.title === "string" ? record.title : "")
        // beyond the provided ids a spawn "fails": no id comes back
        const id = sessionIds[next]
        next++
        return { id }
      },
      prompt: async (input?: unknown) => {
        prompted.push((input ?? {}) as Record<string, unknown>)
        return {}
      },
    },
  } as unknown as V2PluginContext

  return { context, createdTitles, prompted }
}

describe("omo v2 native tools", () => {
  test("registers the expected tool names", () => {
    resetTrackedTeamsForTests()
    const { context } = createContextStub([])
    const tools = buildTeamTools(context).map((tool) => tool.name)
    expect(tools).toEqual(["omo_team_create", "omo_team_status", "omo_team_abort"])
    expect(omoStatusTool(context).name).toBe("omo_status")
  })

  test("omo_team_create spawns a session per member and injects opening tasks", async () => {
    resetTrackedTeamsForTests()
    // only two sessions available -> third member fails to spawn and gets no task
    const { context, createdTitles, prompted } = createContextStub(["ses_a", "ses_b"])
    const [teamCreate] = buildTeamTools(context)

    const result = await teamCreate.execute(
      {
        name: "frontend-squad",
        members: [
          { name: "builder", role: "implementer", task: "build the login page" },
          { name: "reviewer", role: "reviewer", task: "review the diff" },
          { name: "ghost", task: "never spawns" },
        ],
      },
      { sessionID: "caller", agent: "sisyphus", messageID: "m1", id: "t1", progress: async () => {} },
    )

    expect(createdTitles).toEqual(["frontend-squad/builder", "frontend-squad/reviewer", "frontend-squad/ghost"])
    // two members got tasks; third had no session (ids exhausted)
    expect(prompted).toHaveLength(2)
    expect(prompted[0]).toMatchObject({ sessionID: "ses_a", text: "[implementer] build the login page" })
    expect(prompted[1]).toMatchObject({ sessionID: "ses_b", text: "[reviewer] review the diff" })
    const body = String(result.content)
    expect(body).toContain("frontend-squad")
    // ghost had no spawnable session: tracked without a session id, never prompted
    expect(body).toContain('"name": "ghost"')
    expect(body).not.toContain('"sessionID": "ses_c"')
  })

  test("omo_team_create validates input", async () => {
    resetTrackedTeamsForTests()
    const { context } = createContextStub([])
    const [teamCreate] = buildTeamTools(context)
    const result = await teamCreate.execute(
      {},
      { sessionID: "s", agent: "a", messageID: "m", id: "i", progress: async () => {} },
    )
    expect(String(result.content)).toContain("required")
  })

  test("omo_team_status reports tracked teams", async () => {
    resetTrackedTeamsForTests()
    const { context } = createContextStub(["ses_1"])
    const tools = buildTeamTools(context)
    await tools[0].execute(
      { name: "duo", members: [{ name: "a", task: "go" }] },
      { sessionID: "s", agent: "a", messageID: "m", id: "i", progress: async () => {} },
    )
    const result = await tools[1].execute(
      {},
      { sessionID: "s", agent: "a", messageID: "m", id: "i2", progress: async () => {} },
    )
    expect(String(result.content)).toContain('"duo"')
  })

  test("omo_team_abort handles missing interrupt capability gracefully", async () => {
    resetTrackedTeamsForTests()
    const { context } = createContextStub(["ses_x"])
    const tools = buildTeamTools(context)
    await tools[0].execute(
      { name: "t", members: [{ name: "a", task: "x" }] },
      { sessionID: "s", agent: "a", messageID: "m", id: "i", progress: async () => {} },
    )
    const result = await tools[2].execute(
      { name: "t" },
      { sessionID: "s", agent: "a", messageID: "m", id: "i3", progress: async () => {} },
    )
    expect(String(result.content)).toContain("ok\": false") || expect(String(result.content)).toContain('"ok": false')
  })
})
