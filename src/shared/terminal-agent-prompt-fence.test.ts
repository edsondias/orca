import { describe, expect, it } from 'vitest'
import { isTerminalAgentPromptFenceCurrent } from './terminal-agent-prompt-fence'

const fence = { generation: 3, permissionSequence: 2, blockedSince: 1000 }

describe('isTerminalAgentPromptFenceCurrent', () => {
  it('accepts the same prompt', () => {
    expect(isTerminalAgentPromptFenceCurrent(fence, { ...fence })).toBe(true)
  })
  it('refuses when the agent is no longer blocked', () => {
    expect(isTerminalAgentPromptFenceCurrent(fence, null)).toBe(false)
  })
  it('refuses a respawned pty even when the sequence restarted at the same value', () => {
    expect(isTerminalAgentPromptFenceCurrent(fence, { ...fence, generation: 4 })).toBe(false)
  })
  it('refuses a newer OSC permission prompt', () => {
    expect(
      isTerminalAgentPromptFenceCurrent(fence, {
        ...fence,
        permissionSequence: 3
      })
    ).toBe(false)
  })
  it('refuses a newer hook-reported block', () => {
    expect(
      isTerminalAgentPromptFenceCurrent(fence, {
        ...fence,
        blockedSince: 2000
      })
    ).toBe(false)
  })
})
