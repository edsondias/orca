import { describe, expect, it } from 'vitest'
import type { ClaudeOllamaVariant } from '../../../shared/claude-ollama-variants'
import {
  getComposerClaudeOllamaVariants,
  getVisibleClaudeOllamaVariants
} from './visible-claude-ollama-variants'

const kimi: ClaudeOllamaVariant = { id: 'v1', label: 'Kimi', model: 'kimi-k2', context1m: false }

describe('getVisibleClaudeOllamaVariants', () => {
  it('returns the configured variants for a workspace this client hosts', () => {
    const variants = [kimi]
    expect(getVisibleClaudeOllamaVariants(variants, null)).toBe(variants)
    expect(getVisibleClaudeOllamaVariants(variants, undefined)).toBe(variants)
  })

  it('hides every variant for a workspace served by a paired host', () => {
    expect(getVisibleClaudeOllamaVariants([kimi], 'env-1')).toEqual([])
  })

  it('returns one stable empty list when nothing is visible', () => {
    const empty = getVisibleClaudeOllamaVariants(undefined, null)
    expect(empty).toEqual([])
    expect(getVisibleClaudeOllamaVariants(null, null)).toBe(empty)
    expect(getVisibleClaudeOllamaVariants([kimi], 'env-1')).toBe(empty)
  })
})

describe('getComposerClaudeOllamaVariants', () => {
  it('offers the variants for a local workspace without an ephemeral VM', () => {
    const variants = [kimi]
    expect(getComposerClaudeOllamaVariants(variants, null, null)).toBe(variants)
  })

  it('hides every variant while an ephemeral VM recipe is selected', () => {
    expect(getComposerClaudeOllamaVariants([kimi], null, 'recipe-1')).toBe(
      getVisibleClaudeOllamaVariants(null, null)
    )
  })

  it('still hides every variant for a workspace served by a paired host', () => {
    expect(getComposerClaudeOllamaVariants([kimi], 'env-1', null)).toEqual([])
  })
})
