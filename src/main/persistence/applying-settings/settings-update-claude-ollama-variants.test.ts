import { describe, expect, it, vi } from 'vitest'
import type { PersistedState } from '../../../shared/orca-profiles/persisted-state-types'
import { MAX_CLAUDE_OLLAMA_VARIANTS } from '../../../shared/claude-ollama-variants'
import { updateSettings, type SettingsMutationOperations } from './settings-update'

function makeOperations(): SettingsMutationOperations {
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the fields updateSettings reads for this setting.
    state: { settings: {}, repos: [] } as unknown as PersistedState,
    bumpLocalWorktreeScanGeneration: vi.fn(),
    removeRetainedBlob: vi.fn(),
    scheduleSave: vi.fn(),
    notifySettingsChanged: vi.fn()
  }
}

const kimi = { id: 'v1', label: 'Kimi K3.1', model: 'kimi-k3.1-pro:cloud', context1m: true }

describe('updateSettings claudeOllamaVariants', () => {
  it('stores the normalized list, dropping invalid rows and repeated ids', () => {
    const operations = makeOperations()

    const settings = updateSettings(operations, {
      claudeOllamaVariants: [
        { ...kimi, label: '  Kimi K3.1  ' },
        { ...kimi },
        { id: 'v2', label: 'Bad model', model: 'kimi[1m]', context1m: false }
      ]
    })

    expect(settings.claudeOllamaVariants).toEqual([kimi])
  })

  it('keeps the list within the cap and coerces a non-array write to an empty list', () => {
    const operations = makeOperations()
    const many = Array.from({ length: MAX_CLAUDE_OLLAMA_VARIANTS + 5 }, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
      model: 'm',
      context1m: false
    }))

    expect(
      updateSettings(operations, { claudeOllamaVariants: many }).claudeOllamaVariants
    ).toHaveLength(MAX_CLAUDE_OLLAMA_VARIANTS)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a hand-built client can send any JSON; the boundary must coerce it.
    const malformed = 'junk' as unknown as typeof many
    expect(
      updateSettings(operations, { claudeOllamaVariants: malformed }).claudeOllamaVariants
    ).toEqual([])
  })

  it('leaves the stored list alone when the write does not mention it', () => {
    const operations = makeOperations()
    updateSettings(operations, { claudeOllamaVariants: [kimi] })

    expect(updateSettings(operations, { machineName: 'desk' }).claudeOllamaVariants).toEqual([kimi])
  })
})
