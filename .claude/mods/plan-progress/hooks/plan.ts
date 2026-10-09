import type { GroupState, ModuleState, ModuleStatus, Snapshot } from '../types'

export const OWNER = 'CetizionVerifica'
export const REPOS = ['ESG-lite_FE', 'ESG-lite', 'python_AI_service'] as const
export const BASE = 'redesign/integration'

/** The plan's modules per phase, as /next-module and /phase-gate split them. */
export const GROUPS: { title: string; milestone: string; ids: string[] }[] = [
  {
    title: 'Phase 0 · Foundation',
    milestone: 'M0',
    ids: ['F1', 'F2', 'F3-1', 'F3-2', 'F3-3', 'M0-SHELL', 'B1', 'B2', 'B4', 'B5', 'B6', 'B7', 'B8', 'B4-TREND'],
  },
  {
    title: 'Phase 1 · Sign-in, manager and contributor core',
    milestone: 'M1',
    ids: ['P01', 'P18', 'P06', 'P07', 'P08', 'P02', 'P03-A', 'P03-B', 'P03-C', 'P04', 'P05'],
  },
  {
    title: 'Phase 2 · Reports, targets, everyone',
    milestone: 'M2',
    ids: ['P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P09'],
  },
  {
    title: 'Phase 3 · Superadmin setup and data plumbing',
    milestone: 'M3',
    ids: ['P19', 'P16', 'P17', 'P20', 'P21', 'P25', 'P26', 'P22', 'P23', 'P24', 'P27', 'M3-CLEANUP'],
  },
  {
    title: 'PCF · MVP (pilot)',
    milestone: 'PCF MVP',
    ids: ['PCF-0', 'E1', 'C04', 'C01', 'C02', 'C03', 'C05'],
  },
  {
    title: 'PCF · Exchange and supply chain',
    milestone: 'PCF later',
    ids: ['E2', 'C06'],
  },
]

/** Merged before PR titles carried module IDs (phase-gate baseline, 2026-10-09). */
export const BASELINE_DONE = ['F1', 'F2', 'F3-1', 'B1', 'B2', 'B4', 'B5', 'B6', 'B7', 'B8']

export const MILESTONE_GOALS: Record<string, string> = {
  M0: 'tokens, shell and DataTable live behind the flag',
  M1: 'managers and contributors on the new pages',
  M2: 'reports, targets, notifications and settings migrated',
  M3: 'superadmin migrated, isDark at 0, old components deleted',
  'PCF MVP': 'pilot footprint end to end',
  'PCF later': 'PACT exchange and supplier data',
}

export type Pull = {
  title: string
  body: string | null
  state: string
  draft?: boolean
  merged_at: string | null
}

const TITLE = /^\s*\[([A-Z0-9]+(?:-[A-Z0-9]+)*)(?:\s+(\d+)\s*\/\s*(\d+))?\]/
const COMPLETES = /Completes:\s*([A-Z0-9]+(?:-[A-Z0-9]+)*)/g

type Facts = { isDone: boolean; hasReview: boolean; hasDraft: boolean; merged: number; total: number }

/** Works out each module's status from the PRs into redesign/integration. */
export function classify(pulls: readonly Pull[], fetchedAt: number): Snapshot {
  const facts = new Map<string, Facts>()
  const of = (id: string): Facts => {
    let f = facts.get(id)
    if (f === undefined) {
      f = { isDone: false, hasReview: false, hasDraft: false, merged: 0, total: 0 }
      facts.set(id, f)
    }
    return f
  }

  for (const id of BASELINE_DONE) of(id).isDone = true

  for (const pull of pulls) {
    const isMerged = pull.merged_at !== null
    const isOpen = pull.state === 'open'
    const title = TITLE.exec(pull.title)
    if (title !== null) {
      const f = of(title[1]!)
      const part = title[2] === undefined ? undefined : Number(title[2])
      const total = title[3] === undefined ? undefined : Number(title[3])
      if (total !== undefined) f.total = Math.max(f.total, total)
      if (isMerged) {
        if (part === undefined || (total !== undefined && part === total && total > 0)) f.isDone = true
        if (part !== undefined && part > 0) f.merged = Math.max(f.merged, part)
      }
      if (isOpen) {
        if (pull.draft === true) f.hasDraft = true
        else f.hasReview = true
      }
    }
    if (isMerged) {
      for (const match of (pull.body ?? '').matchAll(COMPLETES)) of(match[1]!).isDone = true
    }
  }

  const groups: GroupState[] = GROUPS.map(group => ({
    title: group.title,
    milestone: group.milestone,
    modules: group.ids.map((id): ModuleState => {
      const f = facts.get(id)
      let status: ModuleStatus = 'todo'
      if (f?.isDone) status = 'done'
      else if (f?.hasReview) status = 'review'
      else if (f?.hasDraft || (f?.merged ?? 0) > 0) status = 'progress'
      const parts = status !== 'done' && f !== undefined && f.total > 1 ? `${f.merged}/${f.total}` : undefined
      return parts === undefined ? { id, status } : { id, status, parts }
    }),
  }))

  return { fetchedAt, groups }
}

export function count(modules: readonly ModuleState[], status: ModuleStatus): number {
  return modules.filter(m => m.status === status).length
}

/** The first redesign milestone not yet reached, and the PCF one, if any. */
export function nextMilestones(snapshot: Snapshot): GroupState[] {
  const open = snapshot.groups.filter(g => count(g.modules, 'done') < g.modules.length)
  const redesign = open.find(g => g.milestone.startsWith('M'))
  const pcf = open.find(g => g.milestone.startsWith('PCF'))
  return [redesign, pcf].filter((g): g is GroupState => g !== undefined)
}

export function label(m: ModuleState): string {
  return m.parts === undefined ? m.id : `${m.id} ${m.parts}`
}

/** One line for the status bar under the prompt. */
export function statusLine(snapshot: Snapshot): string {
  const all = snapshot.groups.flatMap(g => g.modules)
  const next = nextMilestones(snapshot)[0]
  const parts = [`Plan ${count(all, 'done')}/${all.length} done`]
  const review = count(all, 'review')
  if (review > 0) parts.push(`${review} in review`)
  if (next !== undefined) parts.push(`next ${next.milestone} ${count(next.modules, 'done')}/${next.modules.length}`)
  return parts.join(' · ')
}
