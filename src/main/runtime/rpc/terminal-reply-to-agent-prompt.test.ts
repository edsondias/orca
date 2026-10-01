import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../orca-runtime'
import { RpcDispatcher } from './dispatcher'
import { TERMINAL_METHODS } from './methods/terminal'

const fence = { generation: 1, permissionSequence: 2, blockedSince: null, promptKey: null }

function dispatcherWith(reply: ReturnType<typeof vi.fn>) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the method under test only touches these two members.
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    replyToTerminalAgentPrompt: reply
  } as unknown as OrcaRuntimeService
  return new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })
}

describe('terminal.replyToAgentPrompt', () => {
  it('delivers when the host fence matches', async () => {
    const reply = vi.fn().mockResolvedValue(undefined)
    const response = await dispatcherWith(reply).dispatch({
      id: 'r1',
      authToken: 'tok',
      method: 'terminal.replyToAgentPrompt',
      params: { terminal: 't1', fence, text: '1', enter: false }
    })
    expect(response).toMatchObject({ ok: true, result: { delivered: true } })
    expect(reply).toHaveBeenCalledWith('t1', fence, { text: '1', enter: false }, expect.anything())
  })

  it('reports prompt-changed instead of failing', async () => {
    const reply = vi.fn().mockRejectedValue(new Error('agent_prompt_changed'))
    const response = await dispatcherWith(reply).dispatch({
      id: 'r2',
      authToken: 'tok',
      method: 'terminal.replyToAgentPrompt',
      params: { terminal: 't1', fence, text: '1', enter: false }
    })
    expect(response).toMatchObject({
      ok: true,
      result: { delivered: false, reason: 'prompt-changed' }
    })
  })

  it('reports prompt-changed-after-text when only the Enter was withheld', async () => {
    const reply = vi.fn().mockRejectedValue(new Error('agent_prompt_changed_after_text'))
    const response = await dispatcherWith(reply).dispatch({
      id: 'r4',
      authToken: 'tok',
      method: 'terminal.replyToAgentPrompt',
      params: { terminal: 't1', fence, text: '1', enter: true }
    })
    expect(response).toMatchObject({
      ok: true,
      result: { delivered: false, reason: 'prompt-changed-after-text' }
    })
  })

  it('rejects text over 500 characters', async () => {
    const response = await dispatcherWith(vi.fn()).dispatch({
      id: 'r3',
      authToken: 'tok',
      method: 'terminal.replyToAgentPrompt',
      params: { terminal: 't1', fence, text: 'x'.repeat(501), enter: true }
    })
    expect(response.ok).toBe(false)
  })
})
