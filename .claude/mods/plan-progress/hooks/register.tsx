import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ModuleStatus, Snapshot } from '../types'
import { BASE, MILESTONE_GOALS, OWNER, REPOS, classify, count, label, nextMilestones, statusLine } from './plan'
import type { Pull } from './plan'

const PANE = 'plan-progress'
const TITLE = 'Plan progress'
const REFRESH_MS = 15 * 60 * 1000
const STORE_KEY = 'snapshot'

const snapshot = atom({ plugin: 'plan-progress', key: 'snapshot' } as const, null)
const error = atom({ plugin: 'plan-progress', key: 'error' } as const, null)
const isLoading = atom({ plugin: 'plan-progress', key: 'isLoading' } as const, false)

const ROWS: { status: ModuleStatus; mark: string; name: string; color?: string }[] = [
  { status: 'done', mark: '✓', name: 'done', color: 'success' },
  { status: 'review', mark: '◐', name: 'in review', color: 'warning' },
  { status: 'progress', mark: '◔', name: 'in progress', color: 'suggestion' },
  { status: 'todo', mark: '○', name: 'not started' },
]

/** PRs into redesign/integration: through `gh` if it is signed in, else the REST API. */
async function fetchPulls($: EngineInterface, repo: string): Promise<Pull[]> {
  const path = `repos/${OWNER}/${repo}/pulls?base=${encodeURIComponent(BASE)}&state=all&per_page=100`
  try {
    const ran = await $.process.run(['gh', 'api', path], { timeoutMs: 30000 })
    if (ran.exitCode === 0) return JSON.parse(ran.stdout) as Pull[]
  } catch {
    // no gh on this host; fall through to HTTP
  }
  const token = (await $.env.get('GITHUB_TOKEN')) ?? (await $.env.get('GH_TOKEN'))
  const headers: Record<string, string> = { accept: 'application/vnd.github+json' }
  let res = await $.http.fetch(`https://api.github.com/${path}`, {
    headers: token === undefined ? headers : { ...headers, authorization: `Bearer ${token}` },
  })
  if (res.status === 401 && token !== undefined) {
    res = await $.http.fetch(`https://api.github.com/${path}`, { headers })
  }
  if (!res.ok) {
    throw new Error(`${repo}: GitHub answered ${res.status}. Sign in with \`gh auth login\` or set GITHUB_TOKEN.`)
  }
  return JSON.parse(res.text) as Pull[]
}

async function refresh($: EngineInterface): Promise<void> {
  if (await read($, isLoading)) return
  await update($, isLoading, () => true)
  try {
    const lists = await Promise.all(REPOS.map(repo => fetchPulls($, repo)))
    const next = classify(lists.flat(), await $.clock.now())
    await update($, snapshot, () => next)
    await update($, error, () => null)
    await $.store.set(STORE_KEY, next)
    $.ui.status(statusLine(next))
  } catch (err) {
    await update($, error, () => (err instanceof Error ? err.message : String(err)))
  } finally {
    await update($, isLoading, () => false)
  }
}

function clockTime(ms: number): string {
  return new Date(ms).toTimeString().slice(0, 5)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'plan-progress',
      description: 'Show the redesign and PCF plan progress (modules per phase, next milestone)',
    })
    const cached = (await $.store.get(STORE_KEY)) as Snapshot | undefined
    if (cached !== undefined && (await read($, snapshot)) === null) {
      await update($, snapshot, () => cached)
      $.ui.status(statusLine(cached))
    }
    void refresh($)
    $.clock.every(REFRESH_MS, () => void refresh($))

    return next(e)
  })

  on('command.run', { command: 'plan-progress' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    void refresh($)
    const held = await read($, snapshot)

    return { text: held === null ? 'Plan progress pane opened; loading.' : `Plan progress: ${statusLine(held)}.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const held = await read($, snapshot)
    const failed = await read($, error)
    const loading = await read($, isLoading)

    const header = (
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>
          {held === null
            ? 'Plan progress'
            : `Plan progress · updated ${clockTime(held.fetchedAt)}${loading ? ' · refreshing' : ''}`}
        </Text>
        <Button key="refresh" label="Refresh" hotkey="r" onPress={() => void refresh($)} />
      </Box>
    )

    if (held === null) {
      return (
        <Box flexDirection="column">
          {header}
          <Text color={failed === null ? undefined : 'error'} dimColor={failed === null}>
            {failed ?? 'Reading the pull requests into redesign/integration…'}
          </Text>
        </Box>
      )
    }

    const all = held.groups.flatMap(g => g.modules)

    return (
      <Box flexDirection="column">
        {header}
        {failed !== null && <Text color="error">Last refresh failed: {failed}</Text>}
        <Text>
          {count(all, 'done')} of {all.length} modules done, {count(all, 'review')} in review,{' '}
          {count(all, 'progress')} in progress.
        </Text>
        {nextMilestones(held).map(g => {
          const left = g.modules.filter(m => m.status !== 'done').map(label)
          return (
            <Text>
              <Text bold>Next {g.milestone}</Text>
              <Text dimColor> ({MILESTONE_GOALS[g.milestone]})</Text> {count(g.modules, 'done')}/{g.modules.length},
              left: {left.join(' ')}
            </Text>
          )
        })}
        {held.groups.map(g => (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>
              {g.title} ({g.milestone}) {count(g.modules, 'done')}/{g.modules.length}
            </Text>
            {ROWS.map(row => {
              const ids = g.modules.filter(m => m.status === row.status).map(label)
              if (ids.length === 0) return null
              return (
                <Text dimColor={row.status === 'todo'}>
                  {'  '}
                  <Text color={row.color}>
                    {row.mark} {row.name}
                  </Text>
                  {'  '}
                  {ids.join(' ')}
                </Text>
              )
            })}
          </Box>
        ))}
      </Box>
    )
  })
}
