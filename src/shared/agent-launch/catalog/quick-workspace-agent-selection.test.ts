import { describe, expect, it } from 'vitest'
import { resolveQuickClaudeVariantId } from './quick-workspace-agent-selection'

describe('resolveQuickClaudeVariantId', () => {
  const kimi = { id: 'v1', label: 'Kimi', model: 'kimi-k2:cloud', context1m: false }

  it('keeps a picked variant while Claude is the agent and the variant is offered', () => {
    expect(
      resolveQuickClaudeVariantId({ quickAgent: 'claude', claudeVariantId: 'v1', variants: [kimi] })
    ).toBe('v1')
  })

  it('drops the variant once the agent is no longer Claude', () => {
    expect(
      resolveQuickClaudeVariantId({ quickAgent: 'codex', claudeVariantId: 'v1', variants: [kimi] })
    ).toBeNull()
  })

  it('drops a variant the target no longer offers', () => {
    expect(
      resolveQuickClaudeVariantId({ quickAgent: 'claude', claudeVariantId: 'v1', variants: [] })
    ).toBeNull()
  })
})
