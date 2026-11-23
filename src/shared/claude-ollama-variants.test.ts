import { describe, expect, it } from 'vitest'
import {
  buildClaudeOllamaVariantEnv,
  normalizeClaudeOllamaVariants,
  resolveClaudeVariantLaunch,
  resolveResumeAgentLaunchEnv,
  validateClaudeOllamaVariantDraft,
  withoutClaudeVariantModelOption
} from './claude-ollama-variants'

const kimi = { id: 'v1', label: 'Kimi K3.1', model: 'kimi-k3.1-pro:cloud', context1m: true }
const mark = { id: 'v1', label: 'Kimi K3.1' }

describe('buildClaudeOllamaVariantEnv', () => {
  it('builds the Ollama env with the 1m suffix except for haiku', () => {
    expect(buildClaudeOllamaVariantEnv(kimi)).toEqual({
      ANTHROPIC_BASE_URL: 'http://localhost:11434',
      ANTHROPIC_AUTH_TOKEN: 'ollama',
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_MODEL: 'kimi-k3.1-pro:cloud[1m]',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'kimi-k3.1-pro:cloud[1m]',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'kimi-k3.1-pro:cloud[1m]',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'kimi-k3.1-pro:cloud'
    })
  })

  it('omits the suffix when context1m is off', () => {
    expect(buildClaudeOllamaVariantEnv({ ...kimi, context1m: false }).ANTHROPIC_MODEL).toBe(
      'kimi-k3.1-pro:cloud'
    )
  })
})

describe('resolveClaudeVariantLaunch', () => {
  it('lets the variant env win over the configured Claude env', () => {
    const result = resolveClaudeVariantLaunch({
      variants: [kimi],
      variantId: 'v1',
      baseEnv: { ANTHROPIC_BASE_URL: 'https://proxy.example', ANTHROPIC_MODEL: 'opus', FOO: 'bar' }
    })
    expect(result).toEqual({
      ok: true,
      env: expect.objectContaining({
        ANTHROPIC_BASE_URL: 'http://localhost:11434',
        ANTHROPIC_MODEL: 'kimi-k3.1-pro:cloud[1m]',
        FOO: 'bar'
      }),
      mark: { id: 'v1', label: 'Kimi K3.1' }
    })
  })

  it('fails when the variant id is unknown', () => {
    expect(
      resolveClaudeVariantLaunch({ variants: [kimi], variantId: 'gone', baseEnv: {} })
    ).toEqual({ ok: false })
    expect(
      resolveClaudeVariantLaunch({ variants: undefined, variantId: 'v1', baseEnv: {} })
    ).toEqual({ ok: false })
  })
})

describe('resolveResumeAgentLaunchEnv', () => {
  it('prefers the captured env over the current variant', () => {
    const launchConfig = { agentArgs: '', agentEnv: { ANTHROPIC_MODEL: 'old' } }
    expect(
      resolveResumeAgentLaunchEnv({
        agent: 'claude',
        launchConfig,
        claudeVariant: mark,
        settings: { claudeOllamaVariants: [kimi] }
      })
    ).toEqual({ ok: true, env: { ANTHROPIC_MODEL: 'old' } })
  })

  it('re-resolves the variant when nothing was captured', () => {
    const result = resolveResumeAgentLaunchEnv({
      agent: 'claude',
      launchConfig: undefined,
      claudeVariant: mark,
      settings: { claudeOllamaVariants: [kimi] }
    })
    expect(result).toMatchObject({ ok: true, env: { ANTHROPIC_MODEL: 'kimi-k3.1-pro:cloud[1m]' } })
  })

  it('fails instead of falling back to plain Claude when the variant is gone', () => {
    expect(
      resolveResumeAgentLaunchEnv({
        agent: 'claude',
        launchConfig: undefined,
        claudeVariant: mark,
        settings: { claudeOllamaVariants: [] }
      })
    ).toEqual({ ok: false })
  })

  it('uses the configured env for unmarked sessions', () => {
    expect(
      resolveResumeAgentLaunchEnv({
        agent: 'codex',
        launchConfig: undefined,
        claudeVariant: undefined,
        settings: { agentDefaultEnv: { codex: { A: '1' } } }
      })
    ).toEqual({ ok: true, env: { A: '1' } })
  })
})

describe('validateClaudeOllamaVariantDraft', () => {
  it.each(['kimi[1m]', 'deep seek', '"x"', ''])('rejects the model %j', (model) => {
    expect(validateClaudeOllamaVariantDraft({ label: 'X', model })).toEqual({
      ok: false,
      field: 'model'
    })
  })

  it('rejects an empty or too long label', () => {
    expect(validateClaudeOllamaVariantDraft({ label: '  ', model: 'm' })).toEqual({
      ok: false,
      field: 'label'
    })
    expect(validateClaudeOllamaVariantDraft({ label: 'x'.repeat(41), model: 'm' })).toEqual({
      ok: false,
      field: 'label'
    })
  })

  it('accepts namespaced cloud models', () => {
    expect(
      validateClaudeOllamaVariantDraft({
        label: 'DS',
        model: 'library/deepseek-v4.1-flash:cloud'
      })
    ).toEqual({ ok: true })
  })
})

describe('normalizeClaudeOllamaVariants', () => {
  it('normalizes stored variants', () => {
    const stored = [
      kimi,
      { ...kimi },
      { id: 'v2', label: '', model: 'm', context1m: false },
      'junk',
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `n${i}`,
        label: `N${i}`,
        model: 'm',
        context1m: false
      }))
    ]
    const result = normalizeClaudeOllamaVariants(stored)
    expect(result[0]).toEqual(kimi)
    expect(result.filter((v) => v.id === 'v1')).toHaveLength(1)
    expect(result.some((v) => v.id === 'v2')).toBe(false)
    expect(result).toHaveLength(20)
    expect(normalizeClaudeOllamaVariants(null)).toEqual([])
  })

  it('stores the label trimmed, reads a missing context1m as off and drops empty ids', () => {
    expect(
      normalizeClaudeOllamaVariants([
        { id: 'a', label: '  Kimi  ', model: 'kimi:cloud' },
        { id: '  ', label: 'No id', model: 'm' },
        { label: 'Missing id', model: 'm' }
      ])
    ).toEqual([{ id: 'a', label: 'Kimi', model: 'kimi:cloud', context1m: false }])
  })
})

describe('withoutClaudeVariantModelOption', () => {
  it('drops the session model so --model cannot override the variant env', () => {
    expect(withoutClaudeVariantModelOption({ model: 'opus', effort: 'high' })).toEqual({
      effort: 'high'
    })
    expect(withoutClaudeVariantModelOption(undefined)).toBeUndefined()
  })
})
