import { toast } from 'sonner'
import type { ClaudeOllamaVariant } from '../../../../../shared/claude-ollama-variants'
import type { TuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent'
import { translate } from '@/i18n/i18n'

export type ComposerClaudeVariantLaunch = {
  /** Null for a blank terminal, or when the picked Ollama variant cannot launch. */
  agent: TuiAgent | null
  claudeVariant: ClaudeOllamaVariant | null
}

/** A picked variant that cannot launch launches no agent: it must never fall back to Anthropic's Claude. */
export function resolveComposerClaudeVariant(args: {
  agent: TuiAgent | null
  claudeVariantId: string | null | undefined
  variants: readonly ClaudeOllamaVariant[] | null | undefined
  /** An ephemeral VM resumes its tabs with the host's default env, which is plain Anthropic Claude. */
  ephemeralVmRecipeActive?: boolean
}): ComposerClaudeVariantLaunch {
  // Why: an id left beside another agent is the picker's leftover, not a request for a variant.
  if (args.agent !== 'claude' || !args.claudeVariantId) {
    return { agent: args.agent, claudeVariant: null }
  }
  const variant = args.ephemeralVmRecipeActive
    ? undefined
    : args.variants?.find((candidate) => candidate.id === args.claudeVariantId)
  return variant
    ? { agent: 'claude', claudeVariant: variant }
    : { agent: null, claudeVariant: null }
}

/** Toasts when the requested agent was dropped because its Ollama variant cannot launch. */
export function reportComposerClaudeVariantLaunch(
  requestedAgent: TuiAgent | null,
  launchAgent: TuiAgent | null
): void {
  if (requestedAgent && !launchAgent) {
    toast.error(
      translate(
        'auto.hooks.useComposerState.claudeVariantLaunchFailed',
        'The selected Ollama model is no longer configured, so no agent was launched.'
      )
    )
  }
}
