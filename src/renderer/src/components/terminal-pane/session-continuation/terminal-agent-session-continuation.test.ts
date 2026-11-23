import { describe, expect, it, vi } from 'vitest'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager-types'
import { prepareAgentSessionContinuationFromPane } from './terminal-agent-session-continuation'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'

type SourceTab = {
  id: string
  launchAgent?: string | null
  claudeVariant?: { id: string; label: string }
}
const initialTabsByWorktree: Record<string, SourceTab[]> = {}
const store = {
  agentStatusByPaneKey: new Map([
    [
      `tab-1:${LEAF_ID}`,
      {
        agentType: 'claude',
        prompt: 'finish the auth refactor',
        providerSession: { transcriptPath: '/home/u/.claude/session.jsonl' }
      }
    ]
  ]),
  tabsByWorktree: initialTabsByWorktree
}

vi.mock('@/store/index', () => ({ useAppStore: { getState: () => store } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

function makePane(): ManagedPane {
  const pane = { leafId: LEAF_ID, terminal: { focus: vi.fn() } }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a saved transcript means the builder reads only leafId and focus.
  return pane as unknown as ManagedPane
}

describe('prepareAgentSessionContinuationFromPane', () => {
  it('carries the source tab Ollama variant id', () => {
    store.tabsByWorktree = {
      'wt-1': [
        { id: 'tab-1', launchAgent: 'claude', claudeVariant: { id: 'v1', label: 'Kimi K3.1' } }
      ]
    }
    const args = {
      pane: makePane(),
      tabId: 'tab-1',
      worktreeId: 'wt-1',
      groupId: null,
      workspacePath: '/repo/worktree',
      initialCwd: '/repo/worktree'
    }

    expect(prepareAgentSessionContinuationFromPane(args)?.sourceClaudeVariantId).toBe('v1')
    store.tabsByWorktree = { 'wt-1': [{ id: 'tab-1', launchAgent: 'claude' }] }
    expect(prepareAgentSessionContinuationFromPane(args)?.sourceClaudeVariantId).toBeNull()
  })
})
