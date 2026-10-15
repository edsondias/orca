# Editor Excalidraw nativo: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** abrir, desenhar e salvar `*.excalidraw` e `*.excalidraw.json` dentro do Orca, como a extensão `pomdtr.excalidraw-editor` faz no VS Code.

**Arquitetura:** o componente React do `@excalidraw/excalidraw` roda num `ExcalidrawViewer` carregado de forma tardia, no mesmo contrato do `IpynbViewer` (`content`, `onContentChange`, `onDirtyStateHint`, `onSave` e flush pendente).
Leitura, gravação, SSH e alteração externa continuam com a fila de gravação do editor.
A biblioteca de formas é global, guardada pelo main em `userData` por dois canais IPC.

**Tecnologias:** Electron 43, React 19.2, electron-vite 5 com rolldown-vite, Vitest com happy-dom, Playwright para E2E, `@excalidraw/excalidraw` 0.18.1.

**Spec:** [specs/orca-excalidraw-design.md](../orca-excalidraw-design.md). ADR: [docs/adr/0002-editor-excalidraw-nativo.md](../../docs/adr/0002-editor-excalidraw-nativo.md).

## Desvios conscientes do spec

1. O `restore` do pacote é chamado no viewer, e não em `excalidraw-file-parse.ts`.
   Assim o módulo de parse não importa o pacote e roda em teste unitário sem canvas.
2. O Ctrl+S usa `installEditorSaveShortcut` (listener nativo em captura), que já existe em `editor-shortcuts.ts`, no lugar de `onKeyDownCapture`.
   O efeito é o mesmo, e o listener fica antes do handler de teclado que o Excalidraw põe no próprio contêiner.
3. O rascunho é serializado a partir dos argumentos do último `onChange`, e nunca lendo a API do Excalidraw no flush.
   Ao desmontar, o Excalidraw pode limpar a cena antes do flush, e ler a API ali gravaria uma cena vazia.
4. Uma lista vazia vinda do `onLibraryChange` só é gravada se a biblioteca já teve itens nesta sessão.
   Isso impede que uma leitura falha ou um arquivo corrompido seja sobrescrito por uma biblioteca vazia na abertura.

## Restrições globais

- Pacote: `@excalidraw/excalidraw` na versão exata `0.18.1`, com peer `react ^17.0.2 || ^18.2.0 || ^19.0.0`; o Orca usa React `^19.2.8`.
- Escopo de arquivos: só `*.excalidraw` e `*.excalidraw.json`, sem distinção de maiúsculas.
- Modos do seletor: `['source', 'rich']`, com `rich` como padrão; o rótulo de `rich` é "Visual"; não há modo Changes.
- Debounce do rascunho: 400 ms, igual ao notebook.
- Biblioteca: arquivo `excalidraw-library.json` em `app.getPath('userData')`, gravado com `writeFileAtomically`, sempre local mesmo em workspace SSH.
- Tema: `useDocumentDarkTheme()`; o seletor de tema do Excalidraw fica oculto.
- Nada de type assertion fora de `as const`; cast inevitável leva comentário `SAFETY:` na linha (regra do `AGENTS.md`).
- Comentários curtos, de uma linha, explicando o porquê.
- Nunca desabilitar `max-lines`.
- UI segue `docs/STYLEGUIDE.md`: tokens de `main.css` e primitivos de `components/ui/`, sem cores cruas.
- Atalhos passam por `editorShortcutMatches`, que já trata Cmd no macOS e Ctrl no Windows e Linux.
- Textos de interface usam `translate(key, fallback)` com a chave registrada em `src/renderer/src/i18n/locales/en.json`.
- Testes E2E e apps abertos por agente rodam em background com `ORCA_BACKGROUND_LAUNCH=1`, sem focar janela.
- `pnpm install` nesta máquina exige Node 24; com o Node 26 ativo, a dependência entra com `--ignore-scripts`.

## Foco da revisão

1. Fechar a aba ou trocar para Source logo depois de desenhar precisa manter o último traço. Coberto pelo teste de desmonte do hook (Tarefa 4) e pelo E2E da troca para Source (Tarefa 8).
2. Arquivo com BOM UTF-8, comum em editores do Windows, precisa abrir normalmente. Coberto pelo teste de parse (Tarefa 3).
3. JSON que não é cena do Excalidraw (`{}`, uma biblioteca `.excalidrawlib` renomeada, `elements` que não é lista) mostra erro e nunca é sobrescrito. Coberto pelos testes de parse (Tarefa 3), do viewer (Tarefa 6) e pelo E2E (Tarefa 8).
4. Leitura da biblioteca falha ou arquivo corrompido, seguidos do aviso de biblioteca vazia na abertura, não podem apagar a biblioteca. Coberto pelos testes do store (Tarefa 5) e de `shouldPersistLibrary` (Tarefa 6).
5. O `onChange` inicial e as mudanças só de seleção, zoom ou rolagem não marcam a aba como alterada. Coberto pelo teste do viewer (Tarefa 6).

---

### Tarefa 1: dependência do Excalidraw e build do renderer

**Arquivos:**
- Modificar: `package.json` e `pnpm-lock.yaml` (pelo `pnpm add`)

**Interfaces:**
- Produz: o módulo `@excalidraw/excalidraw` (entrada `.`), o CSS `@excalidraw/excalidraw/index.css` e os tipos em `@excalidraw/excalidraw/types`, `@excalidraw/excalidraw/data/types` e `@excalidraw/excalidraw/element/types`.

- [ ] **Passo 1: conferir o Node ativo**

Rode: `node --version`
Se não for `v24.x`, a instalação vai sem scripts no passo seguinte, porque o `postinstall` (`config/scripts/rebuild-native-deps.mjs`) recompila módulos nativos e quebra no Node 26.

- [ ] **Passo 2: adicionar a dependência com versão exata**

Rode na raiz do repositório:

```bash
pnpm add @excalidraw/excalidraw@0.18.1 --save-exact --ignore-scripts
```

Esperado: `package.json` ganha `"@excalidraw/excalidraw": "0.18.1"` em `dependencies`, e `pnpm-lock.yaml` muda.

- [ ] **Passo 3: conferir que os tipos resolvem**

Crie o arquivo temporário `src/renderer/src/components/editor/excalidraw-types-probe.ts`:

```ts
import type { ExcalidrawImperativeAPI, LibraryItems_anyVersion } from '@excalidraw/excalidraw/types'
import type { ImportedDataState } from '@excalidraw/excalidraw/data/types'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'

export type ExcalidrawTypesProbe = [
  ExcalidrawImperativeAPI,
  LibraryItems_anyVersion,
  ImportedDataState,
  OrderedExcalidrawElement
]
```

Rode: `pnpm tc:web`
Esperado: PASS. Se falhar com "Cannot find module", pare e reporte, porque as tarefas seguintes dependem desses caminhos.
Apague o arquivo temporário depois.

- [ ] **Passo 4: conferir que o bundle do renderer compila com o pacote**

Crie temporariamente `src/renderer/src/components/editor/excalidraw-bundle-probe.ts`:

```ts
export const loadExcalidrawProbe = () => import('@excalidraw/excalidraw')
```

e importe-o numa linha qualquer de `editor-lazy-views.ts` (`export { loadExcalidrawProbe } from './excalidraw-bundle-probe'`).
Rode: `pnpm exec electron-vite build`
Esperado: build concluído sem erro de resolução, com um chunk novo do Excalidraw.
Desfaça a linha em `editor-lazy-views.ts` e apague o arquivo temporário.

- [ ] **Passo 5: commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(editor): add @excalidraw/excalidraw 0.18.1 for the native Excalidraw editor"
```

---

### Tarefa 2: reconhecer arquivos Excalidraw e oferecer o seletor Source / Visual

**Arquivos:**
- Modificar: `src/renderer/src/lib/language-detect.ts`
- Modificar: `src/renderer/src/components/editor/markdown-preview-controls.ts`
- Modificar: `src/renderer/src/components/editor/editor-panel-render-model.ts:182-185`
- Modificar: `src/renderer/src/components/editor/EditorViewToggle.tsx:81-88`
- Modificar: `src/renderer/src/components/editor/EditorPanelHeader.tsx:31,66,280`
- Modificar: `src/renderer/src/components/editor/EditorPanelShell.tsx:109`
- Modificar: `src/renderer/src/components/editor/EditorContent.tsx:113`
- Modificar: `src/renderer/src/components/editor/EditorConflictReviewSurface.tsx:166`
- Modificar: `src/renderer/src/i18n/locales/en.json`
- Testes: `src/renderer/src/lib/language-detect.test.ts`, `src/renderer/src/components/editor/markdown-preview-controls.test.ts`, `src/renderer/src/components/editor/editor-panel-render-model.test.ts`, `src/renderer/src/components/editor/EditorPanelHeader.test.tsx`

**Interfaces:**
- Produz: `detectLanguage(path)` devolve `'excalidraw'` para os dois sufixos.
- Produz: `toMonacoLanguage(language: string): string` em `language-detect.ts`, que devolve `'json'` para `'notebook'` e `'excalidraw'`.
- Produz: o campo `isExcalidraw: boolean` no retorno de `getEditorPanelRenderModel`.
- Produz: `EXCALIDRAW_VIEW_MODE_METADATA` exportado de `EditorViewToggle.tsx`.

- [ ] **Passo 1: escrever os testes de detecção que falham**

Acrescente em `src/renderer/src/lib/language-detect.test.ts`, dentro do `describe('detectLanguage')`, e importe `toMonacoLanguage` junto com `detectLanguage`:

```ts
  it('maps Excalidraw scene files to the excalidraw language id', () => {
    expect(detectLanguage('docs/architecture.excalidraw')).toBe('excalidraw')
    expect(detectLanguage('C:\\docs\\ARCHITECTURE.EXCALIDRAW')).toBe('excalidraw')
    expect(detectLanguage('docs/architecture.excalidraw.json')).toBe('excalidraw')
    expect(detectLanguage('docs/Architecture.Excalidraw.JSON')).toBe('excalidraw')
    expect(detectLanguage('docs/package.json')).toBe('json')
  })

  it('shows notebook and Excalidraw sources as JSON in Monaco', () => {
    expect(toMonacoLanguage('notebook')).toBe('json')
    expect(toMonacoLanguage('excalidraw')).toBe('json')
    expect(toMonacoLanguage('typescript')).toBe('typescript')
  })
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `pnpm test src/renderer/src/lib/language-detect.test.ts`
Esperado: FAIL, com `toMonacoLanguage` inexistente e `'json'` no lugar de `'excalidraw'`.

- [ ] **Passo 3: implementar a detecção**

Em `src/renderer/src/lib/language-detect.ts`, acrescente a entrada logo abaixo de `'.ipynb': 'notebook',`:

```ts
  '.excalidraw': 'excalidraw',
```

Em `detectLanguage`, logo depois do bloco que testa `FILENAME_LOWER_TO_LANGUAGE`, antes de `// Check extension`:

```ts
  // Why: the compound name's last extension alone would read as plain JSON.
  if (lowerFilename.endsWith('.excalidraw.json')) {
    return 'excalidraw'
  }
```

No fim do arquivo:

```ts
/** Monaco has no notebook or Excalidraw grammar; both are JSON on disk. */
export function toMonacoLanguage(language: string): string {
  return language === 'notebook' || language === 'excalidraw' ? 'json' : language
}
```

Troque `const monacoLanguage = resolvedLanguage === 'notebook' ? 'json' : resolvedLanguage` em `EditorContent.tsx:113` por `const monacoLanguage = toMonacoLanguage(resolvedLanguage)`, importando de `@/lib/language-detect`.
Troque `const monacoLanguage = selectedLanguage === 'notebook' ? 'json' : selectedLanguage` em `EditorConflictReviewSurface.tsx:166` por `const monacoLanguage = toMonacoLanguage(selectedLanguage)`, acrescentando `toMonacoLanguage` ao import existente de `detectLanguage`.

- [ ] **Passo 4: rodar e ver passar**

Rode: `pnpm test src/renderer/src/lib/language-detect.test.ts`
Esperado: PASS.

- [ ] **Passo 5: escrever os testes de modo e de render model que falham**

Em `src/renderer/src/components/editor/markdown-preview-controls.test.ts`, no `describe` que contém `'keeps notebook toggles to source and rich without Changes'`:

```ts
  it('gives Excalidraw tabs source and rich without Changes, defaulting to rich', () => {
    const target = { language: 'excalidraw', mode: 'edit' as const }
    expect(getEditorToggleModes(target)).toEqual(['source', 'rich'])
    expect(getMarkdownViewModes(target)).toEqual(['source', 'rich'])
    expect(getDefaultMarkdownViewMode(target)).toBe('rich')
  })
```

Em `src/renderer/src/components/editor/editor-panel-render-model.test.ts`, num `describe` novo no fim do arquivo:

```ts
describe('Excalidraw render model', () => {
  const excalidrawFile = (overrides: Partial<OpenFile> = {}): OpenFile =>
    markdownFile({
      id: '/repo/diagram.excalidraw',
      filePath: '/repo/diagram.excalidraw',
      relativePath: 'diagram.excalidraw',
      language: 'excalidraw',
      ...overrides
    })

  it('flags Excalidraw edit tabs and opens them in the visual mode', () => {
    const model = renderModel({
      activeFile: excalidrawFile(),
      fileContents: { '/repo/diagram.excalidraw': textContent({ content: '' }) }
    })
    expect(model.isExcalidraw).toBe(true)
    expect(model.availableEditorToggleModes).toEqual(['source', 'rich'])
    expect(model.mdViewMode).toBe('rich')
    expect(model.effectiveToggleValue).toBe('rich')
  })

  it('keeps read-only Excalidraw tabs on raw text', () => {
    const model = renderModel({
      activeFile: excalidrawFile({ readOnly: true }),
      fileContents: { '/repo/diagram.excalidraw': textContent({ content: '' }) }
    })
    expect(model.isExcalidraw).toBe(false)
  })
})
```

- [ ] **Passo 6: rodar e ver falhar**

Rode: `pnpm test src/renderer/src/components/editor/markdown-preview-controls.test.ts src/renderer/src/components/editor/editor-panel-render-model.test.ts`
Esperado: FAIL, porque `excalidraw` ainda não tem modos e `isExcalidraw` não existe.

- [ ] **Passo 7: implementar modos e flag**

Em `markdown-preview-controls.ts`, abaixo de `NOTEBOOK_VIEW_MODES`:

```ts
const EXCALIDRAW_VIEW_MODES = ['source', 'rich'] as const satisfies readonly MarkdownViewMode[]
```

Em `getEditorToggleModes`, logo depois do bloco `if (target.language === 'notebook') {...}`:

```ts
  if (target.language === 'excalidraw') {
    // Why: Changes would diff the scene JSON, which is unreadable for a drawing.
    return EXCALIDRAW_VIEW_MODES
  }
```

Em `getMarkdownViewModes`, logo depois do bloco do notebook:

```ts
  if (target.language === 'excalidraw' && target.mode === 'edit') {
    return EXCALIDRAW_VIEW_MODES
  }
```

Em `editor-panel-render-model.ts`, logo abaixo de `isNotebook: viewerLanguage === 'notebook',`:

```ts
    isExcalidraw: viewerLanguage === 'excalidraw',
```

- [ ] **Passo 8: rodar e ver passar**

Rode: `pnpm test src/renderer/src/components/editor/markdown-preview-controls.test.ts src/renderer/src/components/editor/editor-panel-render-model.test.ts`
Esperado: PASS.

- [ ] **Passo 9: rótulo "Visual" no seletor**

Em `EditorViewToggle.tsx`, acrescente `PenTool` ao import de `lucide-react` e, abaixo de `NOTEBOOK_VIEW_MODE_METADATA`:

```ts
export const EXCALIDRAW_VIEW_MODE_METADATA: Partial<Record<MarkdownViewMode, ViewModeMetadata>> = {
  rich: {
    get label() {
      return translate('auto.components.editor.EditorViewToggle.f2ca20453a', 'Visual')
    },
    icon: PenTool
  }
}
```

Registre a chave no catálogo inglês. Rode na raiz:

```bash
node -e "const fs=require('fs');const p='src/renderer/src/i18n/locales/en.json';const c=JSON.parse(fs.readFileSync(p,'utf8'));const set=(k,v)=>{const parts=k.split('.');let o=c;for(const s of parts.slice(0,-1)){o[s]??={};o=o[s]}o[parts.at(-1)]=v};set('auto.components.editor.EditorViewToggle.f2ca20453a','Visual');fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n')"
```

Em `EditorPanelHeader.tsx`, acrescente `isExcalidraw: boolean` ao tipo das props (ao lado de `isNotebook: boolean`), desestruture `isExcalidraw` e troque o `metadataOverride` por:

```tsx
          metadataOverride={
            isCsv
              ? CSV_VIEW_MODE_METADATA
              : isNotebook
                ? NOTEBOOK_VIEW_MODE_METADATA
                : isExcalidraw
                  ? EXCALIDRAW_VIEW_MODE_METADATA
                  : undefined
          }
```

importando `EXCALIDRAW_VIEW_MODE_METADATA` junto com os outros metadados.
Em `EditorPanelShell.tsx:109`, acrescente `isExcalidraw={model.isExcalidraw}` logo abaixo de `isNotebook={model.isNotebook}` no `EditorPanelHeader`.

- [ ] **Passo 10: atualizar os testes que montam o cabeçalho**

Rode: `git grep -n "isNotebook" -- 'src/renderer/src/**/*.test.tsx'`
Em cada teste listado que monta `EditorPanelHeader`, acrescente `isExcalidraw: false` (ou `isExcalidraw={false}`) ao lado de `isNotebook`.
Acrescente em `EditorPanelHeader.test.tsx` um caso que monta o cabeçalho com `isExcalidraw` verdadeiro, `hasEditorToggle` verdadeiro e `availableEditorToggleModes={['source', 'rich']}`, e confere `screen.getByRole('radio', { name: 'Visual' })`, seguindo a montagem dos casos que já existem no arquivo.

- [ ] **Passo 11: verificar e fazer commit**

Rode: `pnpm test src/renderer/src/lib/language-detect.test.ts src/renderer/src/components/editor/ && pnpm tc:web`
Esperado: PASS.

```bash
git add src/renderer/src/lib/language-detect.ts src/renderer/src/lib/language-detect.test.ts src/renderer/src/components/editor src/renderer/src/i18n/locales/en.json
git commit -m "feat(editor): recognise Excalidraw scenes and offer a Source / Visual toggle"
```

---

### Tarefa 3: interpretar o arquivo Excalidraw

**Arquivos:**
- Criar: `src/renderer/src/components/editor/excalidraw-file-parse.ts`
- Teste: `src/renderer/src/components/editor/excalidraw-file-parse.test.ts`

**Interfaces:**
- Produz:

```ts
export type ExcalidrawFileParse =
  | { ok: true; scene: ImportedDataState | null }
  | { ok: false; error: string }
export function parseExcalidrawFile(text: string): ExcalidrawFileParse
```

`scene: null` significa arquivo vazio, ou seja, desenho novo.

- [ ] **Passo 1: escrever os testes que falham**

```ts
import { describe, expect, it } from 'vitest'
import { parseExcalidrawFile } from './excalidraw-file-parse'

const scene = {
  type: 'excalidraw',
  version: 2,
  source: 'https://excalidraw.com',
  elements: [{ id: 'r1', type: 'rectangle', version: 1 }],
  appState: { viewBackgroundColor: '#ffffff' },
  files: {}
}

describe('parseExcalidrawFile', () => {
  it('treats an empty or whitespace-only file as a new blank drawing', () => {
    expect(parseExcalidrawFile('')).toEqual({ ok: true, scene: null })
    expect(parseExcalidrawFile('  \n\t')).toEqual({ ok: true, scene: null })
  })

  it('returns the scene of a valid Excalidraw file', () => {
    expect(parseExcalidrawFile(JSON.stringify(scene))).toEqual({ ok: true, scene })
  })

  it('accepts a file saved with a UTF-8 byte order mark', () => {
    expect(parseExcalidrawFile(`\uFEFF${JSON.stringify(scene)}`)).toEqual({ ok: true, scene })
  })

  it('accepts a scene without elements', () => {
    expect(parseExcalidrawFile('{"type":"excalidraw"}')).toEqual({
      ok: true,
      scene: { type: 'excalidraw' }
    })
  })

  it('rejects malformed JSON', () => {
    const result = parseExcalidrawFile('{"type":"excalidraw",')
    expect(result.ok).toBe(false)
  })

  it.each([
    ['an empty object', '{}'],
    ['a renamed library file', '{"type":"excalidrawlib","libraryItems":[]}'],
    ['an array', '[]'],
    ['a string', '"excalidraw"'],
    ['elements that are not a list', '{"type":"excalidraw","elements":{}}']
  ])('rejects %s as not an Excalidraw scene', (_label, text) => {
    expect(parseExcalidrawFile(text)).toEqual({
      ok: false,
      error: 'Not an Excalidraw scene: expected "type": "excalidraw" and a list of elements.'
    })
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `pnpm test src/renderer/src/components/editor/excalidraw-file-parse.test.ts`
Esperado: FAIL com "Failed to resolve import ./excalidraw-file-parse".

- [ ] **Passo 3: implementar**

```ts
import type { ImportedDataState } from '@excalidraw/excalidraw/data/types'

export type ExcalidrawFileParse =
  | { ok: true; scene: ImportedDataState | null }
  | { ok: false; error: string }

const NOT_A_SCENE = 'Not an Excalidraw scene: expected "type": "excalidraw" and a list of elements.'

/** Empty files are new drawings; anything else must be a scene, so the viewer never overwrites foreign JSON. */
export function parseExcalidrawFile(text: string): ExcalidrawFileParse {
  const body = text.replace(/^\uFEFF/, '')
  if (body.trim() === '') {
    return { ok: true, scene: null }
  }
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON' }
  }
  return isExcalidrawScene(value) ? { ok: true, scene: value } : { ok: false, error: NOT_A_SCENE }
}

function isExcalidrawScene(value: unknown): value is ImportedDataState {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'type' in value &&
    value.type === 'excalidraw' &&
    (!('elements' in value) || value.elements === null || Array.isArray(value.elements))
  )
}
```

- [ ] **Passo 4: rodar e ver passar**

Rode: `pnpm test src/renderer/src/components/editor/excalidraw-file-parse.test.ts`
Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add src/renderer/src/components/editor/excalidraw-file-parse.ts src/renderer/src/components/editor/excalidraw-file-parse.test.ts
git commit -m "feat(editor): parse Excalidraw scene files without overwriting foreign JSON"
```

---

### Tarefa 4: hook de edição com rascunho, flush e detecção de eco

**Arquivos:**
- Criar: `src/renderer/src/components/editor/useExcalidrawDocumentEditing.ts`
- Teste: `src/renderer/src/components/editor/useExcalidrawDocumentEditing.test.tsx`

**Interfaces:**
- Consome: `registerPendingEditorFlush(fileId: string, flush: () => void): () => void` e `flushPendingEditorChange(fileId: string): void`, de `./editor-pending-flush`.
- Produz:

```ts
export type ExcalidrawDocumentEditing = {
  queueSceneChange: (serialize: () => string) => void
  flush: () => string
  hasPendingChange: () => boolean
  isOwnContent: (text: string) => boolean
}
export function useExcalidrawDocumentEditing(args: {
  content: string
  fileId: string
  onContentChange: (content: string) => void
  onDirtyStateHint: (dirty: boolean) => void
}): ExcalidrawDocumentEditing
```

- [ ] **Passo 1: escrever os testes que falham**

```tsx
// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPendingEditorChange } from './editor-pending-flush'
import { useExcalidrawDocumentEditing } from './useExcalidrawDocumentEditing'

function setup(initialContent = '') {
  const onContentChange = vi.fn()
  const onDirtyStateHint = vi.fn()
  const hook = renderHook(
    ({ content }: { content: string }) =>
      useExcalidrawDocumentEditing({
        content,
        fileId: 'drawing-a',
        onContentChange,
        onDirtyStateHint
      }),
    { initialProps: { content: initialContent } }
  )
  return { hook, onContentChange, onDirtyStateHint }
}

describe('Excalidraw document editing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks dirty at once and commits only the latest scene after the debounce', () => {
    const { hook, onContentChange, onDirtyStateHint } = setup()
    act(() => {
      hook.result.current.queueSceneChange(() => 'first')
      hook.result.current.queueSceneChange(() => 'second')
    })
    expect(onDirtyStateHint).toHaveBeenCalledWith(true)
    expect(onContentChange).not.toHaveBeenCalled()
    expect(hook.result.current.hasPendingChange()).toBe(true)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(onContentChange).toHaveBeenCalledTimes(1)
    expect(onContentChange).toHaveBeenCalledWith('second')
    expect(hook.result.current.hasPendingChange()).toBe(false)
  })

  it('flushes a pending change synchronously and returns the latest text', () => {
    const { hook, onContentChange } = setup('saved')
    act(() => {
      hook.result.current.queueSceneChange(() => 'drawn')
    })
    let flushed = ''
    act(() => {
      flushed = hook.result.current.flush()
    })
    expect(flushed).toBe('drawn')
    expect(onContentChange).toHaveBeenCalledWith('drawn')
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(onContentChange).toHaveBeenCalledTimes(1)
  })

  it('returns the current content when nothing is pending', () => {
    const { hook, onContentChange } = setup('saved')
    expect(hook.result.current.flush()).toBe('saved')
    expect(onContentChange).not.toHaveBeenCalled()
  })

  it('recognises its own committed text but not external text', () => {
    const { hook } = setup('saved')
    act(() => {
      hook.result.current.queueSceneChange(() => 'drawn')
      hook.result.current.flush()
    })
    expect(hook.result.current.isOwnContent('drawn')).toBe(true)
    expect(hook.result.current.isOwnContent('saved')).toBe(false)
    expect(hook.result.current.isOwnContent('edited elsewhere')).toBe(false)
  })

  it('lets save and tab close flush through the pending editor registry', () => {
    const { hook, onContentChange } = setup()
    act(() => {
      hook.result.current.queueSceneChange(() => 'drawn')
    })
    act(() => {
      flushPendingEditorChange('drawing-a')
    })
    expect(onContentChange).toHaveBeenCalledWith('drawn')
  })

  it('commits the pending change when the viewer unmounts', () => {
    const { hook, onContentChange } = setup()
    act(() => {
      hook.result.current.queueSceneChange(() => 'last stroke')
    })
    hook.unmount()
    expect(onContentChange).toHaveBeenCalledWith('last stroke')
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `pnpm test src/renderer/src/components/editor/useExcalidrawDocumentEditing.test.tsx`
Esperado: FAIL com "Failed to resolve import ./useExcalidrawDocumentEditing".

- [ ] **Passo 3: implementar**

```ts
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { registerPendingEditorFlush } from './editor-pending-flush'

const EXCALIDRAW_COMMIT_DELAY_MS = 400

export type ExcalidrawDocumentEditing = {
  /** Marks the tab dirty now and commits `serialize()` once edits settle. */
  queueSceneChange: (serialize: () => string) => void
  /** Commits any queued change now and returns the latest document text. */
  flush: () => string
  hasPendingChange: () => boolean
  /** True when `text` is what this editor last committed, so it is not an external change. */
  isOwnContent: (text: string) => boolean
}

type UseExcalidrawDocumentEditingArgs = {
  content: string
  fileId: string
  onContentChange: (content: string) => void
  onDirtyStateHint: (dirty: boolean) => void
}

export function useExcalidrawDocumentEditing({
  content,
  fileId,
  onContentChange,
  onDirtyStateHint
}: UseExcalidrawDocumentEditingArgs): ExcalidrawDocumentEditing {
  const contentRef = useRef(content)
  const lastCommittedRef = useRef<string | null>(null)
  const serializeRef = useRef<(() => string) | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onContentChangeRef = useRef(onContentChange)
  const onDirtyStateHintRef = useRef(onDirtyStateHint)
  useLayoutEffect(() => {
    contentRef.current = content
    onContentChangeRef.current = onContentChange
    onDirtyStateHintRef.current = onDirtyStateHint
  }, [content, onContentChange, onDirtyStateHint])

  const flush = useCallback((): string => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const serialize = serializeRef.current
    serializeRef.current = null
    if (!serialize) {
      return contentRef.current
    }
    const next = serialize()
    if (next !== contentRef.current) {
      contentRef.current = next
      lastCommittedRef.current = next
      onContentChangeRef.current(next)
    }
    return next
  }, [])

  const queueSceneChange = useCallback(
    (serialize: () => string): void => {
      serializeRef.current = serialize
      onDirtyStateHintRef.current(true)
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(flush, EXCALIDRAW_COMMIT_DELAY_MS)
    },
    [flush]
  )

  useEffect(() => registerPendingEditorFlush(fileId, flush), [fileId, flush])
  useEffect(
    () => () => {
      flush()
    },
    [flush]
  )

  return useMemo(
    () => ({
      queueSceneChange,
      flush,
      hasPendingChange: () => serializeRef.current !== null,
      isOwnContent: (text: string) => text === lastCommittedRef.current
    }),
    [queueSceneChange, flush]
  )
}
```

- [ ] **Passo 4: rodar e ver passar**

Rode: `pnpm test src/renderer/src/components/editor/useExcalidrawDocumentEditing.test.tsx`
Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add src/renderer/src/components/editor/useExcalidrawDocumentEditing.ts src/renderer/src/components/editor/useExcalidrawDocumentEditing.test.tsx
git commit -m "feat(editor): debounce Excalidraw scene drafts and flush them on save or close"
```

---

### Tarefa 5: biblioteca global no main, com IPC e preload

**Arquivos:**
- Criar: `src/main/excalidraw/excalidraw-library-store.ts`
- Criar: `src/main/ipc/excalidraw-library.ts`
- Criar: `src/preload/api/excalidraw-library-api.ts`
- Criar: `src/preload/api/excalidraw-library-bridge.ts`
- Modificar: `src/preload/api-types.ts` (import e campo `excalidrawLibrary`, ao lado de `notebook`)
- Modificar: `src/preload/index.ts` (import e `excalidrawLibrary: excalidrawLibraryApi,` logo abaixo de `notebook: notebookApi,`)
- Modificar: `src/main/ipc/register-core-handlers/register-core-handlers.ts` (import e chamada logo abaixo de `registerCodexConfigSyncHandlers(...)`)
- Testes: `src/main/excalidraw/excalidraw-library-store.test.ts`, `src/main/ipc/excalidraw-library.test.ts`

**Interfaces:**
- Produz no main: `readExcalidrawLibrary(filePath: string): unknown[]`, `writeExcalidrawLibrary(filePath: string, libraryItems: unknown): void` e `registerExcalidrawLibraryHandlers(getLibraryPath?: () => string): void`.
- Produz os canais `excalidrawLibrary:read` (sem argumento, devolve `unknown[]`) e `excalidrawLibrary:write` (recebe `unknown[]`).
- Produz no renderer: `window.api.excalidrawLibrary.read(): Promise<unknown[]>` e `window.api.excalidrawLibrary.write(libraryItems: readonly unknown[]): Promise<void>`.

- [ ] **Passo 1: escrever os testes do store que falham**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readExcalidrawLibrary, writeExcalidrawLibrary } from './excalidraw-library-store'

let root: string
let libraryPath: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orca-excalidraw-library-'))
  libraryPath = join(root, 'excalidraw-library.json')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('Excalidraw library store', () => {
  it('reads a missing library as empty', () => {
    expect(readExcalidrawLibrary(libraryPath)).toEqual([])
  })

  it('reads a corrupt library as empty and leaves the file untouched', () => {
    writeFileSync(libraryPath, '{"libraryItems": [', 'utf-8')
    expect(readExcalidrawLibrary(libraryPath)).toEqual([])
    expect(readFileSync(libraryPath, 'utf-8')).toBe('{"libraryItems": [')
  })

  it('round-trips items in the standard .excalidrawlib envelope', () => {
    const items = [{ id: 'item-1', status: 'unpublished', elements: [], created: 1 }]
    writeExcalidrawLibrary(libraryPath, items)
    const file: unknown = JSON.parse(readFileSync(libraryPath, 'utf-8'))
    expect(file).toMatchObject({ type: 'excalidrawlib', version: 2, libraryItems: items })
    expect(readExcalidrawLibrary(libraryPath)).toEqual(items)
  })

  it('refuses to write anything that is not a list of items', () => {
    expect(() => writeExcalidrawLibrary(libraryPath, { libraryItems: [] })).toThrow(
      'Excalidraw library items must be an array.'
    )
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `pnpm test src/main/excalidraw/excalidraw-library-store.test.ts`
Esperado: FAIL com "Failed to resolve import ./excalidraw-library-store".

- [ ] **Passo 3: implementar o store**

```ts
import { readFileSync } from 'node:fs'
import { writeFileAtomically } from '../codex-accounts/fs-utils'

/** Same envelope as an exported `.excalidrawlib`, so the file can be imported elsewhere. */
type ExcalidrawLibraryFile = {
  type: 'excalidrawlib'
  version: 2
  source: string
  libraryItems: unknown[]
}

export function readExcalidrawLibrary(filePath: string): unknown[] {
  let text: string
  try {
    text = readFileSync(filePath, 'utf-8')
  } catch {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(text)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'libraryItems' in parsed &&
      Array.isArray(parsed.libraryItems)
    ) {
      return parsed.libraryItems
    }
  } catch {
    // Why: a corrupt file must not block drawing; the next valid write replaces it.
  }
  return []
}

export function writeExcalidrawLibrary(filePath: string, libraryItems: unknown): void {
  if (!Array.isArray(libraryItems)) {
    throw new Error('Excalidraw library items must be an array.')
  }
  const file: ExcalidrawLibraryFile = {
    type: 'excalidrawlib',
    version: 2,
    source: 'orca',
    libraryItems
  }
  writeFileAtomically(filePath, `${JSON.stringify(file)}\n`)
}
```

- [ ] **Passo 4: rodar e ver passar**

Rode: `pnpm test src/main/excalidraw/excalidraw-library-store.test.ts`
Esperado: PASS.

- [ ] **Passo 5: escrever o teste do IPC que falha**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { handleMock, removeHandlerMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  removeHandlerMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/unused') },
  ipcMain: { handle: handleMock, removeHandler: removeHandlerMock }
}))

import { registerExcalidrawLibraryHandlers } from './excalidraw-library'

let root: string

function handlerFor(channel: string): (...args: unknown[]) => unknown {
  const call = handleMock.mock.calls.find(([name]) => name === channel)
  if (!call) {
    throw new Error(`No handler registered for ${channel}`)
  }
  return call[1]
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'orca-excalidraw-ipc-'))
  registerExcalidrawLibraryHandlers(() => join(root, 'excalidraw-library.json'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('excalidrawLibrary IPC', () => {
  it('replaces stale handlers before registering', () => {
    expect(removeHandlerMock).toHaveBeenCalledWith('excalidrawLibrary:read')
    expect(removeHandlerMock).toHaveBeenCalledWith('excalidrawLibrary:write')
  })

  it('writes items and reads them back', () => {
    const items = [{ id: 'item-1', status: 'unpublished', elements: [], created: 1 }]
    handlerFor('excalidrawLibrary:write')({}, items)
    expect(handlerFor('excalidrawLibrary:read')({})).toEqual(items)
  })
})
```

Se `handleMock.mock.calls` sair tipado como `any[]` e o lint reclamar de `call[1]`, declare `handleMock` como `vi.fn<(channel: string, handler: (...args: unknown[]) => unknown) => void>()`.

- [ ] **Passo 6: rodar e ver falhar**

Rode: `pnpm test src/main/ipc/excalidraw-library.test.ts`
Esperado: FAIL com "Failed to resolve import ./excalidraw-library".

- [ ] **Passo 7: implementar IPC, preload e registro**

`src/main/ipc/excalidraw-library.ts`:

```ts
import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import {
  readExcalidrawLibrary,
  writeExcalidrawLibrary
} from '../excalidraw/excalidraw-library-store'

/** The library lives with the Orca profile, never on an SSH host, so every workspace shares it. */
export function registerExcalidrawLibraryHandlers(
  getLibraryPath: () => string = () => join(app.getPath('userData'), 'excalidraw-library.json')
): void {
  ipcMain.removeHandler('excalidrawLibrary:read')
  ipcMain.handle('excalidrawLibrary:read', (): unknown[] => readExcalidrawLibrary(getLibraryPath()))
  ipcMain.removeHandler('excalidrawLibrary:write')
  ipcMain.handle('excalidrawLibrary:write', (_event, libraryItems: unknown): void => {
    writeExcalidrawLibrary(getLibraryPath(), libraryItems)
  })
}
```

`src/preload/api/excalidraw-library-api.ts`:

```ts
export type ExcalidrawLibraryApi = {
  read: () => Promise<unknown[]>
  write: (libraryItems: readonly unknown[]) => Promise<void>
}
```

`src/preload/api/excalidraw-library-bridge.ts`:

```ts
import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const excalidrawLibraryApi = {
  read: (): Promise<unknown[]> => ipcRenderer.invoke('excalidrawLibrary:read'),
  write: (libraryItems: readonly unknown[]): Promise<void> =>
    ipcRenderer.invoke('excalidrawLibrary:write', libraryItems)
} satisfies PreloadApi['excalidrawLibrary']
```

Em `src/preload/api-types.ts`: `import type { ExcalidrawLibraryApi } from './api/excalidraw-library-api'` e o campo `excalidrawLibrary: ExcalidrawLibraryApi` logo abaixo de `notebook: FilesystemApi['notebook']`.
Em `src/preload/index.ts`: `import { excalidrawLibraryApi } from './api/excalidraw-library-bridge'` e `excalidrawLibrary: excalidrawLibraryApi,` logo abaixo de `notebook: notebookApi,`.
Em `register-core-handlers.ts`: `import { registerExcalidrawLibraryHandlers } from '../excalidraw-library'` e `registerExcalidrawLibraryHandlers()` logo abaixo de `registerCodexConfigSyncHandlers(codexAccounts.runtimeHomeService)`.
Não mexa em `src/renderer/src/web/web-preload-api.ts`: o cliente web não tem a biblioteca, e o viewer trata a falta dela (Tarefa 6).

- [ ] **Passo 8: verificar e fazer commit**

Rode: `pnpm test src/main/excalidraw src/main/ipc/excalidraw-library.test.ts src/renderer/src/web/web-preload-api-composition.test.ts && pnpm tc:node && pnpm tc:web`
Esperado: PASS. O teste de composição do cliente web precisa continuar passando sem mudança.

```bash
git add src/main/excalidraw src/main/ipc/excalidraw-library.ts src/main/ipc/excalidraw-library.test.ts src/main/ipc/register-core-handlers/register-core-handlers.ts src/preload/api/excalidraw-library-api.ts src/preload/api/excalidraw-library-bridge.ts src/preload/api-types.ts src/preload/index.ts
git commit -m "feat(main): persist a global Excalidraw shape library in the Orca profile"
```

---

### Tarefa 6: o ExcalidrawViewer no editor

**Arquivos:**
- Criar: `src/renderer/src/components/editor/excalidraw-library-client.ts`
- Criar: `src/renderer/src/components/editor/ExcalidrawViewer.tsx`
- Modificar: `src/renderer/src/components/editor/editor-lazy-views.ts`
- Modificar: `src/renderer/src/components/editor/EditorEditFileSurface.tsx` (import, prop `isExcalidraw` e ramo novo antes do `IpynbViewer`)
- Modificar: `src/renderer/src/components/editor/EditorContent.tsx` (prop `isExcalidraw` repassada)
- Modificar: `src/renderer/src/components/editor/EditorPanelShell.tsx:150` (`isExcalidraw={model.isExcalidraw}` no `EditorContent`)
- Modificar: `src/renderer/src/i18n/locales/en.json`
- Testes: `src/renderer/src/components/editor/excalidraw-library-client.test.ts`, `src/renderer/src/components/editor/ExcalidrawViewer.test.tsx`, e os testes que montam `EditorContent` ou `EditorEditFileSurface`

**Interfaces:**
- Consome: `parseExcalidrawFile` (Tarefa 3), `useExcalidrawDocumentEditing` (Tarefa 4), `window.api.excalidrawLibrary` (Tarefa 5), `isExcalidraw` (Tarefa 2).
- Produz: `loadExcalidrawLibrary(): Promise<LibraryItems_anyVersion>`, `saveExcalidrawLibrary(items: LibraryItems): void` e `shouldPersistLibrary(itemCount: number, libraryHadItems: boolean): boolean`.
- Produz: o componente padrão de `ExcalidrawViewer.tsx`, com as props `{ content: string; fileId: string; onContentChange: (content: string) => void; onDirtyStateHint: (dirty: boolean) => void; onSave: (content: string) => Promise<boolean> }`.

- [ ] **Passo 1: escrever os testes do cliente da biblioteca que falham**

```ts
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadExcalidrawLibrary,
  saveExcalidrawLibrary,
  shouldPersistLibrary
} from './excalidraw-library-client'

const read = vi.fn<() => Promise<unknown[]>>()
const write = vi.fn<(items: readonly unknown[]) => Promise<void>>()

beforeEach(() => {
  vi.useFakeTimers()
  read.mockReset()
  write.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { excalidrawLibrary: { read, write } }
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Excalidraw library client', () => {
  it('loads stored items', async () => {
    const items = [{ id: 'a', status: 'unpublished', elements: [], created: 1 }]
    read.mockResolvedValue(items)
    await expect(loadExcalidrawLibrary()).resolves.toEqual(items)
  })

  it('falls back to an empty library when the stored data is not a list of items', async () => {
    read.mockResolvedValue([42])
    await expect(loadExcalidrawLibrary()).resolves.toEqual([])
  })

  it('falls back to an empty library when the channel is unavailable', async () => {
    read.mockRejectedValue(new Error('No handler registered'))
    await expect(loadExcalidrawLibrary()).resolves.toEqual([])
  })

  it('writes only the latest library after edits settle', async () => {
    saveExcalidrawLibrary([])
    const latest = [{ id: 'b', status: 'unpublished' as const, elements: [], created: 2 }]
    saveExcalidrawLibrary(latest)
    await vi.advanceTimersByTimeAsync(500)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(latest)
  })

  it('never lets an empty library replace one this session has not seen', () => {
    expect(shouldPersistLibrary(0, false)).toBe(false)
    expect(shouldPersistLibrary(0, true)).toBe(true)
    expect(shouldPersistLibrary(3, false)).toBe(true)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `pnpm test src/renderer/src/components/editor/excalidraw-library-client.test.ts`
Esperado: FAIL com "Failed to resolve import ./excalidraw-library-client".

- [ ] **Passo 3: implementar o cliente da biblioteca**

```ts
import type { LibraryItems, LibraryItems_anyVersion } from '@excalidraw/excalidraw/types'

const LIBRARY_SAVE_DELAY_MS = 500
let pendingSave: ReturnType<typeof setTimeout> | null = null

function isLibraryItems(value: unknown): value is LibraryItems_anyVersion {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        Array.isArray(item) ||
        (typeof item === 'object' &&
          item !== null &&
          'elements' in item &&
          Array.isArray(item.elements))
    )
  )
}

export async function loadExcalidrawLibrary(): Promise<LibraryItems_anyVersion> {
  try {
    const items = await window.api.excalidrawLibrary.read()
    return isLibraryItems(items) ? items : []
  } catch (error) {
    console.warn('[excalidraw] library unavailable', error)
    return []
  }
}

/** Debounced across viewers so dragging items around writes the file once. */
export function saveExcalidrawLibrary(items: LibraryItems): void {
  if (pendingSave !== null) {
    clearTimeout(pendingSave)
  }
  pendingSave = setTimeout(() => {
    pendingSave = null
    Promise.resolve()
      .then(() => window.api.excalidrawLibrary.write(items))
      .catch((error: unknown) => console.warn('[excalidraw] failed to save the library', error))
  }, LIBRARY_SAVE_DELAY_MS)
}

/** An empty list only replaces the stored library after this session has seen items in it. */
export function shouldPersistLibrary(itemCount: number, libraryHadItems: boolean): boolean {
  return itemCount > 0 || libraryHadItems
}
```

- [ ] **Passo 4: rodar e ver passar**

Rode: `pnpm test src/renderer/src/components/editor/excalidraw-library-client.test.ts`
Esperado: PASS.

- [ ] **Passo 5: escrever os testes do viewer que falham**

O pacote real precisa de canvas, então o teste usa um simulador com o mesmo contrato de props.

```tsx
// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type MockElement = { id: string; version: number }
type MockApi = {
  updateScene: ReturnType<typeof vi.fn>
  addFiles: ReturnType<typeof vi.fn>
  getSceneElementsIncludingDeleted: () => MockElement[]
  getFiles: () => Record<string, unknown>
}
type MockExcalidrawProps = {
  theme?: string
  excalidrawAPI?: (api: MockApi) => void
  onChange?: (elements: MockElement[], appState: object, files: Record<string, unknown>) => void
  onLibraryChange?: (items: unknown[]) => void
}

const mock = vi.hoisted(() => {
  const state: {
    props: MockExcalidrawProps | null
    sceneElements: MockElement[]
    dark: boolean
    setMarkdownViewMode: ReturnType<typeof vi.fn>
  } = { props: null, sceneElements: [], dark: false, setMarkdownViewMode: vi.fn() }
  return state
})

const api: MockApi = {
  updateScene: vi.fn((scene: { elements: MockElement[] }) => {
    mock.sceneElements = scene.elements
  }),
  addFiles: vi.fn(),
  getSceneElementsIncludingDeleted: () => mock.sceneElements,
  getFiles: () => ({})
}

vi.mock('@excalidraw/excalidraw', () => ({
  Excalidraw: (props: MockExcalidrawProps) => {
    mock.props = props
    props.excalidrawAPI?.(api)
    return <div data-testid="excalidraw-canvas" tabIndex={0} />
  },
  CaptureUpdateAction: { NEVER: 'NEVER' },
  getSceneVersion: (elements: readonly MockElement[]) =>
    elements.reduce((sum, element) => sum + element.version, 0),
  restore: (data: { elements?: MockElement[] } | null) => ({
    elements: data?.elements ?? [],
    appState: {},
    files: {}
  }),
  serializeAsJSON: (elements: readonly MockElement[]) =>
    JSON.stringify({ type: 'excalidraw', elements })
}))
vi.mock('@excalidraw/excalidraw/index.css', () => ({}))
vi.mock('@/hooks/use-document-dark-theme', () => ({ useDocumentDarkTheme: () => mock.dark }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ setMarkdownViewMode: mock.setMarkdownViewMode })
}))
vi.mock('./editor-shortcuts', () => ({
  installEditorSaveShortcut: (target: HTMLElement, onSave: () => void) => {
    const listener = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault()
        event.stopPropagation()
        onSave()
      }
    }
    target.addEventListener('keydown', listener, true)
    return () => target.removeEventListener('keydown', listener, true)
  }
}))

import ExcalidrawViewer from './ExcalidrawViewer'

const SCENE = JSON.stringify({ type: 'excalidraw', elements: [{ id: 'a', version: 1 }] })

function renderViewer(content = SCENE) {
  const onContentChange = vi.fn()
  const onDirtyStateHint = vi.fn()
  const onSave = vi.fn(async () => true)
  const view = render(
    <ExcalidrawViewer
      content={content}
      fileId="drawing-a"
      onContentChange={onContentChange}
      onDirtyStateHint={onDirtyStateHint}
      onSave={onSave}
    />
  )
  return { view, onContentChange, onDirtyStateHint, onSave }
}

function emitChange(elements: MockElement[]): void {
  act(() => {
    mock.props?.onChange?.(elements, {}, {})
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  mock.props = null
  mock.sceneElements = []
  mock.dark = false
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      excalidrawLibrary: {
        read: vi.fn(async () => []),
        write: vi.fn(async () => undefined)
      }
    }
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('ExcalidrawViewer', () => {
  it('ignores the initial change and view-only changes', () => {
    const { onDirtyStateHint, onContentChange } = renderViewer()
    emitChange([{ id: 'a', version: 1 }])
    emitChange([{ id: 'a', version: 1 }])
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onDirtyStateHint).not.toHaveBeenCalled()
    expect(onContentChange).not.toHaveBeenCalled()
  })

  it('commits a drawing change as scene JSON after the debounce', () => {
    const { onDirtyStateHint, onContentChange } = renderViewer()
    emitChange([{ id: 'a', version: 1 }])
    emitChange([{ id: 'a', version: 2 }])
    expect(onDirtyStateHint).toHaveBeenCalledWith(true)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(onContentChange).toHaveBeenCalledWith(
      JSON.stringify({ type: 'excalidraw', elements: [{ id: 'a', version: 2 }] })
    )
  })

  it('flushes the pending drawing before saving on Ctrl+S', async () => {
    const { onSave } = renderViewer()
    emitChange([{ id: 'a', version: 1 }])
    emitChange([{ id: 'a', version: 3 }])
    fireEvent.keyDown(screen.getByTestId('excalidraw-canvas'), { key: 's', ctrlKey: true })
    await act(async () => {
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledWith(
      JSON.stringify({ type: 'excalidraw', elements: [{ id: 'a', version: 3 }] })
    )
  })

  it('reloads an external change into the open canvas without marking it dirty', () => {
    const { view, onDirtyStateHint } = renderViewer()
    emitChange([{ id: 'a', version: 1 }])
    const external = JSON.stringify({ type: 'excalidraw', elements: [{ id: 'b', version: 5 }] })
    view.rerender(
      <ExcalidrawViewer
        content={external}
        fileId="drawing-a"
        onContentChange={vi.fn()}
        onDirtyStateHint={onDirtyStateHint}
        onSave={vi.fn(async () => true)}
      />
    )
    expect(api.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({ elements: [{ id: 'b', version: 5 }] })
    )
    emitChange([{ id: 'b', version: 5 }])
    expect(onDirtyStateHint).not.toHaveBeenCalled()
  })

  it('shows an error with a way to the source and never writes invalid files', () => {
    const { onContentChange } = renderViewer('{"type":"excalidrawlib"}')
    expect(screen.getByText('This drawing could not be opened.')).toBeTruthy()
    expect(screen.queryByTestId('excalidraw-canvas')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open Source' }))
    expect(mock.setMarkdownViewMode).toHaveBeenCalledWith('drawing-a', 'source')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onContentChange).not.toHaveBeenCalled()
  })

  it('follows the Orca theme', () => {
    mock.dark = true
    renderViewer()
    expect(mock.props?.theme).toBe('dark')
  })
})
```

- [ ] **Passo 6: rodar e ver falhar**

Rode: `pnpm test src/renderer/src/components/editor/ExcalidrawViewer.test.tsx`
Esperado: FAIL com "Failed to resolve import ./ExcalidrawViewer".

- [ ] **Passo 7: implementar o viewer**

```tsx
import '@excalidraw/excalidraw/index.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import {
  CaptureUpdateAction,
  Excalidraw,
  getSceneVersion,
  restore,
  serializeAsJSON
} from '@excalidraw/excalidraw'
import type { ImportedDataState } from '@excalidraw/excalidraw/data/types'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  LibraryItems,
  UIOptions
} from '@excalidraw/excalidraw/types'
import { Button } from '@/components/ui/button'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { installEditorSaveShortcut } from './editor-shortcuts'
import { parseExcalidrawFile } from './excalidraw-file-parse'
import {
  loadExcalidrawLibrary,
  saveExcalidrawLibrary,
  shouldPersistLibrary
} from './excalidraw-library-client'
import { useExcalidrawDocumentEditing } from './useExcalidrawDocumentEditing'

type ExcalidrawViewerProps = {
  content: string
  fileId: string
  onContentChange: (content: string) => void
  onDirtyStateHint: (dirty: boolean) => void
  onSave: (content: string) => Promise<boolean>
}

type ViewerState =
  | { kind: 'error'; message: string }
  | { kind: 'scene'; initialData: ExcalidrawInitialDataState; mountKey: number }

// Why: the Orca file is the document; Excalidraw's own open/save dialogs would bypass it.
const UI_OPTIONS: Partial<UIOptions> = {
  canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: false }
}

function toInitialData(scene: ImportedDataState | null): ExcalidrawInitialDataState {
  const restored = restore(scene, null, null)
  return {
    elements: restored.elements,
    appState: restored.appState,
    files: restored.files,
    scrollToContent: true,
    libraryItems: loadExcalidrawLibrary()
  }
}

function viewerStateFor(content: string, mountKey: number): ViewerState {
  const parsed = parseExcalidrawFile(content)
  return parsed.ok
    ? { kind: 'scene', initialData: toInitialData(parsed.scene), mountKey }
    : { kind: 'error', message: parsed.error }
}

export default function ExcalidrawViewer({
  content,
  fileId,
  onContentChange,
  onDirtyStateHint,
  onSave
}: ExcalidrawViewerProps): React.JSX.Element {
  const isDark = useDocumentDarkTheme()
  const setMarkdownViewMode = useAppStore((s) => s.setMarkdownViewMode)
  const [viewerState, setViewerState] = useState(() => viewerStateFor(content, 0))
  const rootRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const sceneVersionRef = useRef<number | null>(null)
  const fileCountRef = useRef(0)
  const lastSeenContentRef = useRef(content)
  const libraryHadItemsRef = useRef(false)
  const editing = useExcalidrawDocumentEditing({
    content,
    fileId,
    onContentChange,
    onDirtyStateHint
  })

  const handleChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      const version = getSceneVersion(elements)
      const fileCount = Object.keys(files).length
      if (sceneVersionRef.current === null) {
        sceneVersionRef.current = version
        fileCountRef.current = fileCount
        return
      }
      // Why: onChange also fires for selection, zoom and scroll, which are not edits.
      if (version === sceneVersionRef.current && fileCount === fileCountRef.current) {
        return
      }
      sceneVersionRef.current = version
      fileCountRef.current = fileCount
      // Why: serialize from this snapshot; on unmount the API's scene may already be cleared.
      editing.queueSceneChange(() => serializeAsJSON(elements, appState, files, 'local'))
    },
    [editing]
  )

  const handleLibraryChange = useCallback((items: LibraryItems) => {
    if (!shouldPersistLibrary(items.length, libraryHadItemsRef.current)) {
      return
    }
    libraryHadItemsRef.current = true
    saveExcalidrawLibrary(items)
  }, [])

  useEffect(() => {
    if (content === lastSeenContentRef.current) {
      return
    }
    lastSeenContentRef.current = content
    if (editing.isOwnContent(content) || editing.hasPendingChange()) {
      return
    }
    const parsed = parseExcalidrawFile(content)
    if (!parsed.ok) {
      apiRef.current = null
      setViewerState({ kind: 'error', message: parsed.error })
      return
    }
    const api = apiRef.current
    if (viewerState.kind === 'error' || !api) {
      sceneVersionRef.current = null
      setViewerState((current) =>
        viewerStateFor(content, current.kind === 'scene' ? current.mountKey + 1 : 1)
      )
      return
    }
    const restored = restore(parsed.scene, null, null)
    api.addFiles(Object.values(restored.files))
    api.updateScene({ elements: restored.elements, captureUpdate: CaptureUpdateAction.NEVER })
    sceneVersionRef.current = getSceneVersion(api.getSceneElementsIncludingDeleted())
    fileCountRef.current = Object.keys(api.getFiles()).length
  }, [content, editing, viewerState.kind])

  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }
    return installEditorSaveShortcut(root, () => {
      void onSave(editing.flush())
    })
  }, [editing, onSave, viewerState.kind])

  if (viewerState.kind === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-editor-surface p-6 text-sm text-muted-foreground">
        <div className="flex max-w-md items-start gap-3 rounded-md border border-border bg-background p-4">
          <AlertCircle className="mt-0.5 size-4 text-destructive" />
          <div>
            <div className="font-medium text-foreground">
              {translate(
                'auto.components.editor.ExcalidrawViewer.361dee5208',
                'This drawing could not be opened.'
              )}
            </div>
            <div className="mt-1">{viewerState.message}</div>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => setMarkdownViewMode(fileId, 'source')}
            >
              {translate('auto.components.editor.ExcalidrawViewer.01669bb639', 'Open Source')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="h-full w-full min-h-0">
      <Excalidraw
        key={viewerState.mountKey}
        initialData={viewerState.initialData}
        excalidrawAPI={(api) => {
          apiRef.current = api
        }}
        theme={isDark ? 'dark' : 'light'}
        UIOptions={UI_OPTIONS}
        onChange={handleChange}
        onLibraryChange={handleLibraryChange}
      />
    </div>
  )
}
```

Se o `tc:web` recusar `appState: restored.appState` em `toInitialData`, troque por `appState: { ...restored.appState }`, que tem o mesmo efeito. Não use cast.

Registre as duas chaves no catálogo inglês, com o mesmo comando `node -e` da Tarefa 2, chamando `set` duas vezes:

```
set('auto.components.editor.ExcalidrawViewer.361dee5208','This drawing could not be opened.')
set('auto.components.editor.ExcalidrawViewer.01669bb639','Open Source')
```

- [ ] **Passo 8: rodar e ver passar**

Rode: `pnpm test src/renderer/src/components/editor/ExcalidrawViewer.test.tsx`
Esperado: PASS.

- [ ] **Passo 9: plugar o viewer no editor**

Em `editor-lazy-views.ts`, no fim:

```ts
export const ExcalidrawViewer = lazy(() => import('./ExcalidrawViewer'))
```

Em `EditorEditFileSurface.tsx`:
1. Acrescente `ExcalidrawViewer` ao import de `./editor-lazy-views`.
2. Acrescente `isExcalidraw` à desestruturação (logo abaixo de `isNotebook,`) e `isExcalidraw: boolean` ao tipo das props (logo abaixo de `isNotebook: boolean`).
3. Logo antes de `) : isNotebook && mdViewMode === 'rich' ? (`, insira:

```tsx
  ) : isExcalidraw && mdViewMode === 'rich' ? (
    <ExcalidrawViewer
      key={activeFile.id}
      content={currentContent}
      fileId={activeFile.id}
      onContentChange={handleContentChange}
      onDirtyStateHint={handleDirtyStateHint}
      onSave={handleSave}
    />
```

Em `EditorContent.tsx`, acrescente `isExcalidraw` à desestruturação e ao tipo (ao lado de `isNotebook`) e `isExcalidraw={isExcalidraw}` no `EditorEditFileSurface`, logo abaixo de `isNotebook={isNotebook}`.
Em `EditorPanelShell.tsx:150`, acrescente `isExcalidraw={model.isExcalidraw}` logo abaixo de `isNotebook={model.isNotebook}` no `EditorContent`.
Rode `git grep -n "isNotebook" -- 'src/renderer/src/**/*.test.tsx'` e acrescente `isExcalidraw={false}` (ou `isExcalidraw: false`) em cada teste que monta `EditorContent` ou `EditorEditFileSurface`, como `EditorEditFileSurface.monaco-containment.test.tsx`.

- [ ] **Passo 10: verificar e fazer commit**

Rode: `pnpm test src/renderer/src/components/editor/ && pnpm tc:web && pnpm run check:code-quality:changed && pnpm run verify:localization-coverage`
Esperado: PASS em todos.

```bash
git add src/renderer/src/components/editor src/renderer/src/i18n/locales/en.json
git commit -m "feat(editor): draw and save Excalidraw scenes in the editor with a shared library"
```

---

### Tarefa 7: criar um desenho novo pelo explorador

**Arquivos:**
- Criar: `src/renderer/src/components/right-sidebar/excalidraw-drawing-name.ts`
- Modificar: `src/renderer/src/components/right-sidebar/file-explorer-inline-input-row.tsx:5-12`
- Modificar: `src/renderer/src/components/right-sidebar/useFileExplorerInlineInput.ts:31,78,116,215`
- Modificar: `src/renderer/src/components/right-sidebar/FileExplorerBackgroundMenu.tsx:36,61-75`
- Modificar: `src/renderer/src/components/right-sidebar/file-explorer-row-context-menu.tsx:158-165`
- Modificar: `src/renderer/src/components/right-sidebar/FileExplorerRow.tsx:54`
- Modificar: `src/renderer/src/components/right-sidebar/FileExplorerVirtualRows.tsx:46`
- Modificar: `src/renderer/src/components/right-sidebar/use-file-explorer-background-menu.ts:25`
- Modificar: `src/renderer/src/i18n/locales/en.json`
- Testes: `src/renderer/src/components/right-sidebar/excalidraw-drawing-name.test.ts`, `src/renderer/src/components/right-sidebar/file-explorer-new-excalidraw-drawing.test.tsx`

**Interfaces:**
- Consome: `detectLanguage` com o suporte a `excalidraw` (Tarefa 2), que faz o arquivo abrir no modo Visual.
- Produz: `toExcalidrawDrawingName(name: string): string` e o tipo `FileExplorerNewEntryKind = 'file' | 'folder' | 'excalidraw'`, exportado de `file-explorer-inline-input-row.tsx`.

- [ ] **Passo 1: escrever o teste de nome que falha**

```ts
import { describe, expect, it } from 'vitest'
import { toExcalidrawDrawingName } from './excalidraw-drawing-name'

describe('toExcalidrawDrawingName', () => {
  it.each([
    ['diagram', 'diagram.excalidraw'],
    ['docs/diagram', 'docs/diagram.excalidraw'],
    ['notes.md', 'notes.md.excalidraw'],
    ['diagram.excalidraw', 'diagram.excalidraw'],
    ['Diagram.EXCALIDRAW', 'Diagram.EXCALIDRAW'],
    ['diagram.excalidraw.json', 'diagram.excalidraw.json']
  ])('turns %s into %s', (input, expected) => {
    expect(toExcalidrawDrawingName(input)).toBe(expected)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rode: `pnpm test src/renderer/src/components/right-sidebar/excalidraw-drawing-name.test.ts`
Esperado: FAIL com "Failed to resolve import ./excalidraw-drawing-name".

- [ ] **Passo 3: implementar**

```ts
/** Appends `.excalidraw` unless the name already ends in a scene suffix Orca opens visually. */
export function toExcalidrawDrawingName(name: string): string {
  const lower = name.toLowerCase()
  return lower.endsWith('.excalidraw') || lower.endsWith('.excalidraw.json')
    ? name
    : `${name}.excalidraw`
}
```

Rode: `pnpm test src/renderer/src/components/right-sidebar/excalidraw-drawing-name.test.ts`
Esperado: PASS.

- [ ] **Passo 4: escrever o teste do fluxo de criação que falha**

```tsx
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { createFileExplorerRowProjection } from './file-explorer-row-projection'
import { useFileExplorerInlineInput } from './useFileExplorerInlineInput'

const mocks = vi.hoisted(() => {
  const route = {
    settings: { activeRuntimeEnvironmentId: null },
    connectionId: null,
    expectedExecutionHostId: undefined,
    expectedSshTargetId: undefined,
    expectedSshConnectionGeneration: undefined
  }
  return {
    route,
    openFile: vi.fn(),
    toggleDir: vi.fn(),
    refreshDir: vi.fn().mockResolvedValue(undefined),
    createRuntimePath: vi.fn().mockResolvedValue(undefined),
    deleteRuntimePath: vi.fn().mockResolvedValue(undefined),
    commitFileExplorerOp: vi.fn()
  }
})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ openFile: mocks.openFile, toggleDir: mocks.toggleDir })
}))
vi.mock('@/runtime/runtime-file-client', () => ({
  createRuntimePath: mocks.createRuntimePath,
  deleteRuntimePath: mocks.deleteRuntimePath
}))
vi.mock('./fileExplorerUndoRedo', () => ({ commitFileExplorerOp: mocks.commitFileExplorerOp }))
vi.mock('./file-explorer-operation-owner', () => ({
  getFileExplorerOperationOwner: () => undefined,
  captureFileExplorerOperationGuard: () => ({
    route: mocks.route,
    assertCurrent: () => mocks.route
  })
}))

function Harness({ name }: { name: string }): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { startNew, handleInlineSubmit } = useFileExplorerInlineInput({
    activeWorktreeId: 'wt-1',
    worktreePath: '/repo',
    expanded: new Set(),
    rowProjection: createFileExplorerRowProjection([]),
    scrollRef,
    refreshDir: mocks.refreshDir
  })
  return (
    <div ref={scrollRef} tabIndex={-1}>
      <button type="button" onClick={() => startNew('excalidraw', '/repo', 0)}>
        Start
      </button>
      <button type="button" onClick={() => handleInlineSubmit(name)}>
        Submit
      </button>
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('New Excalidraw Drawing', () => {
  it('creates an empty .excalidraw file and opens it in the editor', async () => {
    const view = render(<Harness name="diagram" />)
    fireEvent.click(view.getByRole('button', { name: 'Start' }))
    fireEvent.click(view.getByRole('button', { name: 'Submit' }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.createRuntimePath).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: 'wt-1' }),
      expect.stringMatching(/diagram\.excalidraw$/),
      'file'
    )
    expect(mocks.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'excalidraw', mode: 'edit' }),
      expect.anything()
    )
  })

  it('keeps a name that already has the scene suffix', async () => {
    const view = render(<Harness name="flow.excalidraw.json" />)
    fireEvent.click(view.getByRole('button', { name: 'Start' }))
    fireEvent.click(view.getByRole('button', { name: 'Submit' }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.createRuntimePath).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/flow\.excalidraw\.json$/),
      'file'
    )
  })
})
```

- [ ] **Passo 5: rodar e ver falhar**

Rode: `pnpm test src/renderer/src/components/right-sidebar/file-explorer-new-excalidraw-drawing.test.tsx`
Esperado: FAIL, porque `startNew` ainda não aceita `'excalidraw'` e o caminho criado não tem o sufixo.

- [ ] **Passo 6: implementar o tipo novo e o fluxo**

Em `file-explorer-inline-input-row.tsx`:

```ts
export type FileExplorerNewEntryKind = 'file' | 'folder' | 'excalidraw'

export type InlineInput = {
  parentPath: string
  type: FileExplorerNewEntryKind | 'rename'
  depth: number
  existingName?: string
  existingPath?: string
  operationOwner?: TreeNode['operationOwner']
}
```

O ícone em `file-explorer-inline-input-row.tsx:137` continua com `inlineInput.type === 'folder'`, então o desenho novo mostra o ícone de arquivo.
Troque `type: 'file' | 'folder'` por `type: FileExplorerNewEntryKind` nas assinaturas de `onStartNew`/`startNew` em `useFileExplorerInlineInput.ts` (linhas 31 e 78), `FileExplorerBackgroundMenu.tsx:36`, `FileExplorerRow.tsx:54`, `FileExplorerVirtualRows.tsx:46` e `use-file-explorer-background-menu.ts:25`, importando o tipo de `./file-explorer-inline-input-row`.

Em `useFileExplorerInlineInput.ts`, importe `toExcalidrawDrawingName` de `./excalidraw-drawing-name` e troque `const name = value.trim()` por:

```ts
      const name =
        inlineInput.type === 'excalidraw' ? toExcalidrawDrawingName(value.trim()) : value.trim()
```

Troque `if (inlineInput.type === 'file') {` (o bloco que chama `openFile`) por `if (inlineInput.type !== 'folder') {`.
O resto do fluxo já trata o desenho como arquivo: `createRuntimePath` recebe `'file'` porque o tipo não é `'folder'`, e o desfazer e refazer usam o ramo de arquivo.

- [ ] **Passo 7: rodar e ver passar**

Rode: `pnpm test src/renderer/src/components/right-sidebar/file-explorer-new-excalidraw-drawing.test.tsx src/renderer/src/components/right-sidebar/excalidraw-drawing-name.test.ts`
Esperado: PASS.

- [ ] **Passo 8: itens de menu**

Em `FileExplorerBackgroundMenu.tsx`, acrescente `PenTool` ao import de `lucide-react` e, logo depois do item "New File":

```tsx
        <DropdownMenuItem onSelect={() => onStartNew('excalidraw', worktreePath, displayDepth)}>
          <PenTool />
          {translate(
            'auto.components.right.sidebar.FileExplorerBackgroundMenu.e113b99f4c',
            'New Excalidraw Drawing'
          )}
        </DropdownMenuItem>
```

Em `file-explorer-row-context-menu.tsx`, acrescente `PenTool` ao import de `lucide-react` e, logo depois do item "New File":

```tsx
      <ContextMenuItem onSelect={() => onStartNew('excalidraw', targetDir, targetDepth)}>
        <PenTool />
        {translate(
          'auto.components.right.sidebar.file.explorer.row.context.menu.aab3194d85',
          'New Excalidraw Drawing'
        )}
      </ContextMenuItem>
```

Registre as duas chaves no catálogo inglês com o comando `node -e` da Tarefa 2:

```
set('auto.components.right.sidebar.FileExplorerBackgroundMenu.e113b99f4c','New Excalidraw Drawing')
set('auto.components.right.sidebar.file.explorer.row.context.menu.aab3194d85','New Excalidraw Drawing')
```

Se algum teste existente conta os itens desses menus, atualize a contagem para incluir o item novo.

- [ ] **Passo 9: verificar e fazer commit**

Rode: `pnpm test src/renderer/src/components/right-sidebar/ && pnpm tc:web && pnpm run check:code-quality:changed && pnpm run verify:localization-coverage`
Esperado: PASS.

```bash
git add src/renderer/src/components/right-sidebar src/renderer/src/i18n/locales/en.json
git commit -m "feat(explorer): create a new Excalidraw drawing from the file explorer"
```

---

### Tarefa 8: E2E, validação visual e verificação final

**Arquivos:**
- Criar: `tests/e2e/excalidraw-editor.spec.ts`
- Modificar: `specs/orca-excalidraw-design.md` (linha `Status:`)

**Interfaces:**
- Consome: todo o fluxo das tarefas 1 a 7, e os helpers `test`/`expect` de `tests/e2e/helpers/orca-app`, `waitForSessionReady`/`waitForActiveWorktree` de `tests/e2e/helpers/store` e `getActiveWorktreeContext` de `tests/e2e/helpers/markdown-editor-fixture`.

- [ ] **Passo 1: escrever o E2E**

```ts
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { getActiveWorktreeContext } from './helpers/markdown-editor-fixture'

const EMPTY_SCENE = JSON.stringify({
  type: 'excalidraw',
  version: 2,
  source: 'https://excalidraw.com',
  elements: [],
  appState: { viewBackgroundColor: '#ffffff' },
  files: {}
})

async function openDrawing(
  page: Page,
  context: { rootPath: string; worktreeId: string },
  filePath: string
): Promise<void> {
  await page.evaluate(
    ({ filePath, relativePath, worktreeId }) => {
      window.__store!.getState().openFile({
        filePath,
        relativePath,
        worktreeId,
        language: 'excalidraw',
        mode: 'edit'
      })
    },
    { filePath, relativePath: path.relative(context.rootPath, filePath), worktreeId: context.worktreeId }
  )
}

async function drawRectangle(page: Page): Promise<void> {
  const canvas = page.locator('.excalidraw canvas.interactive')
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('Excalidraw canvas has no bounding box')
  }
  await canvas.click({ position: { x: 40, y: 40 } })
  await page.keyboard.press('r')
  await page.mouse.move(box.x + 200, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 360, box.y + 300, { steps: 8 })
  await page.mouse.up()
}

test.describe('Excalidraw editor', () => {
  let directory: string

  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
    const context = await getActiveWorktreeContext(orcaPage)
    directory = path.join(context.rootPath, `excalidraw-e2e-${randomUUID()}`)
    await mkdir(directory, { recursive: true })
  })

  test.afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  test('draws a rectangle and saves standard scene JSON with Ctrl+S', async ({ orcaPage }, testInfo) => {
    test.setTimeout(120_000)
    const context = await getActiveWorktreeContext(orcaPage)
    const filePath = path.join(directory, 'scene.excalidraw')
    await writeFile(filePath, EMPTY_SCENE, 'utf8')
    await openDrawing(orcaPage, context, filePath)
    await drawRectangle(orcaPage)
    await orcaPage.keyboard.press('ControlOrMeta+S')
    await expect
      .poll(async () => {
        const saved: { type: string; elements: { type: string }[] } = JSON.parse(
          await readFile(filePath, 'utf8')
        )
        return [saved.type, saved.elements.map((element) => element.type)]
      })
      .toEqual(['excalidraw', ['rectangle']])
    await orcaPage.screenshot({ path: testInfo.outputPath('excalidraw-editor.png') })
  })

  test('keeps the last stroke when switching to Source right after drawing', async ({ orcaPage }) => {
    test.setTimeout(120_000)
    const context = await getActiveWorktreeContext(orcaPage)
    const filePath = path.join(directory, 'flush.excalidraw')
    await writeFile(filePath, EMPTY_SCENE, 'utf8')
    await openDrawing(orcaPage, context, filePath)
    await drawRectangle(orcaPage)
    await orcaPage.getByRole('radio', { name: 'Source' }).click()
    await expect
      .poll(() =>
        orcaPage.evaluate(() => {
          const state = window.__store!.getState()
          return state.editorDrafts[state.activeFileId ?? ''] ?? ''
        })
      )
      .toContain('"rectangle"')
  })

  test('opens an empty file as a blank drawing', async ({ orcaPage }) => {
    const context = await getActiveWorktreeContext(orcaPage)
    const filePath = path.join(directory, 'new.excalidraw')
    await writeFile(filePath, '', 'utf8')
    await openDrawing(orcaPage, context, filePath)
    await expect(orcaPage.locator('.excalidraw canvas.interactive')).toBeVisible({ timeout: 30_000 })
  })

  test('shows an error for a file that is not a scene and leaves it untouched', async ({ orcaPage }) => {
    const context = await getActiveWorktreeContext(orcaPage)
    const filePath = path.join(directory, 'broken.excalidraw')
    const original = '{"type":"excalidrawlib","libraryItems":[]}'
    await writeFile(filePath, original, 'utf8')
    await openDrawing(orcaPage, context, filePath)
    await expect(orcaPage.getByText('This drawing could not be opened.')).toBeVisible()
    await orcaPage.keyboard.press('ControlOrMeta+S')
    expect(await readFile(filePath, 'utf8')).toBe(original)
  })
})
```

Se o seletor `.excalidraw canvas.interactive` não existir na 0.18.1, inspecione o DOM com `orcaPage.locator('.excalidraw canvas').evaluateAll((nodes) => nodes.map((node) => node.className))` e use a classe do canvas interativo.
Se `editorDrafts` ou `activeFileId` tiverem outro nome no store, confira em `src/renderer/src/store/slices/editor.ts` e ajuste o `evaluate`.

- [ ] **Passo 2: rodar o E2E em background**

Rode na raiz, sem focar janela:

```bash
ORCA_BACKGROUND_LAUNCH=1 pnpm run test:e2e excalidraw-editor.spec.ts
```

Esperado: 4 testes PASS. O `globalSetup` compila o app antes. Abra a imagem `excalidraw-editor.png` na pasta de saída do Playwright e confira que o retângulo aparece e que o seletor mostra "Source" e "Visual".

- [ ] **Passo 3: verificação completa**

Rode: `pnpm tc && pnpm test src/renderer/src/lib/language-detect.test.ts src/renderer/src/components/editor/ src/renderer/src/components/right-sidebar/ src/main/excalidraw src/main/ipc/excalidraw-library.test.ts src/renderer/src/web/web-preload-api-composition.test.ts && pnpm run check:code-quality:changed && pnpm run verify:localization-coverage && pnpm lint`
Esperado: tudo PASS. Se `pnpm lint` acusar classe que o Tailwind não gera, troque pela classe documentada em `docs/STYLEGUIDE.md`.

- [ ] **Passo 4: atualizar o status do spec e fazer commit**

Em `specs/orca-excalidraw-design.md`, troque a linha `Status: design aprovado em conversa, aguardando revisão do texto escrito.` por `Status: implementado na branch feat/excalidraw-editor (15/10/2026).`

```bash
git add tests/e2e/excalidraw-editor.spec.ts specs/orca-excalidraw-design.md
git commit -m "test(e2e): cover drawing, saving and invalid files in the Excalidraw editor"
```

## Fica para o usuário conferir no app

Estes itens não têm teste automático e entram no `TODO.md` ao fim da execução:

1. Um item salvo na biblioteca aparece ao abrir outro desenho, inclusive depois de reiniciar o Orca.
2. Um `.excalidraw` salvo pelo Orca abre sem perda na extensão do VS Code.
3. O fluxo funciona com um arquivo num workspace SSH.
4. Trocar o tema do Orca troca o tema do desenho aberto.
