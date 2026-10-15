import {
  createHarness as createPushHarness,
  registration,
  flush
} from '../runtime/push/push-dispatcher.test-fixture'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { createNotificationDeliveryService } from './notification-delivery-service'
import type { NotificationDeliveryDependencies } from './notification-delivery-service'
import type {
  NotificationDispatchRequest,
  NotificationSettings
} from '../../shared/notification-settings-types'

function makeSettings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    enabled: true,
    agentTaskComplete: true,
    terminalBell: true,
    suppressWhenFocused: false,
    customSoundId: 'system',
    customSoundPath: null,
    customSoundVolume: 1,
    mutedNotificationSourceIds: [],
    ...overrides
  }
}

function makeRequest(
  overrides: Partial<NotificationDispatchRequest> = {}
): NotificationDispatchRequest {
  return {
    source: 'agent-task-complete',
    worktreeId: 'wt-1',
    worktreeLabel: 'wt-1',
    ...overrides
  }
}

type Harness = {
  deps: NotificationDeliveryDependencies
  order: string[]
  setTrayAttention: ReturnType<typeof vi.fn>
  dispatchMobileNotification: ReturnType<typeof vi.fn>
  deliverNative: ReturnType<typeof vi.fn>
}

let now = 1_000

/** The delivery policy only asks a window whether it is focused. */
function makeFocusedWindowStub(): BrowserWindow {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the service reads only isFocused(); a full BrowserWindow cannot be constructed outside Electron.
  return { isFocused: () => true } as unknown as BrowserWindow
}

function makeHarness(settings: NotificationSettings, windowVisible = false): Harness {
  const order: string[] = []
  const setTrayAttention = vi.fn(() => order.push('tray'))
  const dispatchMobileNotification = vi.fn(() => order.push('mobile'))
  const deliverNative = vi.fn(() => {
    order.push('native')
    return { delivered: true } as const
  })
  return {
    order,
    setTrayAttention,
    dispatchMobileNotification,
    deliverNative,
    deps: {
      readNotificationSettings: () => settings,
      findActiveWindow: () => null,
      isWindowVisible: () => windowVisible,
      setTrayAttention,
      isNotificationSupported: () => true,
      dispatchMobileNotification,
      readAuthorizationStatus: () => Promise.resolve('authorized'),
      recordDeliveryOutcome: vi.fn(),
      deliverNative,
      platform: 'linux',
      now: () => now
    }
  }
}

beforeEach(() => {
  now += 60_000
})

describe('createNotificationDeliveryService', () => {
  it('lights the tray dot before the enabled/cooldown gates can reject the event', () => {
    const harness = makeHarness(makeSettings({ enabled: false }))
    const result = createNotificationDeliveryService(harness.deps).dispatch(makeRequest())

    expect(harness.setTrayAttention).toHaveBeenCalledWith(true)
    expect(result).toEqual({ delivered: false, reason: 'disabled' })
    expect(harness.deliverNative).not.toHaveBeenCalled()
    expect(harness.order[0]).toBe('tray')
  })

  it('leaves the tray dot alone while the window is visible', () => {
    const harness = makeHarness(makeSettings(), true)
    createNotificationDeliveryService(harness.deps).dispatch(makeRequest())
    expect(harness.setTrayAttention).not.toHaveBeenCalled()
  })

  it('fans out to mobile before the desktop-disabled early return', () => {
    const harness = makeHarness(makeSettings({ agentTaskComplete: false }))
    const result = createNotificationDeliveryService(harness.deps).dispatch(makeRequest())

    expect(result).toEqual({ delivered: false, reason: 'source-disabled' })
    expect(harness.dispatchMobileNotification).toHaveBeenCalledWith(
      expect.objectContaining({ desktopAllowed: false, source: 'agent-task-complete' })
    )
    expect(harness.order).toEqual(['tray', 'mobile'])
  })

  it('keeps the desktop source gates distinct per source', () => {
    const harness = makeHarness(makeSettings({ terminalBell: false }))
    const service = createNotificationDeliveryService(harness.deps)
    expect(service.dispatch(makeRequest({ source: 'terminal-bell' }))).toEqual({
      delivered: false,
      reason: 'source-disabled'
    })
    expect(service.dispatch(makeRequest({ worktreeId: 'wt-2', worktreeLabel: 'wt-2' }))).toEqual({
      delivered: true
    })
  })

  it('skips the desktop banner for a muted machine but still reaches the phone', () => {
    const harness = makeHarness(makeSettings({ mutedNotificationSourceIds: ['runtime:m4air'] }))
    const service = createNotificationDeliveryService(harness.deps)

    expect(service.dispatch(makeRequest({ notificationSourceId: 'runtime:m4air' }))).toEqual({
      delivered: false,
      reason: 'host-muted'
    })
    expect(harness.dispatchMobileNotification).toHaveBeenCalledWith(
      expect.not.objectContaining({ desktopAllowed: false })
    )
    expect(harness.deliverNative).not.toHaveBeenCalled()

    // Other machines, and requests whose machine is unknown, still notify.
    expect(
      service.dispatch(
        makeRequest({ notificationSourceId: 'local', worktreeId: 'wt-2', worktreeLabel: 'wt-2' })
      )
    ).toEqual({ delivered: true })
    expect(service.dispatch(makeRequest({ worktreeId: 'wt-3', worktreeLabel: 'wt-3' }))).toEqual({
      delivered: true
    })
  })

  it('reports the master switch over a muted machine', () => {
    const harness = makeHarness(
      makeSettings({ enabled: false, mutedNotificationSourceIds: ['runtime:m4air'] })
    )
    expect(
      createNotificationDeliveryService(harness.deps).dispatch(
        makeRequest({ notificationSourceId: 'runtime:m4air' })
      )
    ).toEqual({ delivered: false, reason: 'disabled' })
  })

  it('suppresses a focused active workspace without touching mobile delivery', () => {
    const harness = makeHarness(makeSettings({ suppressWhenFocused: true }))
    const focusedWindow = makeFocusedWindowStub()
    harness.deps.findActiveWindow = () => focusedWindow
    const result = createNotificationDeliveryService(harness.deps).dispatch(
      makeRequest({ isActiveWorktree: true })
    )

    expect(result).toEqual({ delivered: false, reason: 'suppressed-focus' })
    expect(harness.dispatchMobileNotification).toHaveBeenCalledTimes(1)
  })

  it('dedupes desktop bursts per workspace but still reports the first delivery', () => {
    const harness = makeHarness(makeSettings())
    const service = createNotificationDeliveryService(harness.deps)
    expect(service.dispatch(makeRequest())).toEqual({ delivered: true })
    expect(service.dispatch(makeRequest({ source: 'terminal-bell' }))).toEqual({
      delivered: false,
      reason: 'cooldown'
    })
  })

  it('lets keyed news through the workspace window, collapsing only its own repeat', () => {
    const harness = makeHarness(makeSettings())
    const service = createNotificationDeliveryService(harness.deps)
    expect(service.dispatch(makeRequest())).toEqual({ delivered: true })
    const prompt = (attentionKey: string) => makeRequest({ agentState: 'blocked', attentionKey })
    expect(service.dispatch(prompt('p1'))).toEqual({ delivered: true })
    expect(service.dispatch(prompt('p2'))).toEqual({ delivered: true })
    expect(service.dispatch(prompt('p2'))).toEqual({ delivered: false, reason: 'cooldown' })
    expect(harness.dispatchMobileNotification).toHaveBeenCalledWith(
      expect.objectContaining({ attentionKey: 'p1', agentState: 'blocked' })
    )
  })

  it('leaves the phone to the execution host when it already pushed', () => {
    const harness = makeHarness(makeSettings())
    const service = createNotificationDeliveryService(harness.deps)
    expect(service.dispatch(makeRequest({ mobileDeliveredByHost: true }))).toEqual({
      delivered: true
    })
    expect(harness.dispatchMobileNotification).not.toHaveBeenCalled()
  })

  it('skips mobile fan-out entirely when no runtime is paired', () => {
    const harness = makeHarness(makeSettings())
    harness.deps.dispatchMobileNotification = null
    expect(createNotificationDeliveryService(harness.deps).dispatch(makeRequest())).toEqual({
      delivered: true
    })
    expect(harness.dispatchMobileNotification).not.toHaveBeenCalled()
  })

  it('reports blocked-by-system on macOS when permission is undecided', async () => {
    const harness = makeHarness(makeSettings())
    harness.deps.platform = 'darwin'
    harness.deps.readAuthorizationStatus = () => Promise.resolve('not-determined')
    await expect(
      createNotificationDeliveryService(harness.deps).dispatch(makeRequest())
    ).resolves.toEqual({ delivered: false, reason: 'blocked-by-system' })
    expect(harness.deliverNative).not.toHaveBeenCalled()
  })

  it('attaches the prompt reference the runtime resolves for the pane', async () => {
    const promptRef = {
      kind: 'terminal' as const,
      terminalHandle: 't1',
      fence: { generation: 1, permissionSequence: 0, blockedSince: 5, promptKey: null }
    }
    const harness = makeHarness(makeSettings())
    harness.deps.resolvePromptRef = () => promptRef
    await createNotificationDeliveryService(harness.deps).dispatch(
      makeRequest({ paneKey: 'p1', agentState: 'blocked' })
    )
    expect(harness.dispatchMobileNotification).toHaveBeenCalledWith(
      expect.objectContaining({ promptRef })
    )
  })

  it('resolves no terminal prompt reference unless the agent is blocked or waiting', async () => {
    const harness = makeHarness(makeSettings())
    const resolvePromptRef = vi.fn(() => ({
      kind: 'terminal' as const,
      terminalHandle: 't1',
      fence: { generation: 1, permissionSequence: 0, blockedSince: 5, promptKey: null }
    }))
    harness.deps.resolvePromptRef = resolvePromptRef
    await createNotificationDeliveryService(harness.deps).dispatch(
      makeRequest({ paneKey: 'p1', agentState: 'done' })
    )
    expect(resolvePromptRef).not.toHaveBeenCalled()
    expect(harness.dispatchMobileNotification.mock.calls[0]?.[0]).not.toHaveProperty('promptRef')
  })

  it('sends a structured reference when a blocked request names an agent session', async () => {
    const harness = makeHarness(makeSettings())
    harness.deps.resolvePromptRef = () => undefined
    await createNotificationDeliveryService(harness.deps).dispatch(
      makeRequest({ agentSessionId: 's1', agentState: 'blocked' })
    )
    expect(harness.dispatchMobileNotification).toHaveBeenCalledWith(
      expect.objectContaining({ promptRef: { kind: 'structured', sessionId: 's1' } })
    )
  })

  it('sends no structured reference for a finished session', async () => {
    const harness = makeHarness(makeSettings())
    await createNotificationDeliveryService(harness.deps).dispatch(
      makeRequest({ agentSessionId: 's1', agentState: 'done' })
    )
    expect(harness.dispatchMobileNotification.mock.calls[0]?.[0]).not.toHaveProperty('promptRef')
  })

  it('still announces on mobile and desktop when the prompt reference lookup throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const harness = makeHarness(makeSettings())
    harness.deps.resolvePromptRef = () => {
      throw new Error('runtime_unavailable')
    }
    const result = await createNotificationDeliveryService(harness.deps).dispatch(
      makeRequest({ paneKey: 'p1', agentState: 'blocked' })
    )
    expect(result).toEqual({ delivered: true })
    expect(harness.deliverNative).toHaveBeenCalled()
    expect(harness.dispatchMobileNotification.mock.calls[0]?.[0]).not.toHaveProperty('promptRef')
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

it.each<Partial<NotificationSettings>>([{}, { enabled: false }, { agentTaskComplete: false }])(
  'preserves mobile event content and push eligibility when a machine is muted (%j)',
  async (overrides) => {
    const events: Parameters<
      NonNullable<NotificationDeliveryDependencies['dispatchMobileNotification']>
    >[0][] = []
    for (const muted of [false, true]) {
      const push = createPushHarness({
        devices: [{ deviceId: 'phone', pushRegistration: registration() }]
      })
      const harness = makeHarness(
        makeSettings({ ...overrides, mutedNotificationSourceIds: muted ? ['runtime:qa'] : [] })
      )
      harness.deps.dispatchMobileNotification = (event) => {
        events.push(event)
        push.dispatcher.enqueue({ ...event, notificationSeq: 1, notificationEpoch: 'epoch' })
      }
      createNotificationDeliveryService(harness.deps).dispatch(
        makeRequest({ notificationSourceId: 'runtime:qa', agentState: 'done' })
      )
      await flush()
      expect(push.sends).toHaveLength(
        overrides.enabled === false || overrides.agentTaskComplete === false ? 0 : 1
      )
    }
    expect(events[1]).toEqual(events[0])
  }
)

it('changing a machine mute preserves mobile cooldown and does not reserve desktop cooldown', () => {
  const settings = makeSettings({ mutedNotificationSourceIds: ['runtime:qa'] })
  const harness = makeHarness(settings)
  const service = createNotificationDeliveryService(harness.deps)
  const request = makeRequest({ notificationSourceId: 'runtime:qa' })
  expect(service.dispatch(request)).toEqual({ delivered: false, reason: 'host-muted' })
  settings.mutedNotificationSourceIds = []
  expect(service.dispatch(request)).toEqual({ delivered: true })
  expect(harness.dispatchMobileNotification).toHaveBeenCalledTimes(1)
})

it('reports a muted host before a disabled source', () => {
  const harness = makeHarness(
    makeSettings({ agentTaskComplete: false, mutedNotificationSourceIds: ['runtime:qa'] })
  )
  expect(
    createNotificationDeliveryService(harness.deps).dispatch(
      makeRequest({ notificationSourceId: 'runtime:qa' })
    )
  ).toEqual({ delivered: false, reason: 'host-muted' })
})

it("tells the phone which server runs the workspace, through the gateway's push", async () => {
  for (const executionHost of [undefined, 'runtime:qa'] as const) {
    const push = createPushHarness({
      devices: [{ deviceId: 'phone', pushRegistration: registration() }]
    })
    const harness = makeHarness(makeSettings())
    harness.deps.dispatchMobileNotification = (event) =>
      push.dispatcher.enqueue({ ...event, notificationSeq: 1, notificationEpoch: 'epoch' })
    createNotificationDeliveryService(harness.deps).dispatch(
      makeRequest({ agentState: 'done', ...(executionHost ? { executionHost } : {}) })
    )
    await flush()
    expect(push.sends[0]?.notification.worktreeId).toBe('wt-1')
    expect(push.sends[0]?.notification.executionHost).toBe(executionHost)
  }
})
