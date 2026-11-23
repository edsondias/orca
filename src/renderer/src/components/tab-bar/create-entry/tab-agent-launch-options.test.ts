import { describe, expect, it } from 'vitest'
import type { ClaudeOllamaVariant } from '../../../../../shared/claude-ollama-variants'
import type { AgentPickerEntry } from '../../../../../shared/agent-launch/picker/agent-launch-picker'
import {
  buildAgentPickerLaunchOptions,
  findMatchingTabAgentLaunchOptions
} from './tab-agent-launch-options'

const kimi: ClaudeOllamaVariant = {
  id: 'v1',
  label: 'Kimi K3.1',
  model: 'kimi-k3.1-pro',
  context1m: false
}

function pickerEntry(
  agent: AgentPickerEntry['agent'],
  label: string,
  surfaces: AgentPickerEntry['surfaces'] = ['chat', 'terminal']
): AgentPickerEntry {
  return {
    agent,
    label,
    rows: [{ agent, kind: 'cli', executionHostId: 'local' }],
    surfaces,
    defaultSurface: 'terminal',
    terminal: {},
    structured: {},
    catalog: { origin: 'unknown' }
  }
}

const claude = pickerEntry('claude', 'Claude')
const codex = pickerEntry('codex', 'Codex')

describe('Claude variant launch options', () => {
  it('lists each variant right after Claude, launching through Claude’s CLI', () => {
    const options = buildAgentPickerLaunchOptions([claude, codex], {}, undefined, [kimi])

    expect(options.map((o) => [o.agent, o.label, o.claudeVariantId])).toEqual([
      ['claude', 'Claude', undefined],
      ['claude', 'Kimi K3.1', 'v1'],
      ['codex', 'Codex', undefined]
    ])
    expect(options[1]).toMatchObject({
      id: 'agent:claude:v1',
      row: { kind: 'cli', agent: 'claude', executionHostId: 'local' }
    })
  })

  it('hides variants when Claude is not offered or cannot open a terminal', () => {
    const variantsOf = (entries: AgentPickerEntry[]) =>
      buildAgentPickerLaunchOptions(entries, {}, undefined, [kimi]).filter((o) => o.claudeVariantId)

    expect(variantsOf([codex])).toEqual([])
    expect(variantsOf([pickerEntry('claude', 'Claude', ['chat'])])).toEqual([])
  })

  it('matches a variant by label and by model, never on the Claude aliases', () => {
    const options = buildAgentPickerLaunchOptions([claude], {}, undefined, [kimi])

    expect(findMatchingTabAgentLaunchOptions('kimi', options)[0]?.claudeVariantId).toBe('v1')
    expect(findMatchingTabAgentLaunchOptions('k3.1-pro', options)[0]?.claudeVariantId).toBe('v1')
    expect(
      findMatchingTabAgentLaunchOptions('claude', options).map((o) => o.claudeVariantId)
    ).toEqual([undefined])
  })
})
