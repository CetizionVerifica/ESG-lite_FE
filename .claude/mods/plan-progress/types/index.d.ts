export type ModuleStatus = 'done' | 'review' | 'progress' | 'todo'

export type ModuleState = {
  id: string
  status: ModuleStatus
  /** "1/5" when some parts of a multi-PR module are merged */
  parts?: string
}

export type GroupState = {
  title: string
  milestone: string
  modules: ModuleState[]
}

export type Snapshot = {
  fetchedAt: number
  groups: GroupState[]
}

declare module 'claude-code' {
  interface PluginState {
    'plan-progress': {
      snapshot: Snapshot | null
      error: string | null
      isLoading: boolean
    }
  }
}
