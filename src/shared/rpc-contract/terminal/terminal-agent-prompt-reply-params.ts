import { z } from 'zod'
import { TerminalHandle, TerminalSend } from './terminal-unary-params'

export const TerminalAgentPromptFenceParams = z
  .object({
    generation: z.number().int().nonnegative(),
    permissionSequence: z.number().int().nonnegative(),
    blockedSince: z.number().int().nonnegative().nullable(),
    promptKey: z.string().max(64).nullable()
  })
  .strict()

export const TerminalReplyToAgentPrompt = TerminalHandle.extend({
  fence: TerminalAgentPromptFenceParams,
  text: z.string().min(1).max(500),
  enter: z.boolean(),
  // Same shape as TerminalSend so the lock and mobile input floor behave identically.
  client: TerminalSend.shape.client
})
