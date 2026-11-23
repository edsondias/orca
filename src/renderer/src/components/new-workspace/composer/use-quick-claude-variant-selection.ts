import { useCallback, useState } from 'react'
import type { ClaudeOllamaVariant } from '../../../../../shared/claude-ollama-variants'
import type { TuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent'
import { resolveQuickClaudeVariantId } from '../../../../../shared/agent-launch/catalog/quick-workspace-agent-selection'
import { getComposerClaudeOllamaVariants } from '@/lib/visible-claude-ollama-variants'

/** The quick composer's Ollama variant pick, beside its agent pick. */
export function useQuickClaudeVariantSelection({
  quickAgent,
  variants
}: {
  quickAgent: TuiAgent | null
  variants: readonly ClaudeOllamaVariant[]
}): {
  claudeVariantId: string | null
  selectClaudeVariant: (variantId: string) => void
  clearClaudeVariant: () => void
} {
  const [pickedVariantId, setPickedVariantId] = useState<string | null>(null)
  const claudeVariantId = resolveQuickClaudeVariantId({
    quickAgent,
    claudeVariantId: pickedVariantId,
    variants
  })
  if (pickedVariantId !== null && claudeVariantId === null) {
    // Why: once a repair or target switch hides the pick, it must not come back on its own.
    setPickedVariantId(null)
  }
  const selectClaudeVariant = useCallback((variantId: string) => {
    setPickedVariantId(variantId)
  }, [])
  const clearClaudeVariant = useCallback(() => {
    setPickedVariantId(null)
  }, [])
  return { claudeVariantId, selectClaudeVariant, clearClaudeVariant }
}

/** The composer's offered variants and its variant pick, named as the card's props. */
export function useComposerClaudeVariants(args: {
  quickAgent: TuiAgent | null
  configured: readonly ClaudeOllamaVariant[] | null | undefined
  runtimeEnvironmentId: string | null | undefined
  ephemeralVmRecipeId: string | null | undefined
}): {
  claudeVariants: readonly ClaudeOllamaVariant[]
  quickClaudeVariantId: string | null
  onQuickClaudeVariantChange: (variantId: string) => void
  clearClaudeVariant: () => void
} {
  const claudeVariants = getComposerClaudeOllamaVariants(
    args.configured,
    args.runtimeEnvironmentId,
    args.ephemeralVmRecipeId
  )
  const selection = useQuickClaudeVariantSelection({
    quickAgent: args.quickAgent,
    variants: claudeVariants
  })
  return {
    claudeVariants,
    quickClaudeVariantId: selection.claudeVariantId,
    onQuickClaudeVariantChange: selection.selectClaudeVariant,
    clearClaudeVariant: selection.clearClaudeVariant
  }
}
