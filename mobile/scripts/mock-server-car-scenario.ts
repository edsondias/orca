import type { RpcRequest, RpcResponse } from './mock-server-rpc-handlers'

type Respond = (response: RpcResponse) => void
type Success = (id: string, result: unknown, streaming?: boolean) => RpcResponse
type Failure = (id: string, code: string, message: string) => RpcResponse

const FENCE = { generation: 1, permissionSequence: 1, blockedSince: 1_000, promptKey: null }
let promptAnswered = false

function blockedEvent(seq: number) {
  return {
    type: 'notification',
    source: 'agent-task-complete',
    title: 'Claude · feat-login',
    body: 'Allow command: pnpm test?',
    worktreeId: 'mock-worktree',
    notificationSeq: seq,
    emittedAt: Date.now(),
    agentState: 'blocked',
    promptRef: {
      kind: 'terminal',
      terminalHandle: 'mock-terminal',
      fence: FENCE,
      permission: { lastAssistantMessage: 'Do you want to proceed?\n1. Yes\n2. No' }
    }
  }
}

export function handleMockCarRequest(
  request: RpcRequest,
  respond: Respond,
  success: Success,
  _error: Failure
): boolean {
  if (process.env.MOCK_CAR !== '1') {
    return false
  }
  switch (request.method) {
    case 'notifications.subscribe':
      respond(
        success(
          request.id,
          { type: 'ready', subscriptionId: 'mock-car', epoch: 'mock-epoch' },
          true
        )
      )
      // A blocked agent shortly after attach, so the DHU shows the announcement without manual steps.
      setTimeout(() => respond(success(request.id, blockedEvent(1), true)), 3_000)
      return true
    case 'notifications.unsubscribe':
      respond(success(request.id, { unsubscribed: true }))
      return true
    case 'terminal.replyToAgentPrompt': {
      const fence = request.params?.fence
      const matches = JSON.stringify(fence) === JSON.stringify(FENCE) && !promptAnswered
      promptAnswered = promptAnswered || matches
      respond(
        success(
          request.id,
          matches ? { delivered: true } : { delivered: false, reason: 'prompt-changed' }
        )
      )
      return true
    }
    default:
      return false
  }
}

export function resetMockCarScenario(): void {
  promptAnswered = false
}
