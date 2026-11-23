import { useId, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  MAX_CLAUDE_OLLAMA_VARIANT_LABEL_LENGTH,
  MAX_CLAUDE_OLLAMA_VARIANTS,
  validateClaudeOllamaVariantDraft,
  type ClaudeOllamaVariant
} from '../../../../../../shared/claude-ollama-variants'
import { createNonSecureContextUuid as createBrowserUuid } from '../../../../../../shared/identifiers/non-secure-context-uuid'
import type { TuiAgent } from '../../../../../../shared/agent-launch/catalog/tui-agent'
import type { GlobalSettings } from '../../../../../../shared/settings/global-settings-types'
import { translate } from '@/i18n/i18n'
import { isPairedWebClientWindow } from '@/app-shell/chrome/desktop-window-chrome'
import { Button } from '../../../ui/button'
import { Checkbox } from '../../../ui/checkbox'
import { Input } from '../../../ui/input'
import { SettingsBadge } from '../../form-controls/SettingsFormControls'

type VariantDraft = Pick<ClaudeOllamaVariant, 'label' | 'model' | 'context1m'>
type FormTarget = { kind: 'add' } | { kind: 'edit'; id: string }

const EMPTY_DRAFT: VariantDraft = { label: '', model: '', context1m: false }

function VariantForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel
}: {
  initial: VariantDraft
  submitLabel: string
  onSubmit: (draft: VariantDraft) => void
  onCancel: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(initial)
  const [errorField, setErrorField] = useState<'label' | 'model' | null>(null)
  const errorId = useId()

  const setField = (field: 'label' | 'model', value: string): void => {
    setDraft((previous) => ({ ...previous, [field]: value }))
    setErrorField((previous) => (previous === field ? null : previous))
  }

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmed = { ...draft, label: draft.label.trim(), model: draft.model.trim() }
    const result = validateClaudeOllamaVariantDraft(trimmed)
    if (!result.ok) {
      setErrorField(result.field)
      return
    }
    onSubmit(trimmed)
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
          // Why: the Settings page closes on any Escape that is not defaultPrevented.
          event.preventDefault()
          onCancel()
        }
      }}
      className="flex flex-col gap-1"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          value={draft.label}
          onChange={(event) => setField('label', event.target.value)}
          aria-label={translate(
            'auto.components.settings.ClaudeOllamaVariantsEditor.a231f363d5',
            'Display name'
          )}
          placeholder={translate(
            'auto.components.settings.ClaudeOllamaVariantsEditor.a231f363d5',
            'Display name'
          )}
          maxLength={MAX_CLAUDE_OLLAMA_VARIANT_LABEL_LENGTH}
          spellCheck={false}
          aria-invalid={errorField === 'label' || undefined}
          aria-describedby={errorField === 'label' ? errorId : undefined}
          className="h-7 min-w-32 flex-1"
        />
        <Input
          value={draft.model}
          onChange={(event) => setField('model', event.target.value)}
          aria-label={translate(
            'auto.components.settings.ClaudeOllamaVariantsEditor.c8f19ed8f9',
            'Ollama model'
          )}
          placeholder={translate(
            'auto.components.settings.ClaudeOllamaVariantsEditor.0af27f2238',
            'Model, e.g. kimi-k3.1-pro:cloud'
          )}
          spellCheck={false}
          aria-invalid={errorField === 'model' || undefined}
          aria-describedby={errorField === 'model' ? errorId : undefined}
          className="h-7 min-w-40 flex-[2]"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={draft.context1m}
            onCheckedChange={(checked) =>
              setDraft((previous) => ({ ...previous, context1m: checked === true }))
            }
          />
          <span>
            {translate(
              'auto.components.settings.ClaudeOllamaVariantsEditor.909f304941',
              '1M context'
            )}
          </span>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
            {translate('auto.components.settings.ClaudeOllamaVariantsEditor.eb0c182878', 'Cancel')}
          </Button>
          <Button type="submit" size="xs">
            {submitLabel}
          </Button>
        </div>
      </div>
      {errorField && (
        <p id={errorId} role="alert" className="mt-1 text-[11px] text-destructive">
          {errorField === 'label'
            ? translate(
                'auto.components.settings.ClaudeOllamaVariantsEditor.9525f2fb3c',
                'Enter a name of up to {{value0}} characters.',
                { value0: MAX_CLAUDE_OLLAMA_VARIANT_LABEL_LENGTH }
              )
            : translate(
                'auto.components.settings.ClaudeOllamaVariantsEditor.ee74d24363',
                'Model names can use letters, numbers and . _ : / - only. Use the 1M context option instead of a [1m] suffix.'
              )}
        </p>
      )}
    </form>
  )
}

export function ClaudeOllamaVariantsEditor({
  variants,
  onSave
}: {
  variants: readonly ClaudeOllamaVariant[]
  onSave: (next: ClaudeOllamaVariant[]) => void
}): React.JSX.Element {
  const [target, setTarget] = useState<FormTarget | null>(null)
  const atLimit = variants.length >= MAX_CLAUDE_OLLAMA_VARIANTS

  const closeForm = (): void => setTarget(null)

  const saveDraft = (draft: VariantDraft): void => {
    if (target?.kind === 'edit') {
      onSave(
        variants.map((variant) => (variant.id === target.id ? { ...variant, ...draft } : variant))
      )
    } else {
      onSave([...variants, { id: createBrowserUuid(), ...draft }])
    }
    closeForm()
  }

  const removeVariant = (id: string): void => {
    onSave(variants.filter((variant) => variant.id !== id))
    if (target?.kind === 'edit' && target.id === id) {
      closeForm()
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">
        {translate(
          'auto.components.settings.ClaudeOllamaVariantsEditor.1a8abee981',
          'Ollama models'
        )}
      </span>
      {variants.map((variant) =>
        target?.kind === 'edit' && target.id === variant.id ? (
          <VariantForm
            key={variant.id}
            initial={{ label: variant.label, model: variant.model, context1m: variant.context1m }}
            submitLabel={translate(
              'auto.components.settings.ClaudeOllamaVariantsEditor.99d3745609',
              'Save'
            )}
            onSubmit={saveDraft}
            onCancel={closeForm}
          />
        ) : (
          <div
            key={variant.id}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_1.75rem_auto] items-center gap-2"
          >
            <span className="truncate text-xs" title={variant.label}>
              {variant.label}
            </span>
            <span
              className="truncate font-mono text-[11px] text-muted-foreground"
              title={variant.model}
            >
              {variant.model}
            </span>
            <div className="flex justify-start">
              {variant.context1m && (
                <SettingsBadge tone="muted">
                  {translate(
                    'auto.components.settings.ClaudeOllamaVariantsEditor.13e74aa469',
                    '1M'
                  )}
                </SettingsBadge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setTarget({ kind: 'edit', id: variant.id })}
                aria-label={translate(
                  'auto.components.settings.ClaudeOllamaVariantsEditor.279c73205a',
                  'Edit {{value0}}',
                  { value0: variant.label }
                )}
              >
                {translate(
                  'auto.components.settings.ClaudeOllamaVariantsEditor.73472592b7',
                  'Edit'
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => removeVariant(variant.id)}
                aria-label={translate(
                  'auto.components.settings.ClaudeOllamaVariantsEditor.12b176e09f',
                  'Remove {{value0}}',
                  { value0: variant.label }
                )}
              >
                {translate(
                  'auto.components.settings.ClaudeOllamaVariantsEditor.80ab74a996',
                  'Remove'
                )}
              </Button>
            </div>
          </div>
        )
      )}
      {target?.kind === 'add' && (
        <VariantForm
          initial={EMPTY_DRAFT}
          submitLabel={translate(
            'auto.components.settings.ClaudeOllamaVariantsEditor.b66e2c5492',
            'Add'
          )}
          onSubmit={saveDraft}
          onCancel={closeForm}
        />
      )}
      {target === null && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={atLimit}
            onClick={() => setTarget({ kind: 'add' })}
          >
            <Plus />
            {translate(
              'auto.components.settings.ClaudeOllamaVariantsEditor.9c6d332f87',
              'Add model'
            )}
          </Button>
          {atLimit && (
            <span className="text-[11px] text-muted-foreground">
              {translate(
                'auto.components.settings.ClaudeOllamaVariantsEditor.e0e4b16afa',
                'Limit of {{value0}} models reached.',
                { value0: MAX_CLAUDE_OLLAMA_VARIANTS }
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** The Claude row's Ollama models; local settings only, because a paired host never launches a variant. */
export function claudeOllamaVariantsRowSettings(
  agent: TuiAgent,
  local:
    | {
        settings: GlobalSettings
        updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
      }
    | undefined
): React.ReactNode {
  if (agent !== 'claude' || !local || isPairedWebClientWindow()) {
    return undefined
  }
  return (
    <ClaudeOllamaVariantsEditor
      variants={local.settings.claudeOllamaVariants ?? []}
      onSave={(next) => void local.updateSettings({ claudeOllamaVariants: next })}
    />
  )
}
