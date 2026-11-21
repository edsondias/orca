import { isMethodNotFoundRefusal } from '../transport/rpc/rpc-acceptance-policies'
import { carAgentPromptReply } from './car-reply-operations'
import type { CarBridgeHost } from './car-session-bridge'
import type { CarReplySendResult, createCarReplyRouter } from './car-reply-router'

type ReplyParams = Parameters<Parameters<typeof createCarReplyRouter>[0]['send']>[1]

/** Sends one fenced reply; 'unverifiable' stays unmapped because terminal.replyToAgentPrompt has no remote no-contact refusal code. */
export async function sendCarReply(
  host: CarBridgeHost | undefined,
  params: ReplyParams
): Promise<CarReplySendResult> {
  if (!host) {
    return 'disconnected'
  }
  let response: Awaited<ReturnType<typeof carAgentPromptReply.request>>
  try {
    response = await carAgentPromptReply.request(
      host.client,
      {
        ...params,
        // The client lets the host apply the same input lock and mobile floor as terminal.send.
        ...(host.deviceToken ? { client: { id: host.deviceToken, type: 'mobile' as const } } : {})
      },
      { failWhenDisconnected: true }
    )
  } catch {
    return 'disconnected'
  }
  if (isMethodNotFoundRefusal(response)) {
    return 'method-not-found'
  }
  return carAgentPromptReply.interpret(response) ?? 'failed'
}
