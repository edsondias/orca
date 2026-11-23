// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentLaunchPicker } from '@/components/agent/AgentLaunchPicker'
import { getAgentCatalog } from '@/lib/agent-catalog/agent-catalog'
import { TooltipProvider } from '@/components/ui/tooltip'

const picker = vi.hoisted(() => ({ props: undefined as unknown }))

vi.mock('@/components/agent/AgentLaunchPicker', () => ({
  AgentLaunchPicker: (props: unknown) => {
    picker.props = props
    return null
  }
}))

import { NewWorkspaceComposerAgentSection } from './NewWorkspaceComposerAgentSection'

type PickerProps = ComponentProps<typeof AgentLaunchPicker>

const kimi = { id: 'v1', label: 'Kimi Cloud', model: 'kimi-k2:cloud', context1m: false }
const qwen = { id: 'v2', label: 'Qwen Local', model: 'qwen3-coder', context1m: false }

afterEach(cleanup)

function renderSection(
  overrides: Partial<ComponentProps<typeof NewWorkspaceComposerAgentSection>> = {}
): PickerProps {
  render(
    <TooltipProvider>
      <NewWorkspaceComposerAgentSection
        quickAgent="codex"
        onQuickAgentChange={vi.fn()}
        claudeVariants={[kimi, qwen]}
        quickClaudeVariantId={null}
        onQuickClaudeVariantChange={vi.fn()}
        onOpenAgentSettings={vi.fn()}
        createDisabled={false}
        onCreate={vi.fn()}
        advancedOpen={false}
        onToggleAdvanced={vi.fn()}
        visibleQuickAgents={getAgentCatalog()}
        defaultTuiAgent={null}
        handleSetDefaultAgent={vi.fn()}
        {...overrides}
      />
    </TooltipProvider>
  )
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the mock above records the props the section rendered the picker with.
  return picker.props as PickerProps
}

describe('NewWorkspaceComposerAgentSection Ollama Claude variants', () => {
  it('offers each variant as a picker choice that reports its id', () => {
    const onQuickAgentChange = vi.fn()
    const onQuickClaudeVariantChange = vi.fn()
    const props = renderSection({ onQuickAgentChange, onQuickClaudeVariantChange })

    expect(props.choices?.map((choice) => choice.label)).toEqual(['Kimi Cloud', 'Qwen Local'])
    props.choices?.[1]?.onSelect()
    expect(onQuickAgentChange).toHaveBeenCalledWith('claude')
    expect(onQuickClaudeVariantChange).toHaveBeenCalledWith('v2')
  })

  it.each([
    ['label', 'Qwen Loc'],
    ['model', 'qwen3-coder']
  ])('lets a search find a variant by its %s', (_field, query) => {
    const props = renderSection()

    expect(props.choices?.filter((choice) => choice.matches?.(query)).map((c) => c.label)).toEqual([
      'Qwen Local'
    ])
  })

  it('shows a picked variant as the selection instead of plain Claude', () => {
    expect(renderSection({ quickAgent: 'claude', quickClaudeVariantId: 'v1' }).triggerLabel).toBe(
      'Kimi Cloud'
    )
    expect(renderSection({ quickAgent: 'codex', quickClaudeVariantId: 'v1' }).triggerLabel).toBe(
      undefined
    )
  })

  it('offers no variant where Claude is not offered', () => {
    const props = renderSection({
      visibleQuickAgents: getAgentCatalog().filter((agent) => agent.id !== 'claude')
    })

    expect(props.choices).toBeUndefined()
  })
})
