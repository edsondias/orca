import { defineMethod } from '../../core'
import { admitMobileTerminalInput } from './mobile-terminal-input-admission'
import { TerminalReplyToAgentPrompt } from './unary-schemas'

export const TERMINAL_REPLY_TO_AGENT_PROMPT_METHODS = [
  defineMethod({
    name: 'terminal.replyToAgentPrompt',
    params: TerminalReplyToAgentPrompt,
    handler: async (params, { runtime, signal }) => {
      const admission = admitMobileTerminalInput(runtime, params.terminal, params.client)
      // Same refusal as terminal.send: another client holds the terminal, so nothing is written.
      if (admission.locked) {
        return { delivered: false as const, reason: 'terminal-locked' as const }
      }
      try {
        await runtime.replyToTerminalAgentPrompt(
          params.terminal,
          params.fence,
          { text: params.text, enter: params.enter },
          { signal, ...admission.hooks }
        )
        return { delivered: true as const }
      } catch (error) {
        admission.rollback()
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
