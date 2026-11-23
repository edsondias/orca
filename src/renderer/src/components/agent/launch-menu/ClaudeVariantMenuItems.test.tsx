import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeOllamaVariant } from '../../../../../shared/claude-ollama-variants'
import type { TuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent'
import type { NewTabAgentMenuModel } from './new-tab-agent-menu-model'

const mocks = vi.hoisted(() => ({
  launchAgentInNewTabWithOutcome: vi.fn(),
  isWebRuntimeSessionActive: vi.fn(() => false),
  state: { settings: { claudeOllamaVariants: [] as unknown[] } }
}))

vi.mock('@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab', () => ({
  launchAgentInNewTabWithOutcome: mocks.launchAgentInNewTabWithOutcome
}))
vi.mock('./agent-menu-launch-facts', () => ({ readAgentMenuTerminalPending: () => false }))
vi.mock('@/store/retained-views/app-state-view', () => ({
  useAppStateValue: (selector: (state: unknown) => unknown) => selector(mocks.state)
}))
vi.mock('@/lib/workspace/ownership/worktree-runtime-owner', () => ({
  runtimeEnvironmentIdOrLocalUnlessTwin: () => 'env-1'
}))
vi.mock('@/runtime/web-session-tabs-sync/identity/web-runtime-session-environment', () => ({
  isWebRuntimeSessionActive: mocks.isWebRuntimeSessionActive
}))

import {
  claudeVariantPickerChoices,
  claudeVariantRow,
  useClaudeVariantMenuLaunches,
  type ClaudeVariantMenuLaunches
} from './ClaudeVariantMenuItems'
import { useTabAgentMenuLaunch, type TabAgentMenuLaunch } from './AgentMenuItems'

const kimi: ClaudeOllamaVariant = {
  id: 'v1',
  label: 'Kimi K3.1',
  model: 'kimi-k3.1-pro',
  context1m: false
}

function settled(
  rows: Extract<NewTabAgentMenuModel, { state: 'settled' }>['rows'],
  detectedIds: TuiAgent[] = []
): NewTabAgentMenuModel {
  return {
    state: 'settled',
    rows,
    detection: {
      detectedIds,
      isLoading: false,
      detectionFailed: false,
      isRefreshing: false,
      needsServerUpdate: false,
      refresh: async () => []
    },
    pickerContext: {
      workspace: { kind: 'git-worktree', worktreeId: 'wt-1' },
      executionHostId: 'local',
      settings: null,
      key: 'k'
    }
  }
}

function renderHook<T>(hook: () => T): T {
  let value: T | undefined
  function Probe(): null {
    value = hook()
    return null
  }
  renderToStaticMarkup(<Probe />)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Probe ran synchronously above and assigned the hook's value.
  return value as T
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isWebRuntimeSessionActive.mockReturnValue(false)
  mocks.state.settings.claudeOllamaVariants = [kimi]
  mocks.launchAgentInNewTabWithOutcome.mockReturnValue({
    surface: { kind: 'local-terminal', tabId: 'tab-1' },
    pasteDraftAfterLaunch: false
  })
})

describe('claudeVariantRow', () => {
  it('launches through Claude’s CLI row', () => {
    expect(claudeVariantRow(settled([{ kind: 'cli', agent: 'claude' }]))).toEqual({
      kind: 'cli',
      agent: 'claude'
    })
  })

  it('uses the detected CLI behind a Claude chat row', () => {
    expect(
      claudeVariantRow(
        settled([{ kind: 'chat', agent: 'claude', executionHostId: 'local' }], ['claude'])
      )
    ).toEqual({ kind: 'cli', agent: 'claude', executionHostId: 'local' })
  })

  it('offers no variant without Claude’s CLI', () => {
    expect(claudeVariantRow(settled([{ kind: 'chat', agent: 'claude' }]))).toBeNull()
    expect(claudeVariantRow(settled([{ kind: 'cli', agent: 'codex' }], ['codex']))).toBeNull()
    expect(claudeVariantRow({ state: 'loading', placeholderCount: 2 })).toBeNull()
  })
})

describe('useClaudeVariantMenuLaunches', () => {
  it('hides variants when a paired host serves the workspace', () => {
    const model = settled([{ kind: 'cli', agent: 'claude' }])
    expect(renderHook(() => useClaudeVariantMenuLaunches(model)).variants).toEqual([kimi])

    mocks.isWebRuntimeSessionActive.mockReturnValue(true)
    expect(renderHook(() => useClaudeVariantMenuLaunches(model)).variants).toEqual([])
  })
})

describe('claudeVariantPickerChoices', () => {
  const launches: ClaudeVariantMenuLaunches = {
    variants: [kimi],
    row: { kind: 'cli', agent: 'claude' }
  }

  it('matches a variant by label or model and launches it through the Claude row', () => {
    const runLaunch = vi.fn<TabAgentMenuLaunch>()
    const [choice] = claudeVariantPickerChoices(launches, runLaunch) ?? []

    expect(choice?.matches?.('kimi')).toBe(true)
    expect(choice?.matches?.('k3.1-pro')).toBe(true)
    expect(choice?.matches?.('claude')).toBe(false)
    choice?.onSelect()
    expect(runLaunch).toHaveBeenCalledWith(launches.row, undefined, undefined, kimi)
  })

  it('lists nothing without a Claude row', () => {
    expect(claudeVariantPickerChoices({ ...launches, row: null }, vi.fn())).toBeUndefined()
  })
})

describe('useTabAgentMenuLaunch with a variant', () => {
  const launch = () =>
    renderHook(() =>
      useTabAgentMenuLaunch({ worktreeId: 'wt-1', groupId: 'g-1', onFocusTerminal: vi.fn() })
    )

  it('forwards the variant id on a terminal launch', () => {
    launch()({ kind: 'cli', agent: 'claude' }, undefined, undefined, kimi)

    expect(mocks.launchAgentInNewTabWithOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'claude',
        claudeVariantId: 'v1',
        requestedSurface: 'terminal',
        worktreeId: 'wt-1',
        groupId: 'g-1'
      })
    )
  })

  it('keeps plain Claude free of a variant id', () => {
    launch()({ kind: 'cli', agent: 'claude' })

    expect(mocks.launchAgentInNewTabWithOutcome.mock.calls[0]?.[0]).not.toHaveProperty(
      'claudeVariantId'
    )
  })
})
