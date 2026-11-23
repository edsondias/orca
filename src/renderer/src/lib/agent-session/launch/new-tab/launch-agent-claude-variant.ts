import type { GlobalSettings } from '../../../../../../shared/settings/global-settings-types'
import type { TuiAgent } from '../../../../../../shared/agent-launch/catalog/tui-agent'
import {
  resolveTuiAgentLaunchEnv,
  type AgentLaunchProfileSettings
} from '../../../../../../shared/agent-launch/choices/tui-agent-launch-defaults'
import type { AgentStartupPlanInputs } from '../../../../../../shared/agent-launch/startup/agent-startup-plan-inputs'
import {
  resolveClaudeVariantLaunch,
  withoutClaudeVariantModelOption,
  type ClaudeVariantMark
} from '../../../../../../shared/claude-ollama-variants'
import { translate } from '@/i18n/i18n'
import { notifyAgentLaunchFailure } from '@/lib/agent-session/launch/failure/agent-launch-failure'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { isWebRuntimeSessionActive } from '@/runtime/web-session-tabs-sync/identity/web-runtime-session-environment'
import { refuseAgentTabLaunch } from './launch-agent-tab-refusal'
import type { LaunchAgentInNewTabArgs } from './launch-agent-in-new-tab-args'
import type { AgentTabLaunchOutcome } from './launch-agent-in-new-tab-host-agents'

export type LaunchAgentClaudeVariantSettings =
  | (AgentLaunchProfileSettings & Partial<Pick<GlobalSettings, 'claudeOllamaVariants'>>)
  | null
  | undefined

export type LaunchAgentClaudeVariant = {
  agentEnv: Record<string, string>
  /** Null for a launch that names no variant. */
  mark: ClaudeVariantMark | null
  sessionOptions: <T>(options: Record<string, T> | undefined) => Record<string, T> | undefined
  /** The variant's env wins, and no saved or picked `model` becomes a `--model` flag. */
  startupInputs: (inputs: AgentStartupPlanInputs) => AgentStartupPlanInputs
}

/** Null when a variant was asked for and cannot launch: it must never fall back to Anthropic's Claude. */
export function resolveLaunchAgentClaudeVariant(
  agent: TuiAgent,
  claudeVariantId: string | undefined,
  settings: LaunchAgentClaudeVariantSettings
): LaunchAgentClaudeVariant | null {
  const baseEnv = resolveTuiAgentLaunchEnv(agent, settings)
  if (claudeVariantId === undefined) {
    return {
      agentEnv: baseEnv,
      mark: null,
      sessionOptions: (options) => options,
      startupInputs: (inputs) => inputs
    }
  }
  if (agent !== 'claude') {
    return null
  }
  const resolved = resolveClaudeVariantLaunch({
    variants: settings?.claudeOllamaVariants,
    variantId: claudeVariantId,
    baseEnv: {}
  })
  if (!resolved.ok) {
    return null
  }
  const variantEnv = resolved.env
  return {
    agentEnv: { ...baseEnv, ...variantEnv },
    mark: resolved.mark,
    sessionOptions: withoutClaudeVariantModelOption,
    startupInputs: (inputs) => {
      const sessionOptions = withoutClaudeVariantModelOption(inputs.sessionOptions)
      return {
        ...inputs,
        agentEnv: { ...inputs.agentEnv, ...variantEnv },
        sessionOptions:
          sessionOptions && Object.keys(sessionOptions).length ? sessionOptions : undefined
      }
    }
  }
}

/** Null when this launch cannot carry the variant's env: a chat, or a paired host that owns its env. */
export function resolveNewTabClaudeVariant(
  store: Parameters<typeof runtimeEnvironmentIdOrLocalUnlessTwin>[0] & {
    settings?: LaunchAgentClaudeVariantSettings
  },
  args: LaunchAgentInNewTabArgs
): LaunchAgentClaudeVariant | null {
  const variant = resolveLaunchAgentClaudeVariant(args.agent, args.claudeVariantId, store.settings)
  if (!variant?.mark) {
    return variant
  }
  const opensChat =
    args.requestedSurface === 'chat' ||
    args.agentSessionLaunchPlan?.route === 'structured-native-chat'
  const pairedHost = isWebRuntimeSessionActive(
    runtimeEnvironmentIdOrLocalUnlessTwin(store, args.worktreeId)
  )
  return opensChat || pairedHost ? null : variant
}

export function refuseClaudeVariant(
  args: LaunchAgentInNewTabArgs,
  notifyFailure: boolean
): AgentTabLaunchOutcome {
  const recovery = translate(
    'agentLaunch.claudeVariantUnavailable',
    'This Ollama model is no longer configured, or this workspace cannot run it.'
  )
  return refuseAgentTabLaunch(
    args,
    recovery,
    () => notifyAgentLaunchFailure(args.agent, recovery),
    notifyFailure
  )
}
