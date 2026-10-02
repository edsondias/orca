import { describe, expect, it } from 'vitest'
import {
  CAR_REPLY_DEDUPE_MS,
  carPermissionOptions,
  createCarReplyDeduplicator,
  normalizeCarReply
} from './car-reply-normalization'

const numbered = carPermissionOptions(
  {
    lastAssistantMessage:
      "Do you want to proceed?\n1. Yes\n2. Yes, and don't ask again\n3. No, and tell Claude"
  },
  'blocked'
)
const approval = carPermissionOptions(
  { interactivePrompt: JSON.stringify({ approval: { tool: 'Bash', summary: 'pnpm test' } }) },
  'blocked'
)
const noDeny = carPermissionOptions(
  {
    lastAssistantMessage: "Do you want to proceed?\n1. Yes\n2. Yes, and don't ask again"
  },
  'blocked'
)

describe('normalizeCarReply', () => {
  it('maps a spoken number word to that option key without Enter', () => {
    expect(normalizeCarReply('um', numbered)).toEqual({ text: '1', enter: false, label: 'Yes' })
    expect(normalizeCarReply('Dois.', numbered)).toMatchObject({ text: '2', enter: false })
    expect(normalizeCarReply('3', numbered)).toMatchObject({ text: '3', enter: false })
  })

  it('maps yes and no words onto the first and the deny option', () => {
    expect(normalizeCarReply('sim', approval)).toMatchObject({
      text: '1',
      enter: false,
      label: 'Allow'
    })
    expect(normalizeCarReply('não', approval)).toMatchObject({ enter: false, label: 'Deny' })
  })

  it('maps sim and não on a numbered menu', () => {
    expect(normalizeCarReply('sim', numbered)).toMatchObject({
      text: '1',
      enter: false,
      label: 'Yes'
    })
    expect(normalizeCarReply('não', numbered)).toMatchObject({
      text: '3',
      enter: false,
      label: 'No, and tell Claude'
    })
  })

  it('rejects out-of-range numbers and invalid speech when a menu is pending', () => {
    expect(normalizeCarReply('três', approval)).toBeNull()
    expect(normalizeCarReply('0', numbered)).toBeNull()
    expect(normalizeCarReply('um teste rápido', numbered)).toBeNull()
  })

  it('rejects no-word when no deny option exists', () => {
    expect(normalizeCarReply('não', noDeny)).toBeNull()
  })

  it('sends verbatim when there is no option menu', () => {
    expect(normalizeCarReply('um', null)).toEqual({ text: 'um', enter: true, label: 'um' })
    expect(normalizeCarReply('um teste rápido', null)).toEqual({
      text: 'um teste rápido',
      enter: true,
      label: 'um teste rápido'
    })
  })

  it('refuses an empty or oversized reply', () => {
    expect(normalizeCarReply('   ', numbered)).toBeNull()
    expect(normalizeCarReply('x'.repeat(501), null)).toBeNull()
  })

  it('reads no options from a working agent', () => {
    expect(
      carPermissionOptions(
        { lastAssistantMessage: '1. Yes\n2. No\nDo you want to proceed?' },
        'working'
      )
    ).toBeNull()
  })
})

describe('createCarReplyDeduplicator', () => {
  it('drops a repeat inside 30 seconds and accepts it after', () => {
    let now = 0
    const accept = createCarReplyDeduplicator(() => now)
    expect(accept('agent-a|5|1')).toBe(true)
    expect(accept('agent-a|5|1')).toBe(false)
    now += CAR_REPLY_DEDUPE_MS
    expect(accept('agent-a|5|1')).toBe(true)
  })

  it('supports record() to persist a delivered key and forget() to release in-flight', () => {
    let now = 0
    const accept = createCarReplyDeduplicator(() => now)
    expect(accept('key1')).toBe(true) // in flight
    expect(accept('key1')).toBe(false) // concurrent identical blocked
    accept.forget('key1') // release on transient error
    expect(accept('key1')).toBe(true) // retry allowed
    accept.record('key1') // record on success
    expect(accept('key1')).toBe(false) // permanently blocked for 30s
    now += CAR_REPLY_DEDUPE_MS
    expect(accept('key1')).toBe(true) // expired after 30s
  })
})
