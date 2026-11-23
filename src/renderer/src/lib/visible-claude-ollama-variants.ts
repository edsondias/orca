import type { ClaudeOllamaVariant } from '../../../shared/claude-ollama-variants'
import { isWebRuntimeSessionActive } from '@/runtime/web-session-tabs-sync/identity/web-runtime-session-environment'

const EMPTY_CLAUDE_OLLAMA_VARIANTS: readonly ClaudeOllamaVariant[] = []

/** The variants a launch picker may offer for a workspace on `runtimeEnvironmentId`. */
export function getVisibleClaudeOllamaVariants(
  variants: readonly ClaudeOllamaVariant[] | null | undefined,
  runtimeEnvironmentId: string | null | undefined
): readonly ClaudeOllamaVariant[] {
  // Why: a paired host owns the launch env, so it cannot honor a variant's local Ollama endpoint.
  if (!variants || variants.length === 0 || isWebRuntimeSessionActive(runtimeEnvironmentId)) {
    return EMPTY_CLAUDE_OLLAMA_VARIANTS
  }
  return variants
}

/** The variants the new-workspace composer may offer; none while an ephemeral VM recipe is picked. */
export function getComposerClaudeOllamaVariants(
  variants: readonly ClaudeOllamaVariant[] | null | undefined,
  runtimeEnvironmentId: string | null | undefined,
  ephemeralVmRecipeId: string | null | undefined
): readonly ClaudeOllamaVariant[] {
  // Why: the VM is its own runtime, which resumes Claude with the default env, never the variant's.
  if (ephemeralVmRecipeId) {
    return EMPTY_CLAUDE_OLLAMA_VARIANTS
  }
  return getVisibleClaudeOllamaVariants(variants, runtimeEnvironmentId)
}
