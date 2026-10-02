import type { OrcaCarMessaging } from '../../modules/orca-car-messaging/src'
import type { RpcClient } from '../transport/rpc-client'
import { CAR_COPY } from './car-copy'
import { createCarConversationStore, type CarNotificationEvent } from './car-conversation-store'
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
  send: Parameters<typeof createCarReplyRouter>[0]['send']
  log(hostId: string, code: CarLogCode, detail: string): void
  canNotify(): Promise<boolean>
  now(): number
}

export const CAR_DISCONNECTED_NOTICE_MS = 60_000
export const CAR_SYSTEM_CONVERSATION_ID = 'orca:system'

function isCarNotificationEvent(value: unknown): value is CarNotificationEvent {
  return (
    typeof value === 'object' && value !== null && 'type' in value && value.type === 'notification'
  )
}

export function createCarSessionBridge(deps: Deps) {
  const conversations = createCarConversationStore(deps.now)
  const router = createCarReplyRouter({ send: deps.send, now: deps.now })
  const subscriptions = new Map<string, { client: RpcClient; unsubscribe: () => void }>()
  let replyListener: { remove(): void } | null = null
  // Bumped by stop() so a start still awaiting the native service attaches nothing.
  let epoch = 0

  const publish = (conversation: ReturnType<typeof conversations.applyEvent>) => {
    if (conversation) {
      void deps.messaging.publishConversation(conversation)
    }
  }

  const onEvent = (hostId: string) => (event: unknown) => {
    if (!isCarNotificationEvent(event)) {
      return
    }
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
    const prompt = conversations.pendingPrompt(conversationId)
    if (!prompt) {
      publish(
        conversations.appendOrcaMessage(
          conversationId,
          carReplyReceipt({ kind: 'prompt-changed' }) ?? ''
        )
      )
      return
    }
    conversations.appendMyMessage(conversationId, text)
    const outcome = await router.reply(conversationId, prompt, text)
    if (outcome.kind === 'duplicate') {
      return
    }
    // The driver can answer again after speech that matched no option.
    if (outcome.kind !== 'not-an-option') {
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
          unsubscribe: deps.subscribe(host, onEvent(host.hostId))
        })
        deps.log(host.hostId, 'car-session-started', 'notifications stream attached')
      }
    }
  }

  return {
    async start(hosts: CarBridgeHost[]): Promise<CarSessionStartResult> {
      const startEpoch = epoch
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
      setHosts(hosts)
      return 'started'
    },
    setHosts,
    async stop() {
      epoch += 1
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
      replyListener?.remove()
      replyListener = null
      conversations.clear()
      await deps.messaging.clearConversations()
      await deps.messaging.stopSession()
    }
  }
}
