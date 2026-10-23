import { describe, expect, it } from 'vitest'
import {
  CAR_REPLY_DEDUPE_MS,
  carPromptMenu,
  createCarReplyDeduplicator,
  normalizeCarReply
} from './car-reply-normalization'

const numbered = carPromptMenu(
  {
    lastAssistantMessage:
      "Do you want to proceed?\n1. Yes\n2. Yes, and don't ask again\n3. No, and tell Claude"
  },
  'blocked'
)?.permission
const approval = carPromptMenu(
  { interactivePrompt: JSON.stringify({ approval: { tool: 'Bash', summary: 'pnpm test' } }) },
  'blocked'
)?.permission
const noDeny = carPromptMenu(
  {
    lastAssistantMessage: "Do you want to proceed?\n1. Yes\n2. Yes, and don't ask again"
  },
  'blocked'
)?.permission

describe('carPromptMenu', () => {
  it('speaks the approval envelope as the subject', () => {
    expect(
      carPromptMenu(
        { interactivePrompt: JSON.stringify({ approval: { tool: 'Bash', summary: 'rm -rf a' } }) },
        'blocked'
      )?.subject
    ).toBe('Allow Bash? rm -rf a')
  })

  it('prefers the envelope over a numbered list in the message', () => {
    const menu = carPromptMenu(
      {
        interactivePrompt: JSON.stringify({ approval: { tool: 'Bash', summary: 'pnpm test' } }),
        lastAssistantMessage: 'Do you want to proceed?\n1. Yes\n2. No tests changed'
      },
      'blocked'
    )
    expect(menu?.permission.options.map((option) => option.label)).toEqual(['Allow', 'Deny'])
  })

  it('reads only the final numbered block, never a prose list before it', () => {
    const menu = carPromptMenu(
      {
        lastAssistantMessage:
          "Summary:\n1. Added the parser\n2. No tests changed\n\nDo you want to proceed?\n1. Yes\n2. Yes, and don't ask again\n3. No, and tell Claude"
      },
      'blocked'
    )
    expect(menu?.permission.options.map((option) => option.send)).toEqual(['1', '2', '3'])
    expect(menu?.subject).toBe(
      "Do you want to proceed? 1. Yes; 2. Yes, and don't ask again; 3. No, and tell Claude"
    )
    expect(normalizeCarReply('não', menu?.permission ?? null)).toMatchObject({ text: '3' })
  })

  it('finds no menu in a message that ends in prose', () => {
    expect(
      carPromptMenu(
        {
          lastAssistantMessage:
            'Do you want to proceed?\n1. Added the parser\n2. No tests changed\n\nShall I go on?'
        },
        'blocked'
      )
    ).toBeNull()
  })

  it('finds no menu in a trailing list that does not open with an approval', () => {
    expect(
      carPromptMenu(
        {
          lastAssistantMessage: 'Allow me to summarize:\n1. Added the parser\n2. No tests changed'
        },
        'blocked'
      )
    ).toBeNull()
  })

  it('finds no menu without a permission subject', () => {
    expect(carPromptMenu({ lastAssistantMessage: 'I am stuck, what now?' }, 'blocked')).toBeNull()
    expect(carPromptMenu(undefined, 'blocked')).toBeNull()
  })

  it('reads no options from a working agent', () => {
    expect(
      carPromptMenu({ lastAssistantMessage: 'Do you want to proceed?\n1. Yes\n2. No' }, 'working')
    ).toBeNull()
  })
})

describe('normalizeCarReply', () => {
  it('maps a spoken number word to that option key without Enter', () => {
    expect(normalizeCarReply('um', numbered ?? null)).toEqual({
      text: '1',
      enter: false,
      label: 'Yes'
    })
    expect(normalizeCarReply('Dois.', numbered ?? null)).toMatchObject({ text: '2', enter: false })
    expect(normalizeCarReply('3', numbered ?? null)).toMatchObject({ text: '3', enter: false })
  })

  it('maps yes and no words onto the first and the deny option', () => {
    expect(normalizeCarReply('sim', approval ?? null)).toMatchObject({
      text: '1',
      enter: false,
      label: 'Allow'
    })
    expect(normalizeCarReply('não', approval ?? null)).toMatchObject({
      enter: false,
      label: 'Deny'
    })
  })

  it('maps sim and não on a numbered menu', () => {
    expect(normalizeCarReply('sim', numbered ?? null)).toMatchObject({
      text: '1',
      enter: false,
      label: 'Yes'
    })
    expect(normalizeCarReply('não', numbered ?? null)).toMatchObject({
      text: '3',
      enter: false,
      label: 'No, and tell Claude'
    })
  })

  it('maps não only onto an option that starts with No or Deny', () => {
    const menu = carPromptMenu(
      {
        lastAssistantMessage:
          'Do you want to proceed?\n1. Yes\n2. Yes, and say no more\n3. Tell Claude what to do instead'
      },
      'blocked'
    )?.permission
    expect(normalizeCarReply('não', menu ?? null)).toBeNull()
  })

  it('rejects out-of-range numbers and invalid speech when a menu is pending', () => {
    expect(normalizeCarReply('três', approval ?? null)).toBeNull()
    expect(normalizeCarReply('0', numbered ?? null)).toBeNull()
    expect(normalizeCarReply('um teste rápido', numbered ?? null)).toBeNull()
  })

  it('rejects no-word when no deny option exists', () => {
    expect(normalizeCarReply('não', noDeny ?? null)).toBeNull()
  })

  it('sends nothing when there is no option menu', () => {
    expect(normalizeCarReply('um', null)).toBeNull()
    expect(normalizeCarReply('não', null)).toBeNull()
  })

  it('refuses an empty or oversized reply', () => {
    expect(normalizeCarReply('   ', numbered ?? null)).toBeNull()
    expect(normalizeCarReply('x'.repeat(501), numbered ?? null)).toBeNull()
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
