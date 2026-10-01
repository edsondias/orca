import { OrcaRuntimeWithSerializeAgentPromptSubmission } from './orca-runtime-serialize-agent-prompt-submission'
import type { RuntimeTerminalPromptDelivery } from '../../shared/runtime-types'
import type { RuntimeLeafRecord, RuntimePtyWorktreeRecord } from './runtime-terminal-state-records'
import type { TerminalHandleRecord } from './runtime-terminal-contracts'
import type {
  AgentPromptTurnStartEvidence,
  AgentPromptWaitTextCache
} from './agent-prompt-submission-verification'
import { verifyAgentPromptSubmission } from './agent-prompt-submission-verification'
import { AgentPromptRequestCorrelation } from './agent-prompt-request-correlation'
import { createHash } from 'node:crypto'
import type { MobileNotificationPromptRef } from '../../shared/mobile-notification-prompt-ref'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-ipc-payload'
import {
  isTerminalAgentPromptFenceCurrent,
  type TerminalAgentPromptFence
} from '../../shared/terminal-agent-prompt-fence'

export class OrcaRuntimeWithAgentPromptRequestCorrelation extends OrcaRuntimeWithSerializeAgentPromptSubmission {
  private readonly agentPromptCorrelation = new AgentPromptRequestCorrelation()
  // Declared, not defined: both live further up the mixin chain, so this link cannot see them.
  declare protected getLivePtyForHandle: (
    handle: string
  ) => { record: TerminalHandleRecord; pty: RuntimePtyWorktreeRecord } | null
  declare protected getTerminalHandleForPaneKey: (paneKey: string) => string | null
  declare protected getLiveLeafForHandle: (handle: string) => {
    record: TerminalHandleRecord
    leaf: RuntimeLeafRecord
  }

  getTerminalPromptRequestBinding(handle: string): {
    ptyId: string
    processIncarnation: string
    generation: number
  } {
    const live = this.getLivePtyForHandle(handle)
    const ptyId = live?.pty.ptyId ?? this.getLiveLeafForHandle(handle).leaf.ptyId
    if (!ptyId) {
      throw new Error('terminal_not_writable')
    }
    const generation = this.getPtyLifecycleGeneration(ptyId)
    const incarnationId = live?.pty.incarnationId ?? this.ptysById.get(ptyId)?.incarnationId
    return {
      ptyId,
      processIncarnation: incarnationId ?? `${this.runtimeId}:${ptyId}:${generation}`,
      generation
    }
  }

  getTerminalAgentPromptFence(handle: string): TerminalAgentPromptFence | null {
    const binding = this.getTerminalPromptRequestBinding(handle)
    const activity = this.getAgentPromptActivity(handle, binding.ptyId)
    if (activity.status !== 'permission') {
      return null
    }
    const hookRow = this.findHookAgentStatusForHandle(handle)
    return {
      generation: binding.generation,
      permissionSequence: activity.permissionSequence,
      blockedSince: hookRow?.stateStartedAt ?? null,
      promptKey: hookRow ? hashHookPromptContent(hookRow) : null
    }
  }

  resolveMobileNotificationPromptRef(paneKey: string): MobileNotificationPromptRef | undefined {
    try {
      const handle = this.getTerminalHandleForPaneKey(paneKey)
      const fence = handle ? this.getTerminalAgentPromptFence(handle) : null
      if (!handle || !fence) {
        return undefined
      }
      const row = this.findHookAgentStatusForHandle(handle)
      const permission = row
        ? {
            ...(row.interactivePrompt ? { interactivePrompt: row.interactivePrompt } : {}),
            ...(row.lastAssistantMessage
              ? { lastAssistantMessage: row.lastAssistantMessage.slice(0, 4000) }
              : {})
          }
        : undefined
      return {
        kind: 'terminal',
        terminalHandle: handle,
        fence,
        ...(permission ? { permission } : {})
      }
    } catch (error) {
      // A pane without a writable PTY has no prompt to answer; anything else is a real bug.
      if (error instanceof Error && error.message === 'terminal_not_writable') {
        return undefined
      }
      throw error
    }
  }

  async replyToTerminalAgentPrompt(
    handle: string,
    expected: TerminalAgentPromptFence,
    action: { text: string; enter: boolean },
    options: {
      signal?: AbortSignal
      reserveWrite?: (ptyId: string) => void
      afterWrite?: (ptyId: string) => void | Promise<void>
    } = {}
  ): Promise<void> {
    await this.sendTerminal(
      handle,
      { text: action.text, enter: action.enter },
      {
        signal: options.signal,
        reserveWrite: options.reserveWrite,
        afterWrite: options.afterWrite,
        inputKind: 'driving',
        // Distinguishes "Enter withheld after the text landed" from a clean pre-write refusal.
        suffixFailureError: 'agent_prompt_changed_after_text',
        // Checked at write time so a prompt that changed after the phone read it is never answered.
        beforeWrite: () => {
          if (
            !isTerminalAgentPromptFenceCurrent(expected, this.getTerminalAgentPromptFence(handle))
          ) {
            throw new Error('agent_prompt_changed')
          }
        }
      }
    )
  }

  /** The fresh, floor-respecting hook row for the terminal, or null. */
  protected findHookAgentStatusForHandle(handle: string): AgentStatusIpcPayload | null {
    const { ptyId } = this.getTerminalPromptRequestBinding(handle)
    return this.getFreshExplicitAgentStatusForPty(handle, ptyId)?.row ?? null
  }

  async observeTerminalAgentPrompt(
    handle: string,
    prompt: RuntimeTerminalPromptDelivery,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<RuntimeTerminalPromptDelivery> {
    const binding = this.getTerminalPromptRequestBinding(handle)
    if (
      binding.processIncarnation !== prompt.processIncarnation ||
      binding.generation !== prompt.generation
    ) {
      return { ...prompt, observation: 'incarnation_replaced' }
    }
    const waitTextCache: AgentPromptWaitTextCache = {}
    const baseline = this.getAgentPromptActivity(handle, binding.ptyId, waitTextCache)
    try {
      await verifyAgentPromptSubmission({
        baseline: {
          ...baseline,
          workingSequence: prompt.baselineWorkingSequence,
          ...(prompt.baselinePermissionSequence !== undefined
            ? { permissionSequence: prompt.baselinePermissionSequence }
            : {}),
          ...(prompt.baselineExplicitWorkingStartedAt !== undefined
            ? { explicitWorkingStartedAt: prompt.baselineExplicitWorkingStartedAt }
            : {})
        },
        readActivity: () => this.getAgentPromptActivity(handle, binding.ptyId, waitTextCache),
        acceptTurnStart: (evidence) =>
          this.acceptAgentPromptTurnStart(
            binding.ptyId,
            binding.generation,
            prompt.requestId,
            prompt.baselineWorkingSequence,
            prompt.baselineExplicitWorkingStartedAt ?? null,
            evidence
          ),
        // Old hosts omit the hook baseline, so their receipts retain title-only observation.
        allowHookEvidence: prompt.baselineExplicitWorkingStartedAt !== undefined,
        allowOutputEvidence: false,
        signal,
        timeoutMs
      })
      this.forgetAgentPromptRequest(binding.ptyId, binding.generation, prompt.requestId)
      return { ...prompt, stages: ['input_accepted', 'turn_started'], observation: 'supported' }
    } catch (error) {
      if (error instanceof Error && error.message === 'agent_prompt_stalled') {
        return prompt
      }
      if (error instanceof Error && error.message === 'agent_prompt_blocked') {
        this.forgetAgentPromptRequest(binding.ptyId, binding.generation, prompt.requestId)
        return { ...prompt, observation: 'permission' }
      }
      throw error
    }
  }

  protected registerAgentPromptRequest(
    ptyId: string,
    generation: number,
    requestId: string,
    baselineWorkingSequence: number,
    baselineExplicitWorkingStartedAt: number | null
  ): void {
    this.agentPromptCorrelation.register(ptyId, {
      generation,
      requestId,
      baselineWorkingSequence,
      baselineExplicitWorkingStartedAt
    })
  }

  protected forgetAgentPromptRequest(ptyId: string, generation: number, requestId: string): void {
    this.agentPromptCorrelation.forget(ptyId, generation, requestId)
  }

  protected acceptAgentPromptTurnStart(
    ptyId: string,
    generation: number,
    requestId: string,
    baselineWorkingSequence: number,
    baselineExplicitWorkingStartedAt: number | null,
    evidence: AgentPromptTurnStartEvidence
  ): boolean {
    return this.agentPromptCorrelation.acceptTurnStart(
      ptyId,
      generation,
      requestId,
      baselineWorkingSequence,
      baselineExplicitWorkingStartedAt,
      evidence
    )
  }

  protected clearAgentPromptCorrelationForPty(ptyId: string): void {
    this.agentPromptCorrelation.clearForPty(ptyId)
  }
}

// Hook blocks keep stateStartedAt across consecutive prompts, so the prompt content tells them apart.
function hashHookPromptContent(row: AgentStatusIpcPayload): string {
  return createHash('sha256')
    .update(`${row.toolName ?? ''}|${row.toolInput ?? ''}|${row.interactivePrompt ?? ''}`)
    .digest('hex')
    .slice(0, 16)
}
