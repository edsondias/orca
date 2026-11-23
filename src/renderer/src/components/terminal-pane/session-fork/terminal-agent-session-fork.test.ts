import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager-types'
import { forkAgentSessionFromPane } from './terminal-agent-session-fork'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'

const mocks = vi.hoisted(() => ({
  launchAgentInNewTabWithOutcome: vi.fn(),
  planAgentSessionLaunch: vi.fn()
}))

type SourceTab = {
  id: string
  launchAgent?: string | null
  claudeVariant?: { id: string; label: string }
}
const initialTabsByWorktree: Record<string, SourceTab[]> = {}
const store = {
  repos: [{ id: 'repo-1', kind: 'git' }],
  agentStatusByPaneKey: new Map<string, { agentType?: string }>(),
  tabsByWorktree: initialTabsByWorktree,
  getKnownWorktreeById: () => ({
    id: 'wt-1',
    repoId: 'repo-1',
    displayName: 'auth-feature',
    branch: 'feature/auth'
  }),
  createWorktree: vi.fn(async () => ({ worktree: { id: 'wt-fork', path: '/repo/fork' } }))
}

vi.mock('@/store/index', () => ({ useAppStore: { getState: () => store } }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/agent-session/context/terminal-context-text', () => ({
  readTerminalContextText: () => 'User: compare OAuth options'
}))
vi.mock('@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab', () => ({
  launchAgentInNewTabWithOutcome: mocks.launchAgentInNewTabWithOutcome
}))
vi.mock('@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab-host-agents', () => ({
  settleAgentTabLaunch: async () => ({ kind: 'terminal' })
}))
vi.mock('@/lib/agent-session/launch/prompt/new-agent-prompt-outcome', () => ({
  newAgentPromptOutcome: async () => ({ delivered: true })
}))
vi.mock('@/lib/agent-session/launch/routing/agent-session-launch-plan', () => ({
  planAgentSessionLaunch: (...args: unknown[]) => {
    mocks.planAgentSessionLaunch(...args)
    return { route: 'terminal-tui' }
  }
}))
vi.mock('@/lib/workspace/activation/worktree-activation', () => ({
  activateAndRevealWorktree: vi.fn()
}))
vi.mock('@/lib/workspace/ownership/resolve-owner', () => ({
  resolveOwner: () => ({ kind: 'unresolved' })
}))
vi.mock('@/runtime/hosts/preflight/local-preflight-context', () => ({
  getLocalProjectExecutionRuntimeContext: () => undefined
}))
vi.mock('./terminal-agent-session-fork-launch-platform', () => ({
  getForkAgentLaunchPlatform: () => null
}))

function makePane(): ManagedPane {
  const pane = { leafId: LEAF_ID, terminal: { focus: vi.fn() } }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: terminal capture is mocked, so the fork reads only leafId and focus.
  return pane as unknown as ManagedPane
}

async function forkFromAgent(agentType: string): Promise<void> {
  store.agentStatusByPaneKey = new Map([[`tab-1:${LEAF_ID}`, { agentType }]])
  store.tabsByWorktree = {
    'wt-1': [{ id: 'tab-1', claudeVariant: { id: 'v1', label: 'Kimi K3.1' } }]
  }
  await forkAgentSessionFromPane({
    pane: makePane(),
    tabId: 'tab-1',
    worktreeId: 'wt-1',
    groupId: null
  })
}

describe('forkAgentSessionFromPane with an Ollama Claude variant tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.launchAgentInNewTabWithOutcome.mockReturnValue({
      surface: { kind: 'local-terminal', tabId: 'tab-2' }
    })
  })

  it('keeps a fork of an Ollama variant tab on the same variant in the terminal', async () => {
    await forkFromAgent('claude')

    expect(mocks.planAgentSessionLaunch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tuiCustomization: { launchesClaudeVariant: true } })
    )
    expect(mocks.launchAgentInNewTabWithOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'claude', claudeVariantId: 'v1' })
    )
  })

  it('does not carry a variant into a fork whose agent is not Claude', async () => {
    await forkFromAgent('codex')

    expect(mocks.planAgentSessionLaunch).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ tuiCustomization: expect.anything() })
    )
    expect(mocks.launchAgentInNewTabWithOutcome).toHaveBeenCalledWith(
      expect.not.objectContaining({ claudeVariantId: expect.anything() })
    )
  })
})
