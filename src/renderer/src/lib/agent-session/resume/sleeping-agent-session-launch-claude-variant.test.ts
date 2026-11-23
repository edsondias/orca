import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SleepingAgentSessionRecord } from '../../../../../shared/agent-session/lifecycle/agent-session-resume'
import type { ClaudeOllamaVariant } from '../../../../../shared/claude-ollama-variants'
import { launchSleepingAgentSession } from './sleeping-agent-session-launch'

const mocks = vi.hoisted(() => ({ createTab: vi.fn(), toastError: vi.fn() }))

const initialVariants: ClaudeOllamaVariant[] = []
const store = {
  settings: {
    agentCmdOverrides: {},
    agentDefaultArgs: {},
    agentDefaultEnv: {},
    claudeOllamaVariants: initialVariants
  },
  repos: [{ id: 'repo-1', connectionId: null }],
  agentStatusByPaneKey: new Map(),
  getKnownWorktreeById: () => ({ id: 'wt-1', repoId: 'repo-1', path: '/repo/feature' }),
  createTab: mocks.createTab,
  clearSleepingAgentSession: vi.fn(),
  setActiveTabType: vi.fn()
}

vi.mock('@/store/index', () => ({ useAppStore: { getState: () => store } }))
vi.mock('sonner', () => ({ toast: { message: vi.fn(), error: mocks.toastError } }))
vi.mock('@/diagnostics/telemetry/telemetry', () => ({}))
vi.mock('@/lib/agent-session/launch/pane/launch-agent-tab-order', () => ({
  persistAgentLaunchTabOrder: vi.fn()
}))
vi.mock('@/lib/workspace/ownership/connection-owner-resolution', () => ({
  getConnectionIdFromState: () => null
}))
vi.mock('@/lib/workspace/ownership/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: () => 'local'
}))
vi.mock('@/lib/workspace/ownership/resolve-owner', () => ({
  runtimeEnvironmentIdUnlessTwin: () => null
}))
vi.mock('@/runtime/hosts/preflight/local-preflight-context', () => ({
  getLocalProjectExecutionRuntimeContext: () => undefined
}))
vi.mock('@/lib/agent-session/resume/agent-resume-launch-target', () => ({
  resolveAgentResumeLaunchTarget: () => ({
    platform: 'linux',
    agentHostPlatform: 'linux',
    shell: undefined
  }),
  resolveRuntimeHostReportedPlatform: () => null,
  resolveRuntimeHostTerminalWindowsShell: () => null,
  resolveSshHostReportedPlatform: () => null
}))

const kimi = { id: 'v1', label: 'Kimi K3.1', model: 'kimi-k3.1-pro:cloud', context1m: true }
const mark = { id: 'v1', label: 'Kimi K3.1' }

const record: SleepingAgentSessionRecord = {
  paneKey: 'tab-1::leaf-1',
  tabId: 'tab-1',
  worktreeId: 'wt-1',
  agent: 'claude',
  providerSession: { key: 'session_id', id: '0199f7a1-0000-7000-8000-000000000001' },
  prompt: 'finish the task',
  state: 'done',
  origin: 'worktree-sleep',
  capturedAt: 1,
  updatedAt: 1,
  claudeVariant: mark
}

describe('launchSleepingAgentSession with an Ollama Claude variant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createTab.mockReturnValue({ id: 'tab-2' })
  })

  it('refuses to resume on plain Claude when the variant was removed', () => {
    store.settings.claudeOllamaVariants = []

    expect(launchSleepingAgentSession(record)).toBe(false)
    expect(mocks.toastError).toHaveBeenCalledWith('This agent session cannot be resumed.')
    expect(mocks.createTab).not.toHaveBeenCalled()
    expect(store.clearSleepingAgentSession).not.toHaveBeenCalled()
  })

  it('resumes on the variant and marks the new tab', () => {
    store.settings.claudeOllamaVariants = [kimi]

    expect(launchSleepingAgentSession(record)).toBe(true)
    const options = mocks.createTab.mock.calls.at(-1)?.[3]
    expect(options).toMatchObject({
      claudeVariant: mark,
      pendingStartup: {
        env: expect.objectContaining({
          ANTHROPIC_BASE_URL: 'http://localhost:11434',
          ANTHROPIC_MODEL: 'kimi-k3.1-pro:cloud[1m]'
        })
      }
    })
  })
})
