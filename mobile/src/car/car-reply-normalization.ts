import {
  detectAgentPermission,
  parseApprovalFromStatus,
  type MobileChatPermission
} from '../session/mobile-native-chat-permission'

export type CarReplyKeystroke = { text: string; enter: boolean; label: string }

export const CAR_REPLY_MAX_LENGTH = 500
export const CAR_REPLY_DEDUPE_MS = 30_000

const NUMBER_WORDS = new Map<string, number>([
  ['um', 1],
  ['uma', 1],
  ['one', 1],
  ['dois', 2],
  ['duas', 2],
  ['two', 2],
  ['tres', 3],
  ['three', 3],
  ['quatro', 4],
  ['four', 4]
])
const YES_WORDS = new Set(['sim', 'yes', 'pode', 'allow', 'aprovar'])
const NO_WORDS = new Set(['nao', 'no', 'deny', 'negar'])

function spokenToken(spoken: string): string {
  return spoken
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[.!?,]+$/u, '')
}

/** Reuses the phone's existing permission parsers so the car sends the same keys as the chat cards. */
export function carPermissionOptions(
  permission: { interactivePrompt?: string; lastAssistantMessage?: string } | undefined,
  state: string
): MobileChatPermission | null {
  if (!permission) {
    return null
  }
  return (
    detectAgentPermission({ state, lastAssistantMessage: permission.lastAssistantMessage }) ??
    parseApprovalFromStatus(permission.interactivePrompt)
  )
}

export function normalizeCarReply(
  spoken: string,
  permission: MobileChatPermission | null
): CarReplyKeystroke | null {
  const trimmed = spoken.trim()
  if (!trimmed || trimmed.length > CAR_REPLY_MAX_LENGTH) {
    return null
  }
  if (!permission) {
    return { text: trimmed, enter: true, label: trimmed }
  }
  const token = spokenToken(trimmed)
  const index = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS.get(token)
  if (index !== undefined && index > 0) {
    const option = permission.options[index - 1]
    if (option) {
      return { text: option.send, enter: false, label: option.label }
    }
  }
  if (YES_WORDS.has(token)) {
    const option = permission.options[0]
    if (option) {
      return { text: option.send, enter: false, label: option.label }
    }
  }
  if (NO_WORDS.has(token)) {
    const option = permission.options.find((candidate) => /\b(deny|no)\b/i.test(candidate.label))
    if (option) {
      return { text: option.send, enter: false, label: option.label }
    }
  }
  return null
}

export function createCarReplyDeduplicator(now: () => number): (key: string) => boolean {
  const seen = new Map<string, number>()
  return (key) => {
    const at = now()
    const cutoff = at - CAR_REPLY_DEDUPE_MS
    for (const [k, t] of seen) {
      if (t < cutoff) {
        seen.delete(k)
      }
    }
    const previous = seen.get(key)
    if (previous !== undefined && at - previous < CAR_REPLY_DEDUPE_MS) {
      return false
    }
    seen.set(key, at)
    return true
  }
}
