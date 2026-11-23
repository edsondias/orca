import {
  buildClaudeOllamaVariantEnv,
  withoutClaudeVariantModelOption,
  type ClaudeOllamaVariant
} from '../../claude-ollama-variants'
import type { AgentStartupPlanInputs } from './agent-startup-plan-inputs'

/** A variant launch runs its Ollama env over the base env, without `--model`, which would beat `ANTHROPIC_MODEL`. */
export function withClaudeVariantStartupInputs(
  inputs: AgentStartupPlanInputs,
  variant: ClaudeOllamaVariant | null | undefined
): AgentStartupPlanInputs {
  if (!variant) {
    return inputs
  }
  return {
    ...inputs,
    agentEnv: { ...inputs.agentEnv, ...buildClaudeOllamaVariantEnv(variant) },
    sessionOptions: withoutClaudeVariantModelOption(inputs.sessionOptions)
  }
}
