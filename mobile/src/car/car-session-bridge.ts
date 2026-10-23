import type { OrcaCarMessaging } from '../../modules/orca-car-messaging/src'
import type { RpcClient } from '../transport/rpc-client'
import { CAR_COPY } from './car-copy'
import { createCarConversationStore, type CarNotificationEvent } from './car-conversation-store'
import { createCarNotificationCatchUp } from './car-notification-catch-up'
import { CAR_REPLY_DEDUPE_MS } from './car-reply-normalization'
import { carReplyReceipt, createCarReplyRouter } from './car-reply-router'

export type CarBridgeHost = {
  hostId: string
  client: RpcClient
  deviceToken?: string
}
export type CarLogCode =
  | 'car-session-started'
  | 'car-session-ended'
  | 'car-reply-delivered'
  | 'car-reply-refused'
export type CarSessionStartResult =
  | 'started'
  | 'no-notification-permission'
  | 'service-start-refused'
  | 'stopped'

type Deps = {
  messaging: Pick<
    typeof OrcaCarMessaging,
    | 'startSession'
    | 'stopSession'
    | 'publishConversation'
    | 'clearConversation'
    | 'clearConversations'
    | 'addReplyListener'
  >
  subscribe(host: CarBridgeHost, onEvent: (event: unknown) => void): () => void
  fetchMissed: Parameters<typeof createCarNotificationCatchUp>[0]['fetchMissed']
  send: Parameters<typeof createCarReplyRouter>[0]['send']
  log(hostId: string, code: CarLogCode, detail: string): void
  canNotify(): Promise<boolean>
  now(): number
}

export const CAR_DISCONNECTED_NOTICE_MS = 60_000
export const CAR_SYSTEM_CONVERSATION_ID = 'orca:system'

export function createCarSessionBridge(deps: Deps) {
  const conversations = createCarConversationStore(deps.now)
  const router = createCarReplyRouter({ send: deps.send, now: deps.now })
  const catchUp = createCarNotificationCatchUp(deps)
  // Spoken reply per conversation and the prompt it answered, so an Android Auto re-delivery stays silent.
  const answered = new Map<string, { seq: number; at: number }>()
  const subscriptions = new Map<string, { client: RpcClient; unsubscribe: () => void }>()
  let replyListener: { remove(): void } | null = null
  // Bumped by stop() so a start still awaiting the native service attaches nothing.
  let epoch = 0
  // Until the native service is up, setHosts only records the latest list; start applies it.
  let started = false
  let latestHosts: CarBridgeHost[] = []

  const publish = (conversation: ReturnType<typeof conversations.applyEvent>) => {
    if (conversation) {
      void deps.messaging.publishConversation(conversation)
    }
  }

  const onEvent = (hostId: string) => (event: CarNotificationEvent) => {
    const conversation = conversations.applyEvent(hostId, event)
    if (conversation && router.isHostUnsupported(hostId)) {
      conversations.clearPendingPrompt(conversation.id)
      publish({ ...conversation, canReply: false })
      return
    }
    publish(conversation)
  }

  const handleReply = async ({
    conversationId,
    text
  }: {
    conversationId: string
    text: string
  }) => {
    const answerKey = `${conversationId}|${text.trim()}`
    const previous = answered.get(answerKey)
    const prompt = conversations.pendingPrompt(conversationId)
    if (
      previous &&
      deps.now() - previous.at < CAR_REPLY_DEDUPE_MS &&
      (!prompt || prompt.notificationSeq === previous.seq)
    ) {
      return
    }
    if (!prompt) {
      const outcome = conversations.hadTerminalPrompt(conversationId)
        ? ({ kind: 'prompt-changed' } as const)
        : ({ kind: 'reply-from-phone' } as const)
      publish(conversations.appendOrcaMessage(conversationId, carReplyReceipt(outcome) ?? ''))
      return
    }
    conversations.appendMyMessage(conversationId, text)
    const outcome = await router.reply(conversationId, prompt, text)
    if (outcome.kind === 'duplicate') {
      return
    }
    if (outcome.kind !== 'not-an-option') {
      for (const [key, entry] of answered) {
        if (deps.now() - entry.at >= CAR_REPLY_DEDUPE_MS) {
          answered.delete(key)
        }
      }
      answered.set(answerKey, { seq: prompt.notificationSeq, at: deps.now() })
    }
    // The driver can answer again after speech that matched no option.
    // A newer prompt for the same agent may have arrived while the reply was in flight; it stays pending.
    const stillCurrent =
      conversations.pendingPrompt(conversationId)?.notificationSeq === prompt.notificationSeq
    if (outcome.kind !== 'not-an-option' && stillCurrent) {
      conversations.clearPendingPrompt(conversationId)
    }
    deps.log(
      prompt.hostId,
      outcome.kind === 'delivered' ? 'car-reply-delivered' : 'car-reply-refused',
      `${outcome.kind}, ${text.length} chars`
    )
    publish(conversations.appendOrcaMessage(conversationId, carReplyReceipt(outcome) ?? ''))
  }

  let disconnectedTimer: ReturnType<typeof setTimeout> | null = null
  let disconnectedNoticeShown = false

  // One notice per outage; replies are never queued meanwhile.
  const trackReachability = (connectedHosts: number) => {
    if (connectedHosts > 0) {
      if (disconnectedTimer) {
        clearTimeout(disconnectedTimer)
        disconnectedTimer = null
      }
      if (disconnectedNoticeShown) {
        disconnectedNoticeShown = false
        void deps.messaging.clearConversation(CAR_SYSTEM_CONVERSATION_ID)
      }
      return
    }
    if (disconnectedTimer || disconnectedNoticeShown) {
      return
    }
    disconnectedTimer = setTimeout(() => {
      disconnectedTimer = null
      disconnectedNoticeShown = true
      void deps.messaging.publishConversation({
        id: CAR_SYSTEM_CONVERSATION_ID,
        title: 'Orca',
        canReply: false,
        messages: [
          {
            sender: 'orca',
            text: CAR_COPY.disconnected,
            timestamp: deps.now()
          }
        ]
      })
    }, CAR_DISCONNECTED_NOTICE_MS)
  }

  const setHosts = (hosts: CarBridgeHost[]) => {
    latestHosts = hosts
    if (!started) {
      return
    }
    trackReachability(hosts.length)
    const wanted = new Map(hosts.map((host) => [host.hostId, host]))
    for (const [hostId, entry] of subscriptions) {
      if (wanted.get(hostId)?.client !== entry.client) {
        entry.unsubscribe()
        subscriptions.delete(hostId)
      }
    }
    for (const host of hosts) {
      if (!subscriptions.has(host.hostId)) {
        subscriptions.set(host.hostId, {
          client: host.client,
          unsubscribe: catchUp.attach(host, onEvent(host.hostId))
        })
        deps.log(host.hostId, 'car-session-started', 'notifications stream attached')
      }
    }
  }

  return {
    async start(hosts: CarBridgeHost[]): Promise<CarSessionStartResult> {
      const startEpoch = epoch
      latestHosts = hosts
      if (!(await deps.canNotify())) {
        return 'no-notification-permission'
      }
      if (startEpoch !== epoch) {
        return 'stopped'
      }
      try {
        await deps.messaging.startSession()
      } catch {
        // Android 12+ refuses a foreground service started from the background; the cause is not logged beyond this.
        for (const host of hosts) {
          deps.log(host.hostId, 'car-session-ended', 'foreground service start refused')
        }
        return 'service-start-refused'
      }
      if (startEpoch !== epoch) {
        // stop() ran before the service came up, so its stopSession missed this one.
        await deps.messaging.stopSession().catch(() => {})
        return 'stopped'
      }
      replyListener = deps.messaging.addReplyListener((event) => void handleReply(event))
      started = true
      setHosts(latestHosts)
      return 'started'
    },
    setHosts,
    async stop() {
      epoch += 1
      started = false
      if (disconnectedTimer) {
        clearTimeout(disconnectedTimer)
        disconnectedTimer = null
      }
      disconnectedNoticeShown = false
      for (const [hostId, entry] of subscriptions) {
        entry.unsubscribe()
        deps.log(hostId, 'car-session-ended', 'car session ended')
      }
      subscriptions.clear()
      catchUp.clear()
      answered.clear()
      replyListener?.remove()
      replyListener = null
      conversations.clear()
      await deps.messaging.clearConversations()
      await deps.messaging.stopSession()
    }
  }
}
