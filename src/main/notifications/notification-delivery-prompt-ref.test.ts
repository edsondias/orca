import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNotificationDeliveryService } from './notification-delivery-service'
import type { NotificationDeliveryDependencies } from './notification-delivery-service'
import type {
  NotificationDispatchRequest,
  NotificationSettings
} from '../../shared/notifications/notification-settings-types'
import { getDefaultNotificationSettings } from '../../shared/notifications/notification-settings-defaults'

function makeSettings(): NotificationSettings {
  return { ...getDefaultNotificationSettings(), suppressWhenFocused: false }
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

let now = 1_000

function makeHarness(settings: NotificationSettings): {
  deps: NotificationDeliveryDependencies
  dispatchMobileNotification: ReturnType<typeof vi.fn>
  deliverNative: ReturnType<typeof vi.fn>
} {
  const dispatchMobileNotification = vi.fn()
  const deliverNative = vi.fn(() => ({ delivered: true }) as const)
  return {
    dispatchMobileNotification,
    deliverNative,
    deps: {
      readNotificationSettings: () => settings,
      findActiveWindow: () => null,
      isWindowVisible: () => false,
      setTrayAttention: vi.fn(),
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

describe('notification prompt references', () => {
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
