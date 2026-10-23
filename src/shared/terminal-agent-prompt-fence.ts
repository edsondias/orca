/** Identity of one pending agent prompt on a terminal, as the execution host saw it. */
export type TerminalAgentPromptFence = {
  /** PTY lifecycle generation; a respawn resets permissionSequence, so both are compared. */
  generation: number
  /** OSC/title permission observations on this PTY. */
  permissionSequence: number
  /** Hook-reported stateStartedAt of the blocked state; hook blocks never bump permissionSequence. */
  blockedSince: number | null
  /** Hash of the hook row's prompt content; consecutive hook blocks share blockedSince. */
  promptKey: string | null
}

export function isTerminalAgentPromptFenceCurrent(
  expected: TerminalAgentPromptFence,
  current: TerminalAgentPromptFence | null
): boolean {
  return (
    current !== null &&
    current.generation === expected.generation &&
    current.permissionSequence === expected.permissionSequence &&
    current.blockedSince === expected.blockedSince &&
    current.promptKey === expected.promptKey
  )
}
