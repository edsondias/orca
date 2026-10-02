import { CAR_COPY } from './car-copy'
import type { CarPendingPrompt } from './car-conversation-store'
import {
  carPermissionOptions,
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
      const keystroke = normalizeCarReply(
        spoken,
        carPermissionOptions(prompt.permission, prompt.agentState)
      )
      if (!keystroke) {
        return { kind: 'rejected' }
      }
      if (!accept(`${conversationId}|${prompt.notificationSeq}|${keystroke.text}`)) {
        return { kind: 'duplicate' }
      }
      const result = await deps.send(prompt.hostId, {
        terminal: prompt.terminalHandle,
        fence: prompt.fence,
        text: keystroke.text,
        enter: keystroke.enter
      })
      switch (result) {
        case 'delivered':
          return { kind: 'delivered', label: keystroke.label }
        case 'prompt-changed':
          return { kind: 'prompt-changed' }
        case 'method-not-found':
          unsupportedHosts.add(prompt.hostId)
          return { kind: 'unsupported' }
        case 'unverifiable':
          return { kind: 'unverifiable' }
        default:
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
  }
}
