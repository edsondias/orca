import { describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import type { CarBridgeHost } from './car-session-bridge'
import { createCarNotificationCatchUp } from './car-notification-catch-up'

const client: RpcClient = {
  sendRequest: vi.fn(),
  subscribe: () => () => {},
  updateTerminalSubscriptionViewport: vi.fn(),
  getState: () => 'connected',
  getReconnectAttempt: () => 0,
  getLastConnectedAt: () => null,
  onStateChange: () => () => {},
  notifyForeground: vi.fn(),
  close: vi.fn()
}
const host: CarBridgeHost = { hostId: 'h1', client }

function note(seq: number, extra: Record<string, unknown> = {}) {
  return {
    type: 'notification',
    source: 'agent-task-complete',
    title: `n${seq}`,
    body: '',
    notificationSeq: seq,
    notificationEpoch: 'e1',
    emittedAt: 1_000 + seq,
    ...extra
  }
}

function harness(now = 1_000) {
  const listeners: Array<(event: unknown) => void> = []
  let settleMissed: (events: unknown[] | null) => void = () => {}
  const deps = {
    subscribe: vi.fn((_host: CarBridgeHost, listener: (event: unknown) => void) => {
      listeners.push(listener)
      return () => {}
    }),
    fetchMissed: vi.fn(
      () => new Promise<unknown[] | null>((resolve) => (settleMissed = (events) => resolve(events)))
    ),
    now: () => now
  }
  const seen: string[] = []
  const catchUp = createCarNotificationCatchUp(deps)
  const attach = () => catchUp.attach(host, (event) => seen.push(event.title))
  return {
    deps,
    seen,
    catchUp,
    attach,
    emit: (event: unknown) => listeners.at(-1)?.(event),
    settleMissed: (events: unknown[] | null) => settleMissed(events)
  }
}

describe('car notification catch-up', () => {
  it('asks for nothing on the first attach', () => {
    const h = harness()
    h.attach()
    h.emit({ type: 'ready', subscriptionId: 's1', epoch: 'e1' })
    h.emit(note(3))
    expect(h.deps.fetchMissed).not.toHaveBeenCalled()
    expect(h.seen).toEqual(['n3'])
  })

  it('replays what a dropped stream missed, in order, before live events', async () => {
    const h = harness()
    const detach = h.attach()
    h.emit({ type: 'ready', subscriptionId: 's1', epoch: 'e1' })
    h.emit(note(3))
    detach()
    h.attach()
    expect(h.deps.fetchMissed).toHaveBeenCalledWith(host, { lastSeenSeq: 3, epoch: 'e1' })
    h.emit(note(6))
    h.settleMissed([note(5), note(4), note(6)])
    await vi.waitFor(() => expect(h.seen).toEqual(['n3', 'n4', 'n5', 'n6']))
  })

  it('replays from the start of the session when no event was seen yet', async () => {
    const h = harness(1_004)
    const detach = h.attach()
    h.emit({ type: 'ready', subscriptionId: 's1', epoch: 'e1' })
    detach()
    h.attach()
    expect(h.deps.fetchMissed).toHaveBeenCalledWith(host, { lastSeenSeq: 0, epoch: 'e1' })
    h.settleMissed([note(2), note(5)])
    await vi.waitFor(() => expect(h.seen).toEqual(['n5']))
  })

  it('accepts a restarted host whose counter went back to zero', async () => {
    const h = harness()
    const detach = h.attach()
    h.emit(note(9))
    detach()
    h.attach()
    h.emit({ type: 'ready', subscriptionId: 's2', epoch: 'e2' })
    h.settleMissed([note(1, { notificationEpoch: 'e2' }), note(2, { notificationEpoch: 'e2' })])
    await vi.waitFor(() => expect(h.seen).toEqual(['n9', 'n1', 'n2']))
  })

  it('still delivers live events when the replay fails', async () => {
    const h = harness()
    const detach = h.attach()
    h.emit(note(3))
    detach()
    h.attach()
    h.emit(note(4))
    h.settleMissed(null)
    await vi.waitFor(() => expect(h.seen).toEqual(['n3', 'n4']))
  })

  it('treats the next attach as the first after clear', () => {
    const h = harness()
    const detach = h.attach()
    h.emit(note(3))
    detach()
    h.catchUp.clear()
    h.attach()
    expect(h.deps.fetchMissed).not.toHaveBeenCalled()
  })
})
