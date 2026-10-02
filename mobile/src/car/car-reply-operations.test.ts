import { describe, expect, it } from 'vitest'
import { z } from 'zod'

// Test the schema directly (inline since the operation wrapper uses bindDeferredRpcOperation)
const carReplySchema = z
  .looseObject({ delivered: z.boolean(), reason: z.string().optional() })
  .transform((reply) =>
    reply.delivered ? 'delivered' : reply.reason === 'prompt-changed' ? 'prompt-changed' : 'failed'
  )

describe('carReplySchema transform', () => {
  it('maps delivered=true to "delivered"', () => {
    expect(carReplySchema.parse({ delivered: true })).toBe('delivered')
  })

  it('maps delivered=false with reason="prompt-changed" to "prompt-changed"', () => {
    expect(carReplySchema.parse({ delivered: false, reason: 'prompt-changed' })).toBe(
      'prompt-changed'
    )
  })

  it('maps delivered=false with reason="terminal-locked" to "failed"', () => {
    expect(carReplySchema.parse({ delivered: false, reason: 'terminal-locked' })).toBe('failed')
  })

  it('maps delivered=false without reason to "failed"', () => {
    expect(carReplySchema.parse({ delivered: false })).toBe('failed')
  })

  it('maps extra fields in looseObject', () => {
    expect(carReplySchema.parse({ delivered: true, extra: 'ignored', another: 123 })).toBe(
      'delivered'
    )
  })

  it('rejects undefined or null', () => {
    expect(() => carReplySchema.parse(null)).toThrow()
    expect(() => carReplySchema.parse(undefined)).toThrow()
  })
})
