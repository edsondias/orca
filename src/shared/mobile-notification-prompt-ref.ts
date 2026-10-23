import type { TerminalAgentPromptFence } from './terminal-agent-prompt-fence'

export type MobileNotificationPromptRef =
  | {
      kind: 'terminal'
      terminalHandle: string
      fence: TerminalAgentPromptFence
      /** Inputs for the phone's existing permission parser; lastAssistantMessage is capped at 4000 chars. */
      permission?: { interactivePrompt?: string; lastAssistantMessage?: string }
    }
  | { kind: 'structured'; sessionId: string }
