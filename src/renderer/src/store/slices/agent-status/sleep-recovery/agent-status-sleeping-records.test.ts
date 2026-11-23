import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../../../shared/agent-status/contracts/agent-status-types'
import type { TerminalTab } from '../../../../../../shared/workspace-layout/terminal-tab-types'
import type { AppState } from '../../../types'
import { makeTab } from '../../../terminals/testing/terminal-tab.test-fixture'
import { sleepingRecordFromEntry } from './agent-status-sleeping-records'

const PANE_KEY = 'tab-1:11111111-1111-4111-8111-111111111111'
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the record builder reads tabs only through the tab the caller passes.
const STATE = { tabsByWorktree: {} } as unknown as AppState

const ENTRY: AgentStatusEntry = {
  paneKey: PANE_KEY,
  state: 'done',
  prompt: 'ship it',
  updatedAt: 2_000,
  stateStartedAt: 2_000,
  stateHistory: [],
  agentType: 'claude',
  providerSession: { key: 'session_id', id: 'session-1' }
}

function recordFor(overrides: Partial<TerminalTab> = {}) {
  return sleepingRecordFromEntry({
    state: STATE,
    entry: ENTRY,
    worktreeId: 'wt-1',
    tab: makeTab({ id: 'tab-1', worktreeId: 'wt-1', ...overrides }),
    capturedAt: 3_000,
    origin: 'live'
  })
}

describe('sleepingRecordFromEntry Claude variant mark', () => {
  it('copies the tab variant mark into the record', () => {
    const mark = { id: 'v1', label: 'Kimi K3.1' }
    expect(recordFor({ claudeVariant: mark })?.claudeVariant).toEqual(mark)
  })

  it('omits the key when the tab has no mark', () => {
    expect(recordFor()).not.toHaveProperty('claudeVariant')
    expect(recordFor({ claudeVariant: null })).not.toHaveProperty('claudeVariant')
  })
})
