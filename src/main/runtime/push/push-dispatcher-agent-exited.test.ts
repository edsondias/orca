import { describe, expect, it } from 'vitest'
import { createHarness, flush, notification, registration } from './push-dispatcher.test-fixture'

describe('PushDispatcher agent-exited', () => {
  it('never pushes agent-exited, which only rides the paired socket', async () => {
    const harness = createHarness({
      devices: [{ deviceId: 'a', pushRegistration: registration({ registrationId: 'reg-a' }) }]
    })
    harness.dispatcher.enqueue(
      notification({ source: 'agent-exited', title: 'Agent exited', body: '' })
    )
    await flush()
    expect(harness.sends).toHaveLength(0)
  })
})
