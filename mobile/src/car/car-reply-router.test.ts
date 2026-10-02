import { describe, expect, it, vi } from 'vitest'
import { carReplyReceipt, createCarReplyRouter } from './car-reply-router'

const prompt = {
  hostId: 'h1',
  terminalHandle: 't1',
  notificationSeq: 7,
  agentState: 'blocked',
  fence: { generation: 1, permissionSequence: 0, blockedSince: 10, promptKey: null },
  permission: { lastAssistantMessage: 'Do you want to proceed?\n1. Yes\n2. No' }
}

describe('car reply router', () => {
  it('sends the option key for a spoken number and reports the label', async () => {
    const send = vi.fn().mockResolvedValue('delivered')
    const router = createCarReplyRouter({ send, now: () => 0 })
    const outcome = await router.reply('c1', prompt, 'um')
    expect(send).toHaveBeenCalledWith('h1', {
      terminal: 't1',
      fence: prompt.fence,
      text: '1',
      enter: false
    })
    expect(outcome).toEqual({ kind: 'delivered', label: 'Yes' })
    expect(carReplyReceipt(outcome)).toBe('✓ Sent: Yes')
  })

  it('reports a prompt that changed and sends nothing again', async () => {
    const send = vi.fn().mockResolvedValue('prompt-changed')
    const outcome = await createCarReplyRouter({ send, now: () => 0 }).reply('c1', prompt, 'um')
    expect(outcome.kind).toBe('prompt-changed')
    expect(send).toHaveBeenCalledTimes(1)
    expect(carReplyReceipt(outcome)).toBe('The agent already moved on; reply discarded')
  })

  it('marks a host without the method and stops offering replies there', async () => {
    const send = vi.fn().mockResolvedValue('method-not-found')
    const router = createCarReplyRouter({ send, now: () => 0 })
    expect((await router.reply('c1', prompt, 'um')).kind).toBe('unsupported')
    expect(router.isHostUnsupported('h1')).toBe(true)
  })

  it('never queues a reply while disconnected', async () => {
    const send = vi.fn().mockResolvedValue('disconnected')
    const outcome = await createCarReplyRouter({ send, now: () => 0 }).reply('c1', prompt, 'um')
    expect(outcome.kind).toBe('rejected')
  })

  it('says unverifiable for a host it cannot reach, never exited', async () => {
    const send = vi.fn().mockResolvedValue('unverifiable')
    const outcome = await createCarReplyRouter({ send, now: () => 0 }).reply('c1', prompt, 'um')
    expect(carReplyReceipt(outcome)).toBe(
      "No contact with the host; can't tell if the agent is alive"
    )
  })

  it('drops the same delivery repeated by Android Auto', async () => {
    const send = vi.fn().mockResolvedValue('delivered')
    const router = createCarReplyRouter({ send, now: () => 0 })
    await router.reply('c1', prompt, 'um')
    expect((await router.reply('c1', prompt, 'um')).kind).toBe('duplicate')
    expect(send).toHaveBeenCalledTimes(1)
  })
})
