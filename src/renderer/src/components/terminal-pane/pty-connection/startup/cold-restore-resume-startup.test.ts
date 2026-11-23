import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeOllamaVariant } from '../../../../../../shared/claude-ollama-variants'
import type { ConnectPanePtySession } from '../connect-pane-pty-session'
import { bindBuildColdRestoreAgentResumeStartup } from './cold-restore-resume-startup'

const TAB_ID = 'tab-1'
const LEAF_ID = 'leaf-1'
const WORKTREE_ID = 'wt-1'
const PANE_KEY = `${TAB_ID}:${LEAF_ID}`

const kimi = { id: 'v1', label: 'Kimi K3.1', model: 'kimi-k3.1-pro:cloud', context1m: true }

const mocks = vi.hoisted(() => {
  const state: Record<string, unknown> = {}
  return { state }
})

vi.mock('@/store/index', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/workspace/ownership/connection-owner-resolution', () => ({
  getConnectionIdForWorktreeCopy: () => null,
  getConnectionIdFromState: () => null
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
vi.mock('@/lib/agent-session/resume/sleeping-record-execution-host-scope', () => ({
  agentResumeOriginNamesAnotherExecutionHost: () => false,
  sleepingRecordNamesAnotherExecutionHost: () => false
}))

function setStore(variants: ClaudeOllamaVariant[]): void {
  mocks.state = {
    settings: { agentCmdOverrides: {}, agentDefaultArgs: {}, claudeOllamaVariants: variants },
    agentStatusByPaneKey: new Map([
      [
        PANE_KEY,
        {
          agentType: 'claude',
          state: 'working',
          providerSession: { key: 'session_id', id: 'claude-conv-1' },
          connectionId: null
        }
      ]
    ]),
    tabsByWorktree: {
      [WORKTREE_ID]: [{ id: TAB_ID, claudeVariant: { id: 'v1', label: 'Kimi K3.1' } }]
    },
    getAgentLaunchConfigForStatusEntry: () => undefined
  }
}

function buildSession(): ConnectPanePtySession {
  const session = {
    pendingStartupCommand: null,
    cacheKey: PANE_KEY,
    executionHostId: 'local',
    projectRuntime: undefined,
    worktree: { path: '/repo/feature' },
    shellOverride: undefined,
    transport: {},
    deps: { tabId: TAB_ID, worktreeId: WORKTREE_ID },
    getSleepingRecordForPane: () => null
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test bag covers every member the cold-restore builder reads.
  return session as unknown as ConnectPanePtySession
}

describe('buildColdRestoreAgentResumeStartup for an Ollama Claude variant tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not resume on plain Claude when the variant was removed', () => {
    setStore([])
    const session = buildSession()
    bindBuildColdRestoreAgentResumeStartup(session)

    expect(session.buildColdRestoreAgentResumeStartup()).toBeNull()
  })

  it('resumes with the variant env when the variant still exists', () => {
    setStore([kimi])
    const session = buildSession()
    bindBuildColdRestoreAgentResumeStartup(session)

    expect(session.buildColdRestoreAgentResumeStartup()?.env).toMatchObject({
      ANTHROPIC_BASE_URL: 'http://localhost:11434',
      ANTHROPIC_MODEL: 'kimi-k3.1-pro:cloud[1m]'
    })
  })
})
