import type { V2PluginContext, V2Registration, V2ToolInfo } from "./types"
import { doctorSummary } from "./degradation"

/**
 * M2/M5: oh-my-openagent tools registered natively against the v2 plugin API.
 *
 * - omo_status      : host/app info + degradation ledger (always available)
 * - omo_team_create : spawn one session per member and inject their opening task
 * - omo_team_status : dump tracked teams and per-member session ids
 * - omo_team_abort  : best-effort interruption of every member session
 *
 * Session dispatch goes through the same gate-routed transport surface as the
 * client bridge; this module never bypasses the central prompt queue.
 */

interface TeamMemberSpec {
  readonly name: string
  readonly role?: string
  readonly task?: string
}

interface TeamRecord {
  readonly name: string
  readonly members: Array<{ name: string; sessionID?: string }>
  readonly createdAt: number
}

const teams = new Map<string, TeamRecord>()

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function extractSessionID(created: unknown): string | undefined {
  const record = asRecord(created)
  if (!record) return undefined
  if (typeof record.id === "string") return record.id
  const data = asRecord(record.data)
  return data && typeof data.id === "string" ? data.id : undefined
}

export function omoStatusTool(context: V2PluginContext): V2ToolInfo {
  return {
    name: "omo_status",
    description:
      "oh-my-openagent runtime status on the OpenCode v2 host: app identity, active/degraded feature ledger, tracked teams.",
    input: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => {
      const body = {
        app: context.app,
        ledger: doctorSummary(),
        teams: [...teams.values()].map((team) => ({
          name: team.name,
          members: team.members.length,
          createdAt: team.createdAt,
        })),
      }
      return { content: JSON.stringify(body, null, 2) }
    },
  }
}

export function buildTeamTools(context: V2PluginContext): V2ToolInfo[] {
  const teamCreate: V2ToolInfo = {
    name: "omo_team_create",
    description:
      "Create an oh-my-openagent team: spawns one OpenCode session per member and sends each member their opening task.",
    input: {
      type: "object",
      properties: {
        name: { type: "string", description: "Team name." },
        members: {
          type: "array",
          description: "Team members.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string" },
              task: { type: "string", description: "Opening task sent to this member." },
            },
            required: ["name"],
            additionalProperties: false,
          },
        },
      },
      required: ["name", "members"],
      additionalProperties: false,
    },
    execute: async (input) => {
      const record = asRecord(input)
      const name = typeof record?.name === "string" ? record.name : ""
      const members = Array.isArray(record?.members) ? record.members : []
      if (!name || members.length === 0) {
        return { content: JSON.stringify({ error: "name and at least one member are required" }) }
      }

      const roster: TeamRecord["members"] = []
      for (const raw of members) {
        const member = asRecord(raw)
        const memberName = member && typeof member.name === "string" ? member.name : `member-${roster.length}`
        let sessionID: string | undefined
        try {
          const created = await context.session.create({ title: `${name}/${memberName}` })
          sessionID = extractSessionID(created)
        } catch (error) {
          roster.push({ name: memberName })
          continue
        }
        roster.push({ name: memberName, sessionID })
        const task = member && typeof member.task === "string" ? member.task : `${memberName}: begin.`
        const rolePrefix = member && typeof member.role === "string" ? `[${member.role}] ` : ""
        if (!sessionID) continue
        try {
          await context.session.prompt({ sessionID, text: `${rolePrefix}${task}` })
        } catch {
          // member session stays created; the task can be re-sent later
        }
      }

      teams.set(name, { name, members: roster, createdAt: Date.now() })
      return { content: JSON.stringify({ ok: true, name, members: roster }, null, 2) }
    },
  }

  const teamStatus: V2ToolInfo = {
    name: "omo_team_status",
    description: "List tracked oh-my-openagent teams and their member sessions.",
    input: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => {
      return {
        content: JSON.stringify(
          { teams: [...teams.values()], ledgerNotes: doctorSummary().slice(0, 3) },
          null,
          2,
        ),
      }
    },
  }

  const teamAbort: V2ToolInfo = {
    name: "omo_team_abort",
    description: "Best-effort interruption of every member session in a tracked team.",
    input: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
    execute: async (input) => {
      const record = asRecord(input)
      const name = typeof record?.name === "string" ? record.name : ""
      const team = teams.get(name)
      if (!team) return { content: JSON.stringify({ error: `unknown team: ${name}` }) }
      const interruptible = context.session as unknown as {
        interrupt?: (input: unknown) => Promise<unknown>
      }
      const results: Array<{ sessionID?: string; ok: boolean }> = []
      for (const member of team.members) {
        if (!member.sessionID) {
          results.push({ sessionID: member.sessionID, ok: false })
          continue
        }
        try {
          if (typeof interruptible.interrupt !== "function") throw new Error("host lacks interrupt")
          await interruptible.interrupt({ sessionID: member.sessionID })
          results.push({ sessionID: member.sessionID, ok: true })
        } catch {
          results.push({ sessionID: member.sessionID, ok: false })
        }
      }
      return { content: JSON.stringify({ name, results }, null, 2) }
    },
  }

  return [teamCreate, teamStatus, teamAbort]
}

export function resetTrackedTeamsForTests(): void {
  teams.clear()
}

export type { V2Registration }
