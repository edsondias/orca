import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcRequest } from './mock-server-rpc-handlers'
import { success, error } from './mock-server-rpc-handlers'
import { handleMockCarRequest, resetMockCarScenario } from './mock-server-car-scenario'

type RpcResponse = ReturnType<typeof success> | ReturnType<typeof error>

describe('mock-server-car-scenario', () => {
  let responses: RpcResponse[]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    responses = []
    delete process.env.MOCK_CAR
    resetMockCarScenario()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetMockCarScenario()
  })

  it('returns false when MOCK_CAR is not set', () => {
    const request: RpcRequest = { id: '1', method: 'notifications.subscribe' }
    const respond = vi.fn()
    const result = handleMockCarRequest(request, respond, success, error)
    expect(result).toBe(false)
    expect(respond).not.toHaveBeenCalled()
  })

  it('handles notifications.subscribe with a ready frame and blocked notification', () => {
    process.env.MOCK_CAR = '1'
    const request: RpcRequest = { id: '1', method: 'notifications.subscribe' }
    const respond = vi.fn((response: RpcResponse) => {
      responses.push(response)
    })

    const result = handleMockCarRequest(request, respond, success, error)

    expect(result).toBe(true)
    expect(respond).toHaveBeenCalledTimes(1)

    // Check ready frame
    const readyFrame = responses[0]
    expect(readyFrame.id).toBe('1')
    expect(readyFrame.ok).toBe(true)
    expect(readyFrame.streaming).toBe(true)
    expect(readyFrame.result).toEqual({
      type: 'ready',
      subscriptionId: 'mock-car',
      epoch: 'mock-epoch'
    })

    // Advance time and check blocked notification
    vi.advanceTimersByTime(3000)
    expect(respond).toHaveBeenCalledTimes(2)

    const blockedNotif = responses[1]
    expect(blockedNotif.ok).toBe(true)
    expect(blockedNotif.streaming).toBe(true)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: verified by RPC design
    const notifResult = blockedNotif.result as Record<string, unknown>
    expect(notifResult.type).toBe('notification')
    expect(notifResult.source).toBe('agent-task-complete')
    expect(notifResult.title).toBe('Claude · feat-login')
    expect(notifResult.body).toBe('Allow command: pnpm test?')
    expect(notifResult.agentState).toBe('blocked')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: verified by RPC design
    const promptRef = notifResult.promptRef as Record<string, unknown>
    expect(promptRef.kind).toBe('terminal')
  })

  it('replies to agent prompt with matching fence', () => {
    process.env.MOCK_CAR = '1'
    const fence = { generation: 1, permissionSequence: 1, blockedSince: 1_000, promptKey: null }
    const request: RpcRequest = {
      id: '2',
      method: 'terminal.replyToAgentPrompt',
      params: { fence, text: 'Yes', enter: true }
    }
    const respond = vi.fn((response: RpcResponse) => {
      responses.push(response)
    })

    const result = handleMockCarRequest(request, respond, success, error)

    expect(result).toBe(true)
    expect(responses[0].result).toEqual({ delivered: true })
  })

  it('rejects second identical reply due to prompt change', () => {
    process.env.MOCK_CAR = '1'
    const fence = { generation: 1, permissionSequence: 1, blockedSince: 1_000, promptKey: null }

    // First reply
    const request1: RpcRequest = {
      id: '2',
      method: 'terminal.replyToAgentPrompt',
      params: { fence, text: 'Yes', enter: true }
    }
    const respond1 = vi.fn((response: RpcResponse) => {
      responses.push(response)
    })
    handleMockCarRequest(request1, respond1, success, error)
    expect(responses[0].result).toEqual({ delivered: true })

    // Second reply with same fence
    responses = []
    const request2: RpcRequest = {
      id: '3',
      method: 'terminal.replyToAgentPrompt',
      params: { fence, text: 'No', enter: true }
    }
    const respond2 = vi.fn((response: RpcResponse) => {
      responses.push(response)
    })
    handleMockCarRequest(request2, respond2, success, error)
    expect(responses[0].result).toEqual({ delivered: false, reason: 'prompt-changed' })
  })

  it('rejects reply with different fence', () => {
    process.env.MOCK_CAR = '1'
    const _fence = { generation: 1, permissionSequence: 1, blockedSince: 1_000, promptKey: null }
    const differentFence = {
      generation: 2,
      permissionSequence: 1,
      blockedSince: 1_000,
      promptKey: null
    }

    const request: RpcRequest = {
      id: '2',
      method: 'terminal.replyToAgentPrompt',
      params: { fence: differentFence, text: 'Yes', enter: true }
    }
    const respond = vi.fn((response: RpcResponse) => {
      responses.push(response)
    })

    const result = handleMockCarRequest(request, respond, success, error)

    expect(result).toBe(true)
    expect(responses[0].result).toEqual({ delivered: false, reason: 'prompt-changed' })
  })

  it('handles notifications.unsubscribe', () => {
    process.env.MOCK_CAR = '1'
    const request: RpcRequest = {
      id: '4',
      method: 'notifications.unsubscribe',
      params: { subscriptionId: 'mock-car' }
    }
    const respond = vi.fn((response: RpcResponse) => {
      responses.push(response)
    })

    const result = handleMockCarRequest(request, respond, success, error)

    expect(result).toBe(true)
    expect(responses[0].result).toEqual({ unsubscribed: true })
  })

  it('returns false for unknown methods', () => {
    process.env.MOCK_CAR = '1'
    const request: RpcRequest = { id: '5', method: 'unknown.method' }
    const respond = vi.fn()

    const result = handleMockCarRequest(request, respond, success, error)

    expect(result).toBe(false)
  })
})
