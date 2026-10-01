import { defineMethod } from '../../core'
import { TerminalReplyToAgentPrompt } from './unary-schemas'

export const TERMINAL_REPLY_TO_AGENT_PROMPT_METHODS = [
  defineMethod({
    name: 'terminal.replyToAgentPrompt',
    params: TerminalReplyToAgentPrompt,
    handler: async (params, { runtime, signal }) => {
      try {
        await runtime.replyToTerminalAgentPrompt(
          params.terminal,
          params.fence,
          { text: params.text, enter: params.enter },
          { signal }
        )
        return { delivered: true as const }
      } catch (error) {
        if (error instanceof Error && error.message === 'agent_prompt_changed') {
          return { delivered: false as const, reason: 'prompt-changed' as const }
        }
        // The text reached the agent's input but the Enter was withheld because the prompt moved on.
        if (error instanceof Error && error.message === 'agent_prompt_changed_after_text') {
          return { delivered: false as const, reason: 'prompt-changed-after-text' as const }
        }
        throw error
      }
    }
  })
]
