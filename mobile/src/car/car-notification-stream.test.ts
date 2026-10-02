import { describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { fetchMissedCarNotifications, subscribeToCarNotifications } from './car-notification-stream'

function fakeClient() {
  let listener: (data: unknown) => void = () => {}
  const unsubscribe = vi.fn()
  const sendRequest = vi.fn().mockResolvedValue({ id: 'r', ok: true, result: {} })
  const subscribe = vi.fn((_method: string, _params: unknown, onData: (data: unknown) => void) => {
    listener = onData
    return unsubscribe
  })
  const client: RpcClient = {
    sendRequest,
    subscribe,
    updateTerminalSubscriptionViewport: vi.fn(),
    getState: () => 'connected',
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => null,
    onStateChange: () => () => {},
    notifyForeground: vi.fn(),
    close: vi.fn()
  }
  return {
    client,
    subscribe,
    sendRequest,
    unsubscribe,
    emit: (data: unknown) => listener(data)
  }
}

describe('subscribeToCarNotifications', () => {
  it('includes desktop-suppressed events and forwards them', () => {
    const f = fakeClient()
    const onEvent = vi.fn()
    subscribeToCarNotifications(f.client, onEvent)
    expect(f.subscribe).toHaveBeenCalledWith(
      'notifications.subscribe',
      { includeDesktopSuppressed: true },
      expect.any(Function)
    )
    f.emit({ type: 'notification' })
    expect(onEvent).toHaveBeenCalledWith({ type: 'notification' })
  })

  it('closes the host stream with the ready subscription id on dispose', () => {
    const f = fakeClient()
    const dispose = subscribeToCarNotifications(f.client, () => {})
    f.emit({ type: 'ready', subscriptionId: 's1' })
    dispose()
    expect(f.unsubscribe).toHaveBeenCalled()
    expect(f.sendRequest).toHaveBeenCalledWith('notifications.unsubscribe', {
      subscriptionId: 's1'
    })
  })
})

describe('fetchMissedCarNotifications', () => {
  it('asks for desktop-suppressed events since the watermark and returns them', async () => {
    const f = fakeClient()
    const missed = [{ type: 'notification', notificationSeq: 8 }]
    f.sendRequest.mockResolvedValue({
      id: 'r',
      ok: true,
      result: { notifications: missed, epoch: 'e1' }
    })
    await expect(
      fetchMissedCarNotifications(f.client, { lastSeenSeq: 7, epoch: 'e1' })
    ).resolves.toEqual(missed)
    expect(f.sendRequest).toHaveBeenCalledWith('notifications.getMissedSince', {
      lastSeenSeq: 7,
      epoch: 'e1',
      includeDesktopSuppressed: true
    })
  })

  it('reports null when the host refuses', async () => {
    const f = fakeClient()
    f.sendRequest.mockResolvedValue({
      id: 'r',
      ok: false,
      error: { code: 'internal', message: 'boom' }
    })
    await expect(fetchMissedCarNotifications(f.client, { lastSeenSeq: 7 })).resolves.toBeNull()
  })
})
