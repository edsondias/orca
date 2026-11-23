import { describe, expect, it } from 'vitest'
import { getActiveOptionId } from './tab-create-entry-active-option'

describe('getActiveOptionId', () => {
  it('gives Claude and each Claude variant distinct row ids', () => {
    const claude = getActiveOptionId({
      kind: 'agent',
      option: { agent: 'claude', aliases: ['claude'], label: 'Claude' }
    })
    const variant = getActiveOptionId({
      kind: 'agent',
      option: { agent: 'claude', aliases: ['kimi'], label: 'Kimi K3.1', claudeVariantId: 'v1' }
    })

    expect(claude).toBe('agent:claude')
    expect(variant).toBe('agent:claude:v1')
  })
})
