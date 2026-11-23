import { describe, expect, it } from 'vitest'
import { resolveComposerClaudeVariant } from './composer-claude-variant-launch'

const kimi = { id: 'v1', label: 'Kimi', model: 'kimi-k2:cloud', context1m: false }

describe('resolveComposerClaudeVariant', () => {
  it('launches Claude as the picked variant', () => {
    expect(
      resolveComposerClaudeVariant({ agent: 'claude', claudeVariantId: 'v1', variants: [kimi] })
    ).toEqual({ agent: 'claude', claudeVariant: kimi })
  })

  it('launches no agent when the variant no longer exists', () => {
    expect(
      resolveComposerClaudeVariant({ agent: 'claude', claudeVariantId: 'gone', variants: [kimi] })
    ).toEqual({ agent: null, claudeVariant: null })
  })

  it('refuses a variant for an ephemeral VM, whose host resumes it as plain Claude', () => {
    expect(
      resolveComposerClaudeVariant({
        agent: 'claude',
        claudeVariantId: 'v1',
        variants: [kimi],
        ephemeralVmRecipeActive: true
      })
    ).toEqual({ agent: null, claudeVariant: null })
  })

  it('keeps plain Claude launching on an ephemeral VM', () => {
    expect(
      resolveComposerClaudeVariant({
        agent: 'claude',
        claudeVariantId: null,
        variants: [kimi],
        ephemeralVmRecipeActive: true
      })
    ).toEqual({ agent: 'claude', claudeVariant: null })
  })

  it('ignores a leftover variant id beside another agent', () => {
    expect(
      resolveComposerClaudeVariant({ agent: 'codex', claudeVariantId: 'v1', variants: [kimi] })
    ).toEqual({ agent: 'codex', claudeVariant: null })
  })
})
