import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../orca-runtime'
import { RpcDispatcher } from './dispatcher'
import { TERMINAL_METHODS } from './methods/terminal'

const fence = { generation: 1, permissionSequence: 2, blockedSince: null, promptKey: null }

function dispatcherWith(reply: ReturnType<typeof vi.fn>, extra: Record<string, unknown> = {}) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the method under test only touches these members.
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    replyToTerminalAgentPrompt: reply,
    resolveLiveLeafForHandle: () => ({ ptyId: 'pty-1' }),
    getDriver: () => ({ kind: 'idle' }),
    ...extra
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

  it('refuses without writing when another client holds the terminal', async () => {
    const reply = vi.fn()
    const response = await dispatcherWith(reply, {
      getDriver: () => ({ kind: 'mobile', clientId: 'phone' })
    }).dispatch({
      id: 'r5',
      authToken: 'tok',
      method: 'terminal.replyToAgentPrompt',
      params: {
        terminal: 't1',
        fence,
        text: '1',
        enter: true,
        client: { id: 'd1', type: 'desktop' }
      }
    })
    expect(response).toMatchObject({
      ok: true,
      result: { delivered: false, reason: 'terminal-locked' }
    })
    expect(reply).not.toHaveBeenCalled()
  })

  it('claims and commits the mobile input floor on success', async () => {
    const commit = vi.fn().mockResolvedValue(undefined)
    const rollback = vi.fn()
    const begin = vi.fn().mockReturnValue({ commit, rollback })
    const reply = vi.fn(async (_h, _f, _a, options) => {
      options.reserveWrite('pty-1')
      await options.afterWrite('pty-1')
    })
    const response = await dispatcherWith(reply, { beginMobileInputFloor: begin }).dispatch({
      id: 'r6',
      authToken: 'tok',
      method: 'terminal.replyToAgentPrompt',
      params: {
        terminal: 't1',
        fence,
        text: '1',
        enter: false,
        client: { id: 'phone', type: 'mobile' }
      }
    })
    expect(response).toMatchObject({ ok: true, result: { delivered: true } })
    expect(begin).toHaveBeenCalledWith('pty-1', 'phone')
    expect(commit).toHaveBeenCalledTimes(1)
    expect(rollback).not.toHaveBeenCalled()
  })

  it('rolls the floor back when the fence refuses the write', async () => {
    const commit = vi.fn()
    const rollback = vi.fn()
    const begin = vi.fn().mockReturnValue({ commit, rollback })
    const reply = vi.fn(async (_h, _f, _a, options) => {
      options.reserveWrite('pty-1')
      throw new Error('agent_prompt_changed')
    })
    const response = await dispatcherWith(reply, { beginMobileInputFloor: begin }).dispatch({
      id: 'r7',
      authToken: 'tok',
      method: 'terminal.replyToAgentPrompt',
      params: {
        terminal: 't1',
        fence,
        text: '1',
        enter: false,
        client: { id: 'phone', type: 'mobile' }
      }
    })
    expect(response).toMatchObject({
      ok: true,
      result: { delivered: false, reason: 'prompt-changed' }
    })
    expect(commit).not.toHaveBeenCalled()
    expect(rollback).toHaveBeenCalledTimes(1)
  })
})
