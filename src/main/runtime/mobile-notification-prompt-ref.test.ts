import { describe, expect, it } from 'vitest'
import { RuntimeMobileNotificationController } from './runtime-mobile-notification-controller'

describe('mobile notification prompt reference', () => {
  it('rides the socket stream and the replay untouched', () => {
    const controller = new RuntimeMobileNotificationController()
    const seen: unknown[] = []
    controller.onDispatched((event) => seen.push(event))
    const promptRef = { kind: 'structured' as const, sessionId: 's1' }
    controller.dispatch({
      type: 'notification',
      source: 'agent-task-complete',
      agentState: 'blocked',
      title: 't',
      body: '',
      worktreeId: 'wt',
      promptRef
    })
    expect(seen[0]).toMatchObject({ promptRef })
    expect(controller.getMissedSince(0)[0]).toMatchObject({ promptRef })
  })
})
