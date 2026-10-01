import { describe, expect, it, vi } from 'vitest'
import { createAgentPromptSubmissionRuntime } from './agent-prompt-submission-runtime-test-fixture'

const worktrees = vi.hoisted(() => [
  {
    path: '/tmp/worktree-a',
    head: 'abc',
    branch: 'feature/prompt-fence',
    isBare: false,
    isMainWorktree: false
  }
])

vi.mock('../git/worktree', () => ({
  listWorktrees: vi.fn().mockResolvedValue(worktrees),
  listWorktreesStrict: vi.fn().mockResolvedValue(worktrees)
}))

async function blockedRuntime() {
  const { runtime, handle, writes } = await createAgentPromptSubmissionRuntime(
    () => undefined,
    'codex'
  )
  runtime.onPtyData('pty-prompt', '\x1b]0;Codex waiting for permission\x07', Date.now())
  return { runtime, handle, writes }
}

describe('replyToTerminalAgentPrompt', () => {
  it('writes when the prompt is still the one the phone saw', async () => {
    const { runtime, handle, writes } = await blockedRuntime()
    const fence = runtime.getTerminalAgentPromptFence(handle)
    expect(fence).not.toBeNull()
    if (!fence) {
      return
    }
    await runtime.replyToTerminalAgentPrompt(handle, fence, {
      text: '1',
      enter: false
    })
    expect(writes.join('')).toContain('1')
  })

  it('writes nothing after a newer permission prompt', async () => {
    const { runtime, handle, writes } = await blockedRuntime()
    const fence = runtime.getTerminalAgentPromptFence(handle)
    if (!fence) {
      throw new Error('expected a fence for the blocked terminal')
    }
    runtime.onPtyData('pty-prompt', '\x1b]0;Codex working\x07', Date.now())
    runtime.onPtyData('pty-prompt', '\x1b]0;Codex waiting for permission\x07', Date.now())
    const before = writes.length
    await expect(
      runtime.replyToTerminalAgentPrompt(handle, fence, {
        text: '1',
        enter: false
      })
    ).rejects.toThrow('agent_prompt_changed')
    expect(writes.length).toBe(before)
  })

  it('reports no fence for an agent that is not blocked', async () => {
    const { runtime, handle } = await blockedRuntime()
    runtime.onPtyData('pty-prompt', '\x1b]0;Codex working\x07', Date.now())
    expect(runtime.getTerminalAgentPromptFence(handle)).toBeNull()
  })
})
