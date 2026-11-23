import { describe, expect, it } from 'vitest'
import type { GlobalSettings } from '../../../../../shared/settings/global-settings-types'
import { buildQuickComposerStartup, type QuickComposerStartupInput } from './quick-startup-plan'

const kimi = { id: 'v1', label: 'Kimi', model: 'kimi-k2:cloud', context1m: false }

function settings(): GlobalSettings {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the startup builder reads only the fields set here.
  return {
    agentCmdOverrides: {},
    agentDefaultArgs: {},
    agentDefaultEnv: { claude: { FOO: 'bar' } },
    agentLaunchChoices: { claude: { model: 'opus' } },
    claudeOllamaVariants: [kimi]
  } as unknown as GlobalSettings
}

function input(overrides: Partial<QuickComposerStartupInput> = {}): QuickComposerStartupInput {
  return {
    agent: 'claude',
    prompt: '',
    draftPrompt: null,
    settings: settings(),
    launchHost: { kind: 'known', platform: 'linux', hostKind: 'local' },
    shell: null,
    isRemote: false,
    telemetrySource: undefined,
    ...overrides
  }
}

describe('buildQuickComposerStartup with an Ollama Claude variant', () => {
  it('launches the variant with the Ollama env over the base env and no --model', () => {
    const startup = buildQuickComposerStartup(input({ claudeVariant: kimi }))

    expect(startup.startupPlan?.env).toMatchObject({
      FOO: 'bar',
      ANTHROPIC_BASE_URL: 'http://localhost:11434',
      ANTHROPIC_MODEL: 'kimi-k2:cloud'
    })
    expect(startup.startupPlan?.launchCommand).not.toMatch(/--model/)
    // Why: the backend spawns its own tab, which cannot carry the variant mark.
    expect(startup.backendStartup).toBeUndefined()
  })

  it('keeps plain Claude on Anthropic', () => {
    const startup = buildQuickComposerStartup(input())

    expect(startup.startupPlan?.env?.ANTHROPIC_BASE_URL).toBeUndefined()
    expect(startup.startupPlan?.launchCommand).toMatch(/--model/)
    expect(startup.backendStartup?.env?.ANTHROPIC_BASE_URL).toBeUndefined()
  })
})
