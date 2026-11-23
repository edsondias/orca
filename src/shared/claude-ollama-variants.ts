import type { SleepingAgentLaunchConfig } from './agent-session/lifecycle/agent-session-resume'
import type { TuiAgent } from './agent-launch/catalog/tui-agent'
import {
  resolveTuiAgentLaunchEnv,
  type AgentLaunchProfileSettings
} from './agent-launch/choices/tui-agent-launch-defaults'

export type ClaudeOllamaVariant = {
  id: string
  label: string
  model: string
  context1m: boolean
}

export type ClaudeOllamaVariantSettings = {
  /** Ollama models launched through the Claude CLI; absent means none. */
  claudeOllamaVariants?: ClaudeOllamaVariant[]
}

export type ClaudeVariantMark = { id: string; label: string }

export type ClaudeVariantLaunch =
  | { ok: true; env: Record<string, string>; mark: ClaudeVariantMark }
  | { ok: false }

export const MAX_CLAUDE_OLLAMA_VARIANTS = 20
export const MAX_CLAUDE_OLLAMA_VARIANT_LABEL_LENGTH = 40

const OLLAMA_BASE_URL = 'http://localhost:11434'
const OLLAMA_MODEL_PATTERN = /^[A-Za-z0-9._:/-]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateClaudeOllamaVariantDraft(draft: {
  label: string
  model: string
}): { ok: true } | { ok: false; field: 'label' | 'model' } {
  const label = draft.label.trim()
  if (label.length === 0 || label.length > MAX_CLAUDE_OLLAMA_VARIANT_LABEL_LENGTH) {
    return { ok: false, field: 'label' }
  }
  if (!OLLAMA_MODEL_PATTERN.test(draft.model)) {
    return { ok: false, field: 'model' }
  }
  return { ok: true }
}

export function normalizeClaudeOllamaVariants(input: unknown): ClaudeOllamaVariant[] {
  if (!Array.isArray(input)) {
    return []
  }
  const normalized: ClaudeOllamaVariant[] = []
  const seenIds = new Set<string>()
  for (const item of input) {
    if (!isRecord(item)) {
      continue
    }
    const { id: rawId, label, model } = item
    if (typeof rawId !== 'string' || typeof label !== 'string' || typeof model !== 'string') {
      continue
    }
    const id = rawId.trim()
    if (!id || seenIds.has(id) || !validateClaudeOllamaVariantDraft({ label, model }).ok) {
      continue
    }
    seenIds.add(id)
    normalized.push({ id, label: label.trim(), model, context1m: item.context1m === true })
    if (normalized.length >= MAX_CLAUDE_OLLAMA_VARIANTS) {
      break
    }
  }
  return normalized
}

export function buildClaudeOllamaVariantEnv(variant: ClaudeOllamaVariant): Record<string, string> {
  const longContextModel = variant.context1m ? `${variant.model}[1m]` : variant.model
  return {
    ANTHROPIC_BASE_URL: OLLAMA_BASE_URL,
    ANTHROPIC_AUTH_TOKEN: 'ollama',
    // Why: defined-but-empty overrides a real key inherited from the system environment.
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_MODEL: longContextModel,
    ANTHROPIC_DEFAULT_OPUS_MODEL: longContextModel,
    ANTHROPIC_DEFAULT_SONNET_MODEL: longContextModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: variant.model
  }
}

export function resolveClaudeVariantLaunch(args: {
  variants: readonly ClaudeOllamaVariant[] | null | undefined
  variantId: string
  baseEnv: Record<string, string>
}): ClaudeVariantLaunch {
  const variant = args.variants?.find((candidate) => candidate.id === args.variantId)
  if (!variant) {
    return { ok: false }
  }
  return {
    ok: true,
    env: { ...args.baseEnv, ...buildClaudeOllamaVariantEnv(variant) },
    mark: { id: variant.id, label: variant.label }
  }
}

/** Env for resuming a session; a marked Claude session never falls back to Anthropic's Claude. */
export function resolveResumeAgentLaunchEnv(args: {
  agent: TuiAgent
  launchConfig: SleepingAgentLaunchConfig | undefined
  claudeVariant: ClaudeVariantMark | null | undefined
  settings: (AgentLaunchProfileSettings & ClaudeOllamaVariantSettings) | null | undefined
}): { ok: true; env: Record<string, string> } | { ok: false } {
  if (args.launchConfig !== undefined) {
    return { ok: true, env: args.launchConfig.agentEnv }
  }
  const baseEnv = resolveTuiAgentLaunchEnv(args.agent, args.settings)
  if (!args.claudeVariant || args.agent !== 'claude') {
    return { ok: true, env: baseEnv }
  }
  const resolved = resolveClaudeVariantLaunch({
    variants: args.settings?.claudeOllamaVariants,
    variantId: args.claudeVariant.id,
    baseEnv
  })
  return resolved.ok ? { ok: true, env: resolved.env } : { ok: false }
}

/** A session `model` becomes `--model`, which would beat the variant's `ANTHROPIC_MODEL`. */
export function withoutClaudeVariantModelOption<T>(
  options: Record<string, T> | undefined
): Record<string, T> | undefined {
  if (!options) {
    return undefined
  }
  return Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'model'))
}
