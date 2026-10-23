import { CAR_COPY } from './car-copy'
import type { CarPendingPrompt } from './car-conversation-store'
import {
  carPromptMenu,
  createCarReplyDeduplicator,
  normalizeCarReply
} from './car-reply-normalization'

export type CarReplySendResult =
  | 'delivered'
  | 'prompt-changed'
  | 'method-not-found'
  | 'disconnected'
  | 'unverifiable'
  | 'failed'

export type CarReplyOutcome =
  | { kind: 'delivered'; label: string }
  | { kind: 'prompt-changed' }
  | { kind: 'unsupported' }
  | { kind: 'unverifiable' }
  | { kind: 'rejected' }
  | { kind: 'duplicate' }
  | { kind: 'not-an-option' }
  | { kind: 'reply-from-phone' }

type Deps = {
  send(
    hostId: string,
    params: { terminal: string; fence: CarPendingPrompt['fence']; text: string; enter: boolean }
  ): Promise<CarReplySendResult>
  now(): number
}

export function createCarReplyRouter(deps: Deps) {
  const unsupportedHosts = new Set<string>()
  const accept = createCarReplyDeduplicator(deps.now)

  return {
    isHostUnsupported: (hostId: string) => unsupportedHosts.has(hostId),
    async reply(
      conversationId: string,
      prompt: CarPendingPrompt,
      spoken: string
    ): Promise<CarReplyOutcome> {
      const menu = carPromptMenu(prompt.permission, prompt.agentState)
      // Without a recognized menu nothing is sent: free text with Enter could confirm the default.
      if (!menu) {
        return { kind: 'reply-from-phone' }
      }
      const keystroke = normalizeCarReply(spoken, menu.permission)
      if (!keystroke) {
        return { kind: 'not-an-option' }
      }
      // dedupe key: conversation | notification sequence | keystroke text (prevents duplicate sends and concurrent retries)
      const dedupeKey = `${conversationId}|${prompt.notificationSeq}|${keystroke.text}`
      if (!accept(dedupeKey)) {
        return { kind: 'duplicate' }
      }
      let result: CarReplySendResult
      try {
        result = await deps.send(prompt.hostId, {
          terminal: prompt.terminalHandle,
          fence: prompt.fence,
          text: keystroke.text,
          enter: keystroke.enter
        })
      } catch {
        // send threw (network error, etc); release key so retry can be sent
        accept.forget(dedupeKey)
        return { kind: 'rejected' }
      }
      switch (result) {
        case 'delivered':
          accept.record(dedupeKey)
          return { kind: 'delivered', label: keystroke.label }
        case 'prompt-changed':
          accept.record(dedupeKey)
          return { kind: 'prompt-changed' }
        case 'method-not-found':
          accept.forget(dedupeKey)
          unsupportedHosts.add(prompt.hostId)
          return { kind: 'unsupported' }
        case 'unverifiable':
          accept.forget(dedupeKey)
          return { kind: 'unverifiable' }
        case 'disconnected':
        case 'failed':
          accept.forget(dedupeKey)
          return { kind: 'rejected' }
      }
    }
  }
}

export function carReplyReceipt(outcome: CarReplyOutcome): string | null {
  switch (outcome.kind) {
    case 'delivered':
      return CAR_COPY.sent(outcome.label)
    case 'prompt-changed':
      return CAR_COPY.promptChanged
    case 'unsupported':
      return CAR_COPY.desktopTooOld
    case 'unverifiable':
      return CAR_COPY.hostUnverifiable
    case 'rejected':
      return CAR_COPY.replyRejected
    case 'duplicate':
      return null
    case 'not-an-option':
      return CAR_COPY.chooseOption
    case 'reply-from-phone':
      return CAR_COPY.replyFromPhone
  }
}
