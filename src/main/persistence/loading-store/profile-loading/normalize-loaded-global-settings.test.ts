import { homedir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { getDefaultPersistedState } from '../../../../shared/orca-profiles/constants'
import type { PersistedState } from '../../../../shared/orca-profiles/persisted-state-types'
import { normalizeLoadedGlobalSettings } from './normalize-loaded-global-settings'
import { prepareLoadedProfileSettings } from './prepare-loaded-profile-settings'
import { prepareLoadedTerminalSettings } from './prepare-loaded-terminal-settings'

function loadSettings(overrides: Record<string, unknown>): PersistedState['settings'] {
  const defaults = getDefaultPersistedState(homedir())
  const parsed: PersistedState = { ...defaults, settings: { ...defaults.settings, ...overrides } }
  const noop = (): void => {}
  const terminal = prepareLoadedTerminalSettings(parsed, noop)
  const profile = prepareLoadedProfileSettings(parsed, defaults, noop)
  return normalizeLoadedGlobalSettings(parsed, terminal, profile)
}

describe('Claude Ollama variants setting', () => {
  const kimi = { id: 'v1', label: 'Kimi K3.1', model: 'kimi-k3.1-pro:cloud', context1m: true }

  it('keeps valid saved variants and drops hand-edited invalid rows', () => {
    const normalized = loadSettings({
      claudeOllamaVariants: [
        kimi,
        { ...kimi },
        { id: 'v2', label: 'Bad model', model: 'kimi[1m]', context1m: false },
        'junk'
      ]
    })
    expect(normalized.claudeOllamaVariants).toEqual([kimi])
  })

  it('degrades a malformed value to an empty list', () => {
    expect(loadSettings({ claudeOllamaVariants: 'kimi' }).claudeOllamaVariants).toEqual([])
  })

  it('leaves the key absent for a profile that never saved variants', () => {
    expect('claudeOllamaVariants' in loadSettings({})).toBe(false)
  })
})
