import { z } from 'zod'
import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc/rpc-operation'
import { rpcResultVariant } from '../transport/rpc/rpc-operation-result-reader'

export const carAgentPromptReplySchema = z
  .looseObject({ delivered: z.boolean(), reason: z.string().optional() })
  .transform((reply) =>
    reply.delivered ? 'delivered' : reply.reason === 'prompt-changed' ? 'prompt-changed' : 'failed'
  )

/** Fenced reply to the prompt the car announced; the host refuses when the prompt moved on. */
export const carAgentPromptReply = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'terminal.car-agent-prompt-reply',
    method: 'terminal.replyToAgentPrompt',
    acceptance: 'object-result-or-null',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('car-agent-prompt-reply', carAgentPromptReplySchema)
  })
)
