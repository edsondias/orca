import { parseApprovalFromStatus } from '../../../src/shared/native-chat/input/native-chat-interactive-prompt'
import type { MobileChatPermission } from '../session/native-chat/input/prompts/mobile-native-chat-permission'
import { detectAgentPermission } from './car-prose-permission'

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

export type CarPromptMenu = {
  permission: MobileChatPermission
  /** What the car reads aloud: the command being approved, never the agent's prose. */
  subject: string
}

const NUMBERED_LINE = /^\s*(\d+)[.)]\s*\S/
const APPROVAL_FIRST_OPTION = /^\s*1[.)]\s*(yes|allow|approve|proceed)\b/i

// The trailing contiguous numbered lines plus the line that asks; a prose list earlier is never the menu.
function finalNumberedBlock(text: string | undefined): string | null {
  const lines = (text ?? '').trimEnd().split(/\r?\n/)
  let start = lines.length
  while (start > 0 && NUMBERED_LINE.test(lines[start - 1] ?? '')) {
    start -= 1
  }
  const block = lines.slice(start)
  // Two options at least, numbered 1..n in order, opening with an approval: anything else is prose.
  const sequential = block.every(
    (line, index) => Number(NUMBERED_LINE.exec(line)?.[1]) === index + 1
  )
  if (block.length < 2 || !sequential || !APPROVAL_FIRST_OPTION.test(block[0] ?? '')) {
    return null
  }
  const question = lines.slice(0, start).findLast((line) => line.trim().length > 0)
  return [question ?? '', ...block].join('\n')
}

/** The approval envelope wins; the message heuristic reads only its final numbered block. */
export function carPromptMenu(
  permission: { interactivePrompt?: string; lastAssistantMessage?: string } | undefined,
  state: string
): CarPromptMenu | null {
  if (!permission) {
    return null
  }
  const approval = parseApprovalFromStatus(permission.interactivePrompt)
  if (approval) {
    return {
      permission: approval,
      subject: approval.detail ? `${approval.title} ${approval.detail}` : approval.title
    }
  }
  const block = finalNumberedBlock(permission.lastAssistantMessage)
  const detected = block ? detectAgentPermission({ state, lastAssistantMessage: block }) : null
  if (!detected) {
    return null
  }
  const options = detected.options.map((option) => `${option.send}. ${option.label}`).join('; ')
  return {
    permission: detected,
    subject: detected.detail ? `${detected.detail} ${options}` : options
  }
}

export function normalizeCarReply(
  spoken: string,
  permission: MobileChatPermission | null
): CarReplyKeystroke | null {
  const trimmed = spoken.trim()
  if (!trimmed || trimmed.length > CAR_REPLY_MAX_LENGTH) {
    return null
  }
  // Phase 1 never sends free text: on a permission prompt, Enter could confirm the highlighted default.
  if (!permission) {
    return null
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
    const option = permission.options.find((candidate) => /^(no|deny)\b/i.test(candidate.label))
    if (option) {
      return { text: option.send, enter: false, label: option.label }
    }
  }
  return null
}

export function createCarReplyDeduplicator(now: () => number): ((key: string) => boolean) & {
  record(key: string): void
  forget(key: string): void
} {
  const delivered = new Map<string, number>()
  const inFlight = new Map<string, number>()

  function accept(key: string): boolean {
    const at = now()
    const cutoff = at - CAR_REPLY_DEDUPE_MS

    // clean expired delivered and in-flight keys (older than 30s)
    for (const [k, t] of delivered) {
      if (t <= cutoff) {
        delivered.delete(k)
      }
    }
    for (const [k, t] of inFlight) {
      if (t <= cutoff) {
        inFlight.delete(k)
      }
    }

    // concurrent identical replies while first is pending
    if (inFlight.has(key)) {
      return false
    }

    // delivered recently, allow only after 30s
    if (delivered.has(key)) {
      return false
    }

    // mark as in-flight with timestamp (can be forgotten or recorded)
    inFlight.set(key, at)
    return true
  }

  function record(key: string): void {
    inFlight.delete(key)
    delivered.set(key, now())
  }

  function forget(key: string): void {
    inFlight.delete(key)
  }

  accept.record = record
  accept.forget = forget
  return accept
}
