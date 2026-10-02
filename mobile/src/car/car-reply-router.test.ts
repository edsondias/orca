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

  it('allows retry of a failed send (transient error releases dedupe key)', async () => {
    const send = vi.fn()
    send.mockResolvedValueOnce('disconnected')
    send.mockResolvedValueOnce('delivered')
    const router = createCarReplyRouter({ send, now: () => 0 })
    expect((await router.reply('c1', prompt, 'um')).kind).toBe('rejected')
    expect((await router.reply('c1', prompt, 'um')).kind).toBe('delivered')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('blocks concurrent identical replies while first is pending', async () => {
    let resolve: () => void
    const send = vi.fn(
      () =>
        new Promise<'delivered'>((r) => {
          resolve = () => r('delivered')
        })
    )
    const router = createCarReplyRouter({ send, now: () => 0 })
    const first = router.reply('c1', prompt, 'um')
    const second = router.reply('c1', prompt, 'um')
    resolve!()
    const [f, s] = await Promise.all([first, second])
    expect(f.kind).toBe('delivered')
    expect(s.kind).toBe('duplicate')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('rejects non-option speech with menu pending', async () => {
    const send = vi.fn()
    const outcome = await createCarReplyRouter({ send, now: () => 0 }).reply(
      'c1',
      prompt,
      'um teste rápido'
    )
    expect(outcome.kind).toBe('not-an-option')
    expect(carReplyReceipt(outcome)).toBe('Say the option number, or yes or no')
    expect(send).not.toHaveBeenCalled()
  })

  it('handles failed send (maps to rejected)', async () => {
    const send = vi.fn().mockResolvedValue('failed')
    const outcome = await createCarReplyRouter({ send, now: () => 0 }).reply('c1', prompt, 'um')
    expect(outcome.kind).toBe('rejected')
    expect(carReplyReceipt(outcome)).toBe('Reply not sent')
  })

  it('sets isHostUnsupported after method-not-found', async () => {
    const send = vi.fn().mockResolvedValue('method-not-found')
    const router = createCarReplyRouter({ send, now: () => 0 })
    expect(router.isHostUnsupported('h1')).toBe(false)
    await router.reply('c1', prompt, 'um')
    expect(router.isHostUnsupported('h1')).toBe(true)
  })

  it('allows retry when send throws (error releases dedupe key)', async () => {
    const send = vi.fn()
    send.mockRejectedValueOnce(new Error('network error'))
    send.mockResolvedValueOnce('delivered')
    const router = createCarReplyRouter({ send, now: () => 0 })
    expect((await router.reply('c1', prompt, 'um')).kind).toBe('rejected')
    expect((await router.reply('c1', prompt, 'um')).kind).toBe('delivered')
    expect(send).toHaveBeenCalledTimes(2)
  })
})
