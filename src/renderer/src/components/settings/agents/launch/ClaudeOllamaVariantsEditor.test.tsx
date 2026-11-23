// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_CLAUDE_OLLAMA_VARIANTS,
  type ClaudeOllamaVariant
} from '../../../../../../shared/claude-ollama-variants'
import { createGlobalSettingsFixture } from '../../../../../../shared/settings/global-settings-test-fixture'
import {
  ClaudeOllamaVariantsEditor,
  claudeOllamaVariantsRowSettings
} from './ClaudeOllamaVariantsEditor'

const KIMI: ClaudeOllamaVariant = {
  id: 'variant-kimi',
  label: 'Kimi K3.1',
  model: 'kimi-k3.1-pro:cloud',
  context1m: true
}
const DEEPSEEK: ClaudeOllamaVariant = {
  id: 'variant-deepseek',
  label: 'DeepSeek Flash',
  model: 'deepseek-v4.1-flash:cloud',
  context1m: false
}

afterEach(() => cleanup())

function renderEditor(variants: readonly ClaudeOllamaVariant[]): {
  onSave: ReturnType<typeof vi.fn<(next: ClaudeOllamaVariant[]) => void>>
} {
  const onSave = vi.fn<(next: ClaudeOllamaVariant[]) => void>()
  render(<ClaudeOllamaVariantsEditor variants={variants} onSave={onSave} />)
  return { onSave }
}

function fillField(name: string, value: string): void {
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
}

describe('ClaudeOllamaVariantsEditor', () => {
  it('lists each variant with its model and a 1M badge only when enabled', () => {
    renderEditor([KIMI, DEEPSEEK])

    expect(screen.getByText('Ollama models')).toBeTruthy()
    expect(screen.getByText('Kimi K3.1')).toBeTruthy()
    expect(screen.getByText('deepseek-v4.1-flash:cloud')).toBeTruthy()
    expect(screen.getAllByText('1M')).toHaveLength(1)
  })

  it('adds a variant with a generated id and the entered values', () => {
    const { onSave } = renderEditor([DEEPSEEK])

    fireEvent.click(screen.getByRole('button', { name: 'Add model' }))
    fillField('Display name', 'Kimi K3.1')
    fillField('Ollama model', 'kimi-k3.1-pro:cloud')
    fireEvent.click(screen.getByRole('checkbox', { name: '1M context' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved).toHaveLength(2)
    expect(saved[0]).toEqual(DEEPSEEK)
    expect(saved[1].id).not.toBe('')
    expect(saved[1].id).not.toBe(DEEPSEEK.id)
    expect(saved[1]).toMatchObject({
      label: 'Kimi K3.1',
      model: 'kimi-k3.1-pro:cloud',
      context1m: true
    })
  })

  it('trims the name and model before saving', () => {
    const { onSave } = renderEditor([])

    fireEvent.click(screen.getByRole('button', { name: 'Add model' }))
    fillField('Display name', '  Kimi K3.1  ')
    fillField('Ollama model', ' kimi-k3.1-pro:cloud ')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onSave.mock.calls[0][0][0]).toMatchObject({
      label: 'Kimi K3.1',
      model: 'kimi-k3.1-pro:cloud',
      context1m: false
    })
  })

  it('flags a model with a size suffix and does not save', () => {
    const { onSave } = renderEditor([])

    fireEvent.click(screen.getByRole('button', { name: 'Add model' }))
    fillField('Display name', 'Kimi')
    fillField('Ollama model', 'kimi[1m]')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByLabelText('Ollama model').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Display name').getAttribute('aria-invalid')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('letters, numbers')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('flags an empty name and does not save', () => {
    const { onSave } = renderEditor([])

    fireEvent.click(screen.getByRole('button', { name: 'Add model' }))
    fillField('Ollama model', 'kimi-k3.1-pro:cloud')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByLabelText('Display name').getAttribute('aria-invalid')).toBe('true')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('clears the error once the field is edited', () => {
    renderEditor([])

    fireEvent.click(screen.getByRole('button', { name: 'Add model' }))
    fillField('Display name', 'Kimi')
    fillField('Ollama model', 'kimi[1m]')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fillField('Ollama model', 'kimi')

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Ollama model').getAttribute('aria-invalid')).toBeNull()
  })

  it('edits a variant in place and keeps its id', () => {
    const { onSave } = renderEditor([KIMI, DEEPSEEK])

    fireEvent.click(screen.getByRole('button', { name: 'Edit Kimi K3.1' }))
    expect(screen.getByLabelText<HTMLInputElement>('Ollama model').value).toBe(KIMI.model)
    fillField('Display name', 'Kimi K3.2')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith([{ ...KIMI, label: 'Kimi K3.2' }, DEEPSEEK])
  })

  it('discards a draft on cancel', () => {
    const { onSave } = renderEditor([KIMI])

    fireEvent.click(screen.getByRole('button', { name: 'Edit Kimi K3.1' }))
    fillField('Display name', 'Changed')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Kimi K3.1')).toBeTruthy()
    expect(screen.queryByLabelText('Display name')).toBeNull()
  })

  it('closes the form on Escape without letting the Settings page close', () => {
    const { onSave } = renderEditor([])

    fireEvent.click(screen.getByRole('button', { name: 'Add model' }))
    const stillDispatching = fireEvent.keyDown(screen.getByLabelText('Display name'), {
      key: 'Escape'
    })

    expect(stillDispatching).toBe(false)
    expect(screen.queryByLabelText('Display name')).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('keeps the form open on an Escape that ends IME composition', () => {
    renderEditor([])

    fireEvent.click(screen.getByRole('button', { name: 'Add model' }))
    const stillDispatching = fireEvent.keyDown(screen.getByLabelText('Display name'), {
      key: 'Escape',
      isComposing: true
    })

    expect(stillDispatching).toBe(true)
    expect(screen.getByLabelText('Display name')).toBeTruthy()
  })

  it('removes a variant', () => {
    const { onSave } = renderEditor([KIMI, DEEPSEEK])

    fireEvent.click(screen.getByRole('button', { name: 'Remove Kimi K3.1' }))

    expect(onSave).toHaveBeenCalledWith([DEEPSEEK])
  })

  it('disables adding at the variant limit', () => {
    const variants = Array.from({ length: MAX_CLAUDE_OLLAMA_VARIANTS }, (_, index) => ({
      id: `variant-${index}`,
      label: `Model ${index}`,
      model: `model-${index}:cloud`,
      context1m: false
    }))
    renderEditor(variants)

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add model' }).disabled).toBe(true)
  })
})

describe('claudeOllamaVariantsRowSettings', () => {
  const local = {
    settings: createGlobalSettingsFixture({ claudeOllamaVariants: [KIMI] }),
    updateSettings: vi.fn()
  }

  it('shows the Ollama models editor on the Claude row only', () => {
    expect(claudeOllamaVariantsRowSettings('codex', local)).toBeUndefined()
    render(<>{claudeOllamaVariantsRowSettings('claude', local)}</>)

    expect(screen.getByText('Kimi K3.1')).toBeTruthy()
    expect(screen.getByText('kimi-k3.1-pro:cloud')).toBeTruthy()
  })

  it("leaves a paired host's settings page without the editor, since variants never launch there", () => {
    expect(claudeOllamaVariantsRowSettings('claude', undefined)).toBeUndefined()
  })

  it('hides the editor in paired web clients', () => {
    Reflect.set(globalThis, '__ORCA_WEB_CLIENT__', true)
    try {
      expect(claudeOllamaVariantsRowSettings('claude', local)).toBeUndefined()
    } finally {
      Reflect.deleteProperty(globalThis, '__ORCA_WEB_CLIENT__')
    }
  })

  it('saves edits to the local settings', () => {
    render(<>{claudeOllamaVariantsRowSettings('claude', local)}</>)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Kimi K3.1' }))

    expect(local.updateSettings).toHaveBeenCalledWith({ claudeOllamaVariants: [] })
  })
})
