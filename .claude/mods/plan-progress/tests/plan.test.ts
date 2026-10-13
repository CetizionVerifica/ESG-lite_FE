import { describe, expect, test } from 'claude-code/testing'

import { classify, nextMilestones, statusLine } from '../hooks/plan'
import type { Pull } from '../hooks/plan'

const merged = (title: string, body = ''): Pull => ({ title, body, state: 'closed', draft: false, merged_at: '2026-10-09T10:00:00Z' })
const open = (title: string, draft = false): Pull => ({ title, body: '', state: 'open', draft, merged_at: null })
const closed = (title: string): Pull => ({ title, body: '', state: 'closed', draft: false, merged_at: null })

const PULLS: Pull[] = [
  merged('[F3-2] Data display components', 'Completes: F3-2'),
  merged('[F3-3] Flow components', 'Completes: F3'),
  merged('[M0-SHELL 1/1] Shell on the real theme', 'Completes: M0-SHELL'),
  merged('[B4-TREND 1/1] Overview trend'),
  merged('[P07 1/2] Approvals tab'),
  merged('[P07 2/2] Drawer edit', 'Completes: P07'),
  merged('[P04 1/2] My entries table'),
  open('[P04 2/2] Edit and resubmit', true),
  open('[P06 1/1] Overview'),
  closed('[P01 0/1] Public brand by slug'),
  merged('[E1 1/5] PCF entities'),
  open('[E1 2/5] computePcf'),
  merged('[PCF-0 1/1] Method note', 'Completes: PCF-0'),
]

const status = (id: string) =>
  classify(PULLS, 0).groups.flatMap(g => g.modules).find(m => m.id === id)

describe('classify', () => {
  test('a merged Completes PR, a merged n/n part or a merged bare [ID] marks done', async () => {
    for (const id of ['F1', 'F3-2', 'F3-3', 'M0-SHELL', 'B4-TREND', 'P07', 'PCF-0']) {
      expect(status(id)?.status).toBe('done')
    }
  })

  test('open PRs and merged parts give review or in progress', async () => {
    expect(status('P06')).toEqual({ id: 'P06', status: 'review' })
    expect(status('P04')).toEqual({ id: 'P04', status: 'progress', parts: '1/2' })
    expect(status('E1')).toEqual({ id: 'E1', status: 'review', parts: '1/5' })
  })

  test('a closed, unmerged PR claims nothing', async () => {
    expect(status('P01')?.status).toBe('todo')
  })

  test('phase 0 complete makes M1 the next milestone', async () => {
    const snap = classify(PULLS, 0)
    expect(nextMilestones(snap).map(g => g.milestone)).toEqual(['M1', 'PCF MVP'])
    expect(statusLine(snap)).toMatch(/^Plan \d+\/\d+ done · 2 in review · next M1 1\/11$/)
  })
})
