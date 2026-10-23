import { describe, expect, it } from 'vitest'
import { carAgentPromptReplySchema } from './car-reply-operations'

describe('carAgentPromptReplySchema transform', () => {
  it('maps delivered=true to "delivered"', () => {
    expect(carAgentPromptReplySchema.parse({ delivered: true })).toBe('delivered')
  })

  it('maps delivered=false with reason="prompt-changed" to "prompt-changed"', () => {
    expect(carAgentPromptReplySchema.parse({ delivered: false, reason: 'prompt-changed' })).toBe(
      'prompt-changed'
    )
  })

  it('maps delivered=false with reason="terminal-locked" to "failed"', () => {
    expect(carAgentPromptReplySchema.parse({ delivered: false, reason: 'terminal-locked' })).toBe(
      'failed'
    )
  })

  it('maps delivered=false without reason to "failed"', () => {
    expect(carAgentPromptReplySchema.parse({ delivered: false })).toBe('failed')
  })

  it('maps extra fields in looseObject', () => {
    expect(
      carAgentPromptReplySchema.parse({ delivered: true, extra: 'ignored', another: 123 })
    ).toBe('delivered')
  })

  it('rejects undefined or null', () => {
    expect(() => carAgentPromptReplySchema.parse(null)).toThrow()
    expect(() => carAgentPromptReplySchema.parse(undefined)).toThrow()
  })
})
