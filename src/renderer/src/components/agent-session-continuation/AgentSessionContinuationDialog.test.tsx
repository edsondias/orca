// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { AgentSessionContinuationDialog } from './AgentSessionContinuationDialog'

const mocks = vi.hoisted(() => ({ launchContinuation: vi.fn() }))

vi.mock('@/lib/agent-session/launch/inventory/useAgentDetectionTarget', () => ({
  useAgentDetectionTargetForWorktree: () => null
}))
vi.mock('@/lib/agent-session/launch/inventory/host-chat-program', () => ({
  agentsOfferedForLaunch: () => ['claude', 'codex']
}))
vi.mock('@/components/agent/launch-menu/use-new-tab-agent-menu-rows', () => ({
  useAgentMenuObservation: () => ({
    detection: { detectedIds: ['claude', 'codex'], detectionFailed: false },
    model: {
      state: 'settled',
      rows: [
        { agent: 'claude', kind: 'terminal' },
        { agent: 'codex', kind: 'terminal' }
      ]
    },
    selectionFor: (agent: string) => ({
      ready: true,
      choice: { agent, route: 'terminal-tui' },
      cli: true
    })
  })
}))
vi.mock('@/components/agent/AgentLaunchPicker', () => ({
  AgentLaunchPicker: () => <div>Agent field</div>
}))
vi.mock('../agent/AgentLaunchSetupButton', () => ({ useAgentPickerDraftScope: () => undefined }))
vi.mock('@/lib/agent-session/launch/continuation/launch-agent-session-continuation', () => ({
  launchAgentSessionContinuation: mocks.launchContinuation
}))

afterEach(cleanup)

it.each([
  ['claude', 'v1'],
  ['codex', null]
] as const)(
  'passes the source Ollama variant only when continuing in Claude (%s)',
  async (agent, expectedVariantId) => {
    mocks.launchContinuation.mockResolvedValue(true)
    render(
      <AgentSessionContinuationDialog
        open
        request={{
          worktreeId: 'wt-1',
          workspacePath: '/tmp/fix-login',
          launchSource: 'sidebar',
          source: { sourceAgent: agent, capturedText: 'previous session' },
          sourceClaudeVariantId: 'v1'
        }}
        onOpenChange={() => {}}
      />
    )
    const start = screen.getByRole('button', { name: 'Start session' })
    await waitFor(() => expect(start).toBeEnabled())
    await userEvent.click(start)

    expect(mocks.launchContinuation).toHaveBeenCalledWith(
      expect.objectContaining({ agent, claudeVariantId: expectedVariantId })
    )
  }
)
