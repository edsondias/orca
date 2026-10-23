import type { CarConversation, CarMessage } from '../../modules/orca-car-messaging/src'
import { CAR_COPY } from './car-copy'
import { carPromptMenu } from './car-reply-normalization'

export type CarNotificationEvent = {
  type: 'notification'
  source: string
  title: string
  body: string
  worktreeId?: string
  notificationId?: string
  notificationSeq?: number
  emittedAt?: number
  agentState?: string
  promptRef?:
    | {
        kind: 'terminal'
        terminalHandle: string
        fence: {
          generation: number
          permissionSequence: number
          blockedSince: number | null
          promptKey: string | null
        }
        permission?: { interactivePrompt?: string; lastAssistantMessage?: string }
      }
    | { kind: 'structured'; sessionId: string }
}

export type CarPendingPrompt = {
  hostId: string
  terminalHandle: string
  fence: {
    generation: number
    permissionSequence: number
    blockedSince: number | null
    promptKey: string | null
  }
  notificationSeq: number
  agentState: string
  permission?: { interactivePrompt?: string; lastAssistantMessage?: string }
}

const CAR_SOURCES = new Set(['agent-task-complete', 'agent-exited', 'plugin'])
// Android Auto reads only unread messages of the current session; a short tail keeps the readout brief.
const MAX_MESSAGES = 5

function conversationIdFor(hostId: string, event: CarNotificationEvent): string {
  if (event.promptRef?.kind === 'terminal') {
    return `${hostId}:terminal:${event.promptRef.terminalHandle}`
  }
  if (event.promptRef?.kind === 'structured') {
    return `${hostId}:session:${event.promptRef.sessionId}`
  }
  return `${hostId}:${event.notificationId ?? event.worktreeId ?? event.title}`
}

export function createCarConversationStore(now: () => number) {
  const conversations = new Map<string, CarConversation>()
  const pending = new Map<string, CarPendingPrompt>()
  // Conversations that ever carried a terminal prompt; a later reply there means the prompt moved on.
  const terminalPromptIds = new Set<string>()

  const append = (id: string, message: CarMessage): CarConversation | null => {
    const current = conversations.get(id)
    if (!current) {
      return null
    }
    const next = { ...current, messages: [...current.messages, message].slice(-MAX_MESSAGES) }
    conversations.set(id, next)
    return next
  }

  return {
    applyEvent(hostId: string, event: CarNotificationEvent): CarConversation | null {
      if (event.type !== 'notification' || !CAR_SOURCES.has(event.source)) {
        return null
      }
      const id = conversationIdFor(hostId, event)
      const at = event.emittedAt ?? now()
      const ref = event.promptRef
      const agentState = event.agentState ?? 'blocked'
      // The subject comes from the same hook row as the fence, so the car never reads a different prompt.
      const menu = ref?.kind === 'terminal' ? carPromptMenu(ref.permission, agentState) : null
      if (ref?.kind === 'terminal') {
        terminalPromptIds.add(id)
      }
      const text =
        event.source === 'agent-exited'
          ? CAR_COPY.agentExited
          : ref?.kind === 'terminal'
            ? (menu?.subject ?? CAR_COPY.waitingForInput)
            : event.body || event.title
      if (ref?.kind === 'terminal' && menu && event.notificationSeq !== undefined) {
        pending.set(id, {
          hostId,
          terminalHandle: ref.terminalHandle,
          fence: ref.fence,
          notificationSeq: event.notificationSeq,
          agentState,
          ...(ref.permission ? { permission: ref.permission } : {})
        })
      } else {
        pending.delete(id)
      }
      const readOnlyPrompt =
        ref?.kind === 'structured' || (ref?.kind === 'terminal' && !pending.has(id))
      const messages: CarMessage[] = [
        ...(conversations.get(id)?.messages ?? []),
        { sender: 'agent', text, timestamp: at },
        ...(readOnlyPrompt
          ? [{ sender: 'orca' as const, text: CAR_COPY.replyFromPhone, timestamp: at }]
          : [])
      ]
      const next: CarConversation = {
        id,
        title: event.title,
        messages: messages.slice(-MAX_MESSAGES),
        canReply: pending.has(id)
      }
      conversations.set(id, next)
      return next
    },
    appendOrcaMessage: (id: string, text: string) =>
      append(id, { sender: 'orca', text, timestamp: now() }),
    appendMyMessage: (id: string, text: string) =>
      append(id, { sender: 'me', text, timestamp: now() }),
    pendingPrompt: (id: string) => pending.get(id) ?? null,
    hadTerminalPrompt: (id: string) => terminalPromptIds.has(id),
    clearPendingPrompt(id: string) {
      pending.delete(id)
      const current = conversations.get(id)
      if (current) {
        conversations.set(id, { ...current, canReply: false })
      }
    },
    conversationIds: () => [...conversations.keys()],
    clear() {
      conversations.clear()
      pending.clear()
      terminalPromptIds.clear()
    }
  }
}
