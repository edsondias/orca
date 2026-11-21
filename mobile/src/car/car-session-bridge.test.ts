import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CarConversation } from '../../modules/orca-car-messaging/src'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import {
  CAR_DISCONNECTED_NOTICE_MS,
  CAR_SYSTEM_CONVERSATION_ID,
  createCarSessionBridge,
  type CarBridgeHost
} from './car-session-bridge'

function fakeHost(hostId = 'h1'): CarBridgeHost {
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
  return { hostId, client }
}

function harness(sendResult = 'delivered') {
  let onEvent: (event: unknown) => void = () => {}
  let onReply: (event: { conversationId: string; text: string }) => void = () => {}
  const published: CarConversation[] = []
  const deps = {
    messaging: {
      startSession: vi.fn().mockResolvedValue(undefined),
      stopSession: vi.fn().mockResolvedValue(undefined),
      publishConversation: vi.fn(async (c: CarConversation) => {
        published.push(c)
      }),
      clearConversation: vi.fn().mockResolvedValue(undefined),
      clearConversations: vi.fn().mockResolvedValue(undefined),
      addReplyListener: vi.fn(
        (listener: (event: { conversationId: string; text: string }) => void) => {
          onReply = listener
          return { remove() {} }
        }
      )
    },
    subscribe: vi.fn((_host: CarBridgeHost, listener: (event: unknown) => void) => {
      onEvent = listener
      return () => {}
    }),
    fetchMissed: vi.fn().mockResolvedValue([]),
    send: vi.fn().mockResolvedValue(sendResult),
    log: vi.fn(),
    canNotify: vi.fn().mockResolvedValue(true),
    now: () => 0
  }
  const bridge = createCarSessionBridge(deps)
  return {
    bridge,
    deps,
    published,
    emit: (e: unknown) => onEvent(e),
    reply: (e: { conversationId: string; text: string }) => onReply(e)
  }
}

const blocked = {
  type: 'notification',
  source: 'agent-task-complete',
  title: 'Claude · feat-login',
  body: 'Allow command?',
  notificationSeq: 7,
  agentState: 'blocked',
  promptRef: {
    kind: 'terminal',
    terminalHandle: 't1',
    fence: {
      generation: 1,
      permissionSequence: 0,
      blockedSince: 10,
      promptKey: null
    },
    permission: {
      lastAssistantMessage: 'Do you want to proceed?\n1. Yes\n2. No'
    }
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('car session bridge', () => {
  it('publishes a blocked agent as a repliable conversation', async () => {
    const h = harness()
    await h.bridge.start([fakeHost()])
    h.emit(blocked)
    await Promise.resolve()
    expect(h.published.at(-1)).toMatchObject({ canReply: true })
    expect(h.deps.log).toHaveBeenCalledWith('h1', 'car-session-started', expect.any(String))
  })

  it('answers a voice reply and appends the receipt without logging the text', async () => {
    const h = harness()
    await h.bridge.start([fakeHost()])
    h.emit(blocked)
    await Promise.resolve()
    const id = h.published.at(-1)!.id
    h.reply({ conversationId: id, text: 'um' })
    await vi.waitFor(() => expect(h.published.at(-1)?.messages.at(-1)?.text).toBe('✓ Sent: Yes'))
    expect(h.published.at(-1)?.canReply).toBe(false)
    expect(JSON.stringify(h.deps.log.mock.calls)).not.toContain('"um"')
  })

  it('keeps the prompt pending when the speech is not an option', async () => {
    const h = harness()
    await h.bridge.start([fakeHost()])
    h.emit(blocked)
    await Promise.resolve()
    const id = h.published.at(-1)!.id
    h.reply({ conversationId: id, text: 'banana' })
    await vi.waitFor(() =>
      expect(h.published.at(-1)?.messages.at(-1)?.text).toBe('Say the option number, or yes or no')
    )
    expect(h.published.at(-1)?.canReply).toBe(true)
    expect(h.deps.send).not.toHaveBeenCalled()
    h.reply({ conversationId: id, text: 'um' })
    await vi.waitFor(() => expect(h.deps.send).toHaveBeenCalledTimes(1))
  })

  it('points a reply to a finished agent back to the phone without sending it', async () => {
    const h = harness()
    await h.bridge.start([fakeHost()])
    h.emit({
      type: 'notification',
      source: 'agent-task-complete',
      title: 'Claude · feat-login',
      body: 'Done',
      notificationId: 'n1',
      notificationSeq: 8
    })
    await Promise.resolve()
    h.reply({ conversationId: h.published.at(-1)!.id, text: 'thanks' })
    await vi.waitFor(() =>
      expect(h.published.at(-1)?.messages.at(-1)?.text).toBe('Reply to this one from your phone')
    )
    expect(h.deps.send).not.toHaveBeenCalled()
  })

  it('ignores an Android Auto re-delivery of a reply that was already sent', async () => {
    const h = harness()
    await h.bridge.start([fakeHost()])
    h.emit(blocked)
    await Promise.resolve()
    const id = h.published.at(-1)!.id
    h.reply({ conversationId: id, text: 'um' })
    await vi.waitFor(() => expect(h.published.at(-1)?.messages.at(-1)?.text).toBe('✓ Sent: Yes'))
    const publishedBefore = h.published.length
    h.reply({ conversationId: id, text: 'um' })
    await Promise.resolve()
    await Promise.resolve()
    expect(h.published).toHaveLength(publishedBefore)
    expect(h.deps.send).toHaveBeenCalledTimes(1)
  })

  it('replays what the car missed while a host was disconnected', async () => {
    const h = harness()
    await h.bridge.start([fakeHost()])
    h.emit(blocked)
    await Promise.resolve()
    h.bridge.setHosts([])
    h.deps.fetchMissed.mockResolvedValue([
      { ...blocked, notificationSeq: 8, promptRef: { ...blocked.promptRef, terminalHandle: 't2' } }
    ])
    const reconnected = fakeHost()
    h.bridge.setHosts([reconnected])
    expect(h.deps.fetchMissed).toHaveBeenCalledWith(reconnected, { lastSeenSeq: 7 })
    await vi.waitFor(() => expect(h.published.at(-1)?.id).toBe('h1:terminal:t2'))
  })

  it('stops offering replies on a host without the method', async () => {
    const h = harness('method-not-found')
    await h.bridge.start([fakeHost()])
    h.emit(blocked)
    await Promise.resolve()
    h.reply({ conversationId: h.published.at(-1)!.id, text: 'um' })
    await vi.waitFor(() =>
      expect(h.published.at(-1)?.messages.at(-1)?.text).toBe(
        'Update Orca desktop to reply from the car'
      )
    )
    h.emit({ ...blocked, notificationSeq: 8 })
    await Promise.resolve()
    expect(h.published.at(-1)?.canReply).toBe(false)
  })

  it('clears the car conversations and stops the service on stop', async () => {
    const h = harness()
    await h.bridge.start([fakeHost()])
    await h.bridge.stop()
    expect(h.deps.messaging.clearConversations).toHaveBeenCalled()
    expect(h.deps.messaging.stopSession).toHaveBeenCalled()
  })

  it('does not start without notification permission', async () => {
    const h = harness()
    h.deps.canNotify.mockResolvedValue(false)
    await expect(h.bridge.start([fakeHost()])).resolves.toBe('no-notification-permission')
    expect(h.deps.messaging.startSession).not.toHaveBeenCalled()
  })

  it('reports a refused foreground service start without throwing or subscribing', async () => {
    const h = harness()
    h.deps.messaging.startSession.mockRejectedValue(new Error('ForegroundServiceStartNotAllowed'))
    await expect(h.bridge.start([fakeHost()])).resolves.toBe('service-start-refused')
    expect(h.deps.subscribe).not.toHaveBeenCalled()
    expect(h.deps.log).toHaveBeenCalledWith('h1', 'car-session-ended', expect.any(String))
  })

  it('does not attach anything when stopped while the service was starting', async () => {
    const h = harness()
    let release: () => void = () => {}
    h.deps.messaging.startSession.mockReturnValue(
      new Promise<void>((resolve) => (release = resolve))
    )
    const starting = h.bridge.start([fakeHost()])
    await vi.waitFor(() => expect(h.deps.messaging.startSession).toHaveBeenCalled())
    const stopping = h.bridge.stop()
    release()
    await expect(starting).resolves.toBe('stopped')
    await stopping
    expect(h.deps.subscribe).not.toHaveBeenCalled()
    expect(h.deps.messaging.addReplyListener).not.toHaveBeenCalled()
  })

  it('keeps a host recorded during a pending start subscribed after start resolves', async () => {
    vi.useFakeTimers()
    const h = harness()
    let release: () => void = () => {}
    h.deps.messaging.startSession.mockReturnValue(
      new Promise<void>((resolve) => (release = resolve))
    )
    const unsubscribe = vi.fn()
    h.deps.subscribe.mockReturnValue(unsubscribe)
    const starting = h.bridge.start([])
    await vi.waitFor(() => expect(h.deps.messaging.startSession).toHaveBeenCalled())
    h.bridge.setHosts([fakeHost()])
    expect(h.deps.subscribe).not.toHaveBeenCalled()
    release()
    await expect(starting).resolves.toBe('started')
    vi.advanceTimersByTime(CAR_DISCONNECTED_NOTICE_MS * 2)
    expect(h.deps.subscribe).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(h.published).toHaveLength(0)
  })

  it('leaves no subscription or notice timer after a failed start', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.deps.messaging.startSession.mockRejectedValue(new Error('refused'))
    await expect(h.bridge.start([])).resolves.toBe('service-start-refused')
    h.bridge.setHosts([])
    vi.advanceTimersByTime(CAR_DISCONNECTED_NOTICE_MS * 2)
    expect(h.deps.subscribe).not.toHaveBeenCalled()
    expect(h.published).toHaveLength(0)
  })

  it('keeps a newer prompt pending when it arrives while the reply is in flight', async () => {
    const h = harness()
    let settle: (value: string) => void = () => {}
    h.deps.send.mockReturnValue(new Promise<string>((resolve) => (settle = resolve)))
    await h.bridge.start([fakeHost()])
    h.emit(blocked)
    await Promise.resolve()
    const id = h.published.at(-1)!.id
    h.reply({ conversationId: id, text: 'um' })
    await vi.waitFor(() => expect(h.deps.send).toHaveBeenCalled())
    h.emit({ ...blocked, notificationSeq: 8 })
    settle('prompt-changed')
    await vi.waitFor(() =>
      expect(h.published.at(-1)?.messages.at(-1)?.text).toBe(
        'The agent already moved on; reply discarded'
      )
    )
    expect(h.published.at(-1)?.canReply).toBe(true)
  })

  it('says once that the desktop is unreachable after 60 seconds, and only once', async () => {
    vi.useFakeTimers()
    const h = harness()
    await h.bridge.start([fakeHost()])
    h.bridge.setHosts([])
    vi.advanceTimersByTime(CAR_DISCONNECTED_NOTICE_MS)
    vi.advanceTimersByTime(CAR_DISCONNECTED_NOTICE_MS)
    const notices = h.published.filter(
      (c) => c.messages.at(-1)?.text === 'No connection to the desktop'
    )
    expect(notices).toHaveLength(1)
    h.bridge.setHosts([fakeHost()])
    expect(h.deps.messaging.clearConversation).toHaveBeenCalledWith(CAR_SYSTEM_CONVERSATION_ID)
  })
})
