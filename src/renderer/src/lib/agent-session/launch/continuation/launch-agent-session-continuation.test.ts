import { beforeEach, describe, expect, it, vi } from 'vitest'
import { launchAgentSessionContinuation } from './launch-agent-session-continuation'

const mocks = vi.hoisted(() => ({
  launchAgentInNewTabWithOutcome: vi.fn(),
  planAgentSessionLaunch: vi.fn()
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock('@/store/index', () => ({
  useAppStore: {
    getState: () => ({ settings: { disabledTuiAgents: [] }, getKnownWorktreeById: () => null })
  }
}))
vi.mock('@/lib/agent-catalog/agent-catalog', () => ({ getAgentLabel: () => 'Claude' }))
vi.mock('@/lib/agent-session/launch/inventory/agent-detection-target-inventory', () => ({
  ensureDetectedAgentsForWorktree: vi.fn()
}))
vi.mock('@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab', () => ({
  launchAgentInNewTabWithOutcome: mocks.launchAgentInNewTabWithOutcome
}))
vi.mock('../inventory/host-chat-program-acquisition', () => ({
  acquireAgentLaunchChoices: async () => ({ detected: ['claude'], offered: [] }),
  AgentLaunchChoiceCancelled: class extends Error {}
}))
vi.mock('../inventory/host-chat-program', () => ({ agentChoicePending: () => false }))
vi.mock('../routing/agent-launch-route-input', () => ({
  worktreeLaunchWorkspace: (worktreeId: string) => ({ kind: 'git-worktree', worktreeId })
}))
vi.mock('@/lib/agent-session/launch/routing/agent-session-launch-plan', () => ({
  adoptAgentSessionLaunchVerdict: vi.fn(),
  planAgentSessionLaunch: (...args: unknown[]) => {
    mocks.planAgentSessionLaunch(...args)
    return { route: 'terminal-tui' }
  }
}))
vi.mock('@/lib/workspace/display/worktree-default-display-name', () => ({
  resolveWorktreeDisplayName: () => 'feature'
}))
vi.mock('@/lib/workspace/ownership/resolved-worktree-execution-host', () => ({
  getResolvedExecutionHostIdForWorktree: () => null
}))
vi.mock('@/lib/workspace/activation/workspace-navigation-toast-action', () => ({
  workspaceNavigationToastAction: vi.fn()
}))

describe('launchAgentSessionContinuation with an Ollama Claude variant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.launchAgentInNewTabWithOutcome.mockReturnValue(null)
  })

  it('forwards the variant id and plans a terminal launch', async () => {
    await launchAgentSessionContinuation({
      agent: 'claude',
      prompt: 'continue',
      worktreeId: 'wt-1',
      launchSource: 'sidebar',
      claudeVariantId: 'v1'
    })

    expect(mocks.planAgentSessionLaunch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tuiCustomization: expect.objectContaining({ launchesClaudeVariant: true })
      })
    )
    expect(mocks.launchAgentInNewTabWithOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'claude', claudeVariantId: 'v1' })
    )
  })

  it('launches without a variant when none is named', async () => {
    await launchAgentSessionContinuation({
      agent: 'claude',
      prompt: 'continue',
      worktreeId: 'wt-1',
      launchSource: 'sidebar',
      claudeVariantId: null
    })

    expect(mocks.planAgentSessionLaunch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tuiCustomization: { cwd: undefined } })
    )
    expect(mocks.launchAgentInNewTabWithOutcome).toHaveBeenCalledWith(
      expect.not.objectContaining({ claudeVariantId: expect.anything() })
    )
  })
})
