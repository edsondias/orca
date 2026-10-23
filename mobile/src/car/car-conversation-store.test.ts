import { describe, expect, it } from 'vitest'
import { createCarConversationStore } from './car-conversation-store'

const fence = { generation: 1, permissionSequence: 0, blockedSince: 10, promptKey: null }
const blocked = {
  type: 'notification' as const,
  source: 'agent-task-complete',
  title: 'Claude · feat-login',
  body: 'I will now run the tests as discussed.',
  notificationSeq: 7,
  agentState: 'blocked',
  emittedAt: 100,
  promptRef: {
    kind: 'terminal' as const,
    terminalHandle: 't1',
    fence,
    permission: {
      interactivePrompt: JSON.stringify({ approval: { tool: 'Bash', summary: 'pnpm test' } })
    }
  }
}
const approvalFor = (summary: string) => ({
  ...blocked.promptRef,
  permission: { interactivePrompt: JSON.stringify({ approval: { tool: 'Edit', summary } }) }
})

describe('car conversation store', () => {
  it('keeps one stable conversation per terminal', () => {
    const store = createCarConversationStore(() => 1)
    const first = store.applyEvent('h1', blocked)
    const second = store.applyEvent('h1', {
      ...blocked,
      notificationSeq: 8,
      promptRef: approvalFor('src/a.ts')
    })
    expect(first?.id).toBe(second?.id)
    expect(second?.messages.map((m) => m.text)).toEqual([
      'Allow Bash? pnpm test',
      'Allow Edit? src/a.ts'
    ])
  })

  it('speaks the permission subject, never the agent prose in the body', () => {
    const store = createCarConversationStore(() => 1)
    const conversation = store.applyEvent('h1', blocked)
    expect(conversation?.messages.at(-1)?.text).toBe('Allow Bash? pnpm test')
    expect(JSON.stringify(conversation)).not.toContain('run the tests as discussed')
  })

  it('publishes a blocked prompt without a permission subject read-only', () => {
    const store = createCarConversationStore(() => 1)
    const conversation = store.applyEvent('h1', {
      ...blocked,
      promptRef: { kind: 'terminal', terminalHandle: 't1', fence }
    })
    if (!conversation) {
      throw new Error('expected conversation')
    }
    expect(conversation.canReply).toBe(false)
    expect(store.pendingPrompt(conversation.id)).toBeNull()
    expect(conversation.messages.map((m) => m.text)).toEqual([
      'The agent is waiting for your input',
      'Reply to this one from your phone'
    ])
  })

  it('offers a reply only for a fenced terminal prompt', () => {
    const store = createCarConversationStore(() => 1)
    expect(store.applyEvent('h1', blocked)?.canReply).toBe(true)
    const done = store.applyEvent('h1', {
      ...blocked,
      notificationSeq: 9,
      agentState: 'done',
      promptRef: undefined,
      body: 'Done'
    })
    if (!done) {
      throw new Error('expected conversation')
    }
    expect(done.canReply).toBe(false)
    expect(store.pendingPrompt(done.id)).toBeNull()
  })

  it('keeps structured sessions read-only in phase 1', () => {
    const store = createCarConversationStore(() => 1)
    const conversation = store.applyEvent('h1', {
      ...blocked,
      promptRef: { kind: 'structured', sessionId: 's1' }
    })
    expect(conversation?.canReply).toBe(false)
    expect(conversation?.messages.at(-1)?.text).toContain('Reply to this one from your phone')
  })

  it('announces an exited agent with the exited wording', () => {
    const store = createCarConversationStore(() => 1)
    const conversation = store.applyEvent('h1', {
      type: 'notification',
      source: 'agent-exited',
      title: 'Agent exited',
      body: '',
      notificationId: 'agent-exited:p1'
    })
    expect(conversation?.messages.at(-1)?.text).toBe('Agent exited')
  })

  it('ignores terminal bells and tests', () => {
    const store = createCarConversationStore(() => 1)
    expect(store.applyEvent('h1', { ...blocked, source: 'terminal-bell' })).toBeNull()
    expect(store.applyEvent('h1', { ...blocked, source: 'test' })).toBeNull()
  })

  it('forgets everything on clear', () => {
    const store = createCarConversationStore(() => 1)
    store.applyEvent('h1', blocked)
    store.clear()
    expect(store.conversationIds()).toEqual([])
  })
})
