import { beforeEach, describe, expect, it, vi } from 'vitest'
import { launchAgentInNewTabWithOutcome } from './launch-agent-in-new-tab'
import type { LaunchAgentInNewTabArgs } from './launch-agent-in-new-tab-args'

const mocks = vi.hoisted(() => ({
  createTab: vi.fn(),
  routeRequests: [] as Record<string, unknown>[],
  isWebRuntimeSessionActive: vi.fn(() => false),
  launchAgentInWebHostTab: vi.fn(),
  launchStructuredAgentFromNewTab: vi.fn(),
  notifyAgentLaunchFailure: vi.fn(),
  settings: {} as Record<string, unknown>
}))

const store = {
  get settings() {
    return mocks.settings
  },
  createTab: mocks.createTab,
  setActiveTabType: vi.fn()
}

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/diagnostics/telemetry/telemetry', () => ({}))
vi.mock('@/lib/agent-session/launch/routing/agent-launch-route-input', () => ({}))
vi.mock('@/store/index', () => ({ useAppStore: { getState: () => store } }))
vi.mock('@/lib/agent-session/launch/new-tab/launch-agent-execution-context', () => ({
  agentTabLaunchStore: () => store,
  resolveAgentLaunchExecutionContext: () => ({
    resolvedLaunchPlatform: 'linux',
    isRemote: false,
    queuedShell: undefined
  })
}))
vi.mock('./launch-agent-in-new-tab-host-agents', () => ({
  routeNewTabLaunch: (_store: unknown, _args: unknown, request: Record<string, unknown>) => {
    mocks.routeRequests.push(request)
    return { plan: { route: 'terminal-tui' } }
  },
  launchOnceHostAnswered: vi.fn()
}))
vi.mock('@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab-structured-route', () => ({
  launchStructuredAgentFromNewTab: mocks.launchStructuredAgentFromNewTab
}))
vi.mock('@/lib/agent-session/launch/new-tab/launch-agent-web-host-tab', () => ({
  launchAgentInWebHostTab: mocks.launchAgentInWebHostTab
}))
vi.mock('@/runtime/web-session-tabs-sync/identity/web-runtime-session-environment', () => ({
  isWebRuntimeSessionActive: mocks.isWebRuntimeSessionActive
}))
vi.mock('@/lib/workspace/ownership/worktree-runtime-owner', () => ({
  runtimeEnvironmentIdOrLocalUnlessTwin: () => null
}))
vi.mock('@/runtime/agent-launch-settings/use-host-agent-launch-preferences', () => ({
  readAgentLaunchPreferencesForWorktree: () => ({
    agentLaunchChoices: mocks.settings.agentLaunchChoices
  })
}))
vi.mock('../../../workspace/creation/work-item/launch-work-item-direct-messages', () => ({
  invalidTerminalArgsMessage: () => null
}))
vi.mock('@/lib/agent-session/launch/pane/launch-agent-tab-order', () => ({
  persistAgentLaunchTabOrder: vi.fn()
}))
vi.mock('@/lib/agent-session/launch/failure/agent-launch-failure', () => ({
  agentLaunchCheckSettingsMessage: () => 'check settings',
  notifyAgentLaunchFailure: mocks.notifyAgentLaunchFailure
}))

const kimi = { id: 'v1', label: 'Kimi K3.1', model: 'kimi-k3.1-pro:cloud', context1m: true }

function launch(
  args: Pick<Partial<LaunchAgentInNewTabArgs>, 'agent' | 'claudeVariantId' | 'requestedSurface'>
) {
  return launchAgentInNewTabWithOutcome({
    ...args,
    agent: args.agent ?? 'claude',
    worktreeId: 'wt-1',
    requestId: 'request-1'
  })
}

type PendingStartup = {
  command: string
  env?: Record<string, string>
  launchConfig: { agentEnv: Record<string, string> }
}
const createdTab = (): { claudeVariant?: unknown; pendingStartup: PendingStartup } =>
  mocks.createTab.mock.calls[0]?.[3]

describe('launchAgentInNewTabWithOutcome with an Ollama Claude variant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.routeRequests.length = 0
    mocks.isWebRuntimeSessionActive.mockReturnValue(false)
    mocks.createTab.mockReturnValue({ id: 'tab-1' })
    mocks.settings = {
      agentCmdOverrides: {},
      agentDefaultArgs: {},
      agentDefaultEnv: { claude: { FOO: 'bar' } },
      agentLaunchChoices: { claude: { model: 'opus' } },
      claudeOllamaVariants: [kimi]
    }
  })

  it('launches a variant in a terminal with the Ollama env and its mark', () => {
    const result = launch({ claudeVariantId: 'v1' })

    expect(result && 'surface' in result ? result.surface.kind : null).toBe('local-terminal')
    expect(mocks.routeRequests[0]?.tuiCustomization).toEqual({
      cwd: undefined,
      launchesClaudeVariant: true
    })
    const { pendingStartup, claudeVariant } = createdTab()
    expect(pendingStartup.env).toMatchObject({
      FOO: 'bar',
      ANTHROPIC_BASE_URL: 'http://localhost:11434',
      ANTHROPIC_API_KEY: ''
    })
    expect(pendingStartup.launchConfig.agentEnv.ANTHROPIC_MODEL).toBe('kimi-k3.1-pro:cloud[1m]')
    // The saved Claude model would become --model and beat ANTHROPIC_MODEL.
    expect(pendingStartup.command).not.toMatch(/--model/)
    expect(claudeVariant).toEqual({ id: 'v1', label: 'Kimi K3.1' })
  })

  it('refuses an unknown variant with a notice and opens nothing', () => {
    expect(launch({ claudeVariantId: 'gone' })).toMatchObject({ refused: { delivered: false } })
    expect(mocks.notifyAgentLaunchFailure).toHaveBeenCalledTimes(1)
    expect(mocks.createTab).not.toHaveBeenCalled()
  })

  it('refuses a variant id on an agent other than Claude', () => {
    expect(launch({ agent: 'codex', claudeVariantId: 'v1' })).toMatchObject({ refused: {} })
    expect(mocks.createTab).not.toHaveBeenCalled()
  })

  it('refuses a variant on a paired host workspace', () => {
    mocks.isWebRuntimeSessionActive.mockReturnValue(true)

    expect(launch({ claudeVariantId: 'v1' })).toMatchObject({ refused: {} })
    expect(mocks.launchAgentInWebHostTab).not.toHaveBeenCalled()
    expect(mocks.createTab).not.toHaveBeenCalled()
  })

  it('refuses a chat rather than open plain Claude', () => {
    expect(launch({ claudeVariantId: 'v1', requestedSurface: 'chat' })).toMatchObject({
      refused: {}
    })
    expect(
      launchAgentInNewTabWithOutcome({
        agent: 'claude',
        claudeVariantId: 'v1',
        worktreeId: 'wt-1',
        agentSessionLaunchPlan: {
          route: 'structured-native-chat',
          requestId: 'request-1',
          agent: 'claude',
          begin: vi.fn(),
          launch: vi.fn()
        }
      })
    ).toMatchObject({ refused: {} })
    expect(mocks.routeRequests).toEqual([])
    expect(mocks.launchStructuredAgentFromNewTab).not.toHaveBeenCalled()
    expect(mocks.createTab).not.toHaveBeenCalled()
  })

  it('keeps plain Claude free of Ollama env', () => {
    launch({})

    expect(mocks.routeRequests[0]?.tuiCustomization).toEqual({ cwd: undefined })
    expect(createdTab().pendingStartup.command).toMatch(/--model/)
    expect(createdTab().pendingStartup.env?.ANTHROPIC_BASE_URL).toBeUndefined()
    expect(createdTab().claudeVariant).toBeUndefined()
  })
})
