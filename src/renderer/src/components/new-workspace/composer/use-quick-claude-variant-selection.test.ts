// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ClaudeOllamaVariant } from '../../../../../shared/claude-ollama-variants'
import type { TuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent'
import { useQuickClaudeVariantSelection } from './use-quick-claude-variant-selection'

const kimi: ClaudeOllamaVariant = { id: 'v1', label: 'Kimi', model: 'kimi-k2', context1m: false }

type Props = { quickAgent: TuiAgent | null; variants: readonly ClaudeOllamaVariant[] }

function renderSelection(initial: Props) {
  return renderHook((props: Props) => useQuickClaudeVariantSelection(props), {
    initialProps: initial
  })
}

describe('useQuickClaudeVariantSelection', () => {
  it('reports a picked variant while Claude is picked and the variant is offered', () => {
    const hook = renderSelection({ quickAgent: 'claude', variants: [kimi] })

    act(() => hook.result.current.selectClaudeVariant('v1'))

    expect(hook.result.current.claudeVariantId).toBe('v1')
  })

  it('does not bring a variant back after an agent repair moved off Claude', () => {
    const hook = renderSelection({ quickAgent: 'claude', variants: [kimi] })
    act(() => hook.result.current.selectClaudeVariant('v1'))

    hook.rerender({ quickAgent: 'codex', variants: [kimi] })
    expect(hook.result.current.claudeVariantId).toBeNull()
    hook.rerender({ quickAgent: 'claude', variants: [kimi] })

    expect(hook.result.current.claudeVariantId).toBeNull()
  })

  it('does not bring a variant back after the target stopped offering it', () => {
    const hook = renderSelection({ quickAgent: 'claude', variants: [kimi] })
    act(() => hook.result.current.selectClaudeVariant('v1'))

    hook.rerender({ quickAgent: 'claude', variants: [] })
    expect(hook.result.current.claudeVariantId).toBeNull()
    hook.rerender({ quickAgent: 'claude', variants: [kimi] })

    expect(hook.result.current.claudeVariantId).toBeNull()
  })

  it('drops the variant on an explicit agent pick', () => {
    const hook = renderSelection({ quickAgent: 'claude', variants: [kimi] })
    act(() => hook.result.current.selectClaudeVariant('v1'))

    act(() => hook.result.current.clearClaudeVariant())

    expect(hook.result.current.claudeVariantId).toBeNull()
  })
})
