# Variantes do Claude para modelos do Ollama: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** cadastrar modelos do Ollama em Settings, Agents e abrir cada um como entrada própria na lista de agentes, rodando o Claude Code no terminal com as variáveis de ambiente do Ollama.

**Arquitetura:** a variante não é um `TuiAgent`. Ela viaja como `claudeVariantId` junto do agente `claude` até o lançamento, que resolve a variante nas configurações, sobrepõe o ambiente do Ollama ao ambiente do Claude, força a rota de terminal e grava na aba uma marca `{ id, label }`.
A marca alimenta o título da aba, a retomada, o fork e a continuação.
Toda a lógica pura fica num módulo compartilhado novo, `src/shared/claude-ollama-variants.ts`.

**Tecnologias:** Electron, React 19, Zustand, Zod, Vitest com happy-dom, TypeScript estrito.

**Spec:** [specs/orca-claude-ollama-variants-design.md](../orca-claude-ollama-variants-design.md). ADR: [docs/adr/0004-variantes-claude-ollama.md](../../docs/adr/0004-variantes-claude-ollama.md). Stories: ST-23 a ST-26.

## Restrições globais

- Endereço fixo: `ANTHROPIC_BASE_URL=http://localhost:11434`.
- Token fixo: `ANTHROPIC_AUTH_TOKEN=ollama`. `ANTHROPIC_API_KEY` definido e vazio.
- `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL` e `ANTHROPIC_DEFAULT_SONNET_MODEL` recebem `model`, mais `[1m]` quando `context1m` é verdadeiro. `ANTHROPIC_DEFAULT_HAIKU_MODEL` recebe `model` sem sufixo.
- Nome até 40 caracteres, obrigatório. Modelo obrigatório, casando `/^[A-Za-z0-9._:/-]+$/`. No máximo 20 variantes.
- Separador do título da aba: `·` (espaço, ponto médio U+00B7, espaço).
- Uma variante nunca abre o Claude da Anthropic. Falha de resolução devolve `null` ou `{ ok: false }`, e o chamador mostra o aviso que já tem.
- Variantes não aparecem em workspace servido por host pareado (`isWebRuntimeSessionActive(getRuntimeEnvironmentIdForWorktree(store, worktreeId))`).
- Nada de `as` sem `SAFETY:`, nada de nome de arquivo genérico, comentário de uma linha só quando o porquê não é óbvio (`AGENTS.md`).
- UI segue `docs/STYLEGUIDE.md`, com os primitivos de `src/renderer/src/components/ui/` e textos via `translate(...)`.
- Testes e app em segundo plano com `ORCA_BACKGROUND_LAUNCH=1`, sem roubar foco.
- Cada tarefa termina com `pnpm tc`, `pnpm test <arquivos da tarefa>` e `pnpm run check:code-quality:changed` verdes.

## Foco da revisão

1. Aba renomeada pelo usuário (`customTitle`/`customLabel`): o nome dado pelo usuário vence, sem prefixo de variante. Teste na Tarefa 2.
2. Environment do Claude já define `ANTHROPIC_BASE_URL` ou `ANTHROPIC_MODEL`: os valores da variante vencem. Teste na Tarefa 1.
3. "Open agent tabs in chat by default" ligado: a variante abre a aba em modo terminal, não em chat. Teste na Tarefa 3.
4. Worktree remoto por SSH: o ambiente chega ao processo remoto. Verificação manual na Tarefa 8.
5. Modelo digitado com `[1m]`, espaço ou aspas: o cadastro recusa com erro no campo do modelo. Teste na Tarefa 1.

---

### Task 1: Modelo de dados, ambiente e persistência das variantes

**Arquivos:**

- Criar: `src/shared/claude-ollama-variants.ts`
- Criar: `src/shared/claude-ollama-variants.test.ts`
- Modificar: `src/shared/global-settings-types.ts` (junto de `agentDefaultEnv`, linha 418)
- Modificar: `src/main/persistence/applying-settings/settings-update.ts` (junto do bloco `agentDefaultEnv`, linhas 103 a 106)
- Modificar: o normalizador de leitura das configurações carregadas, em `src/main/persistence/loading-store/prepare-loaded-profile-settings.ts`

**Interfaces:**

- Produz, em `src/shared/claude-ollama-variants.ts`:
  - `type ClaudeOllamaVariant = { id: string; label: string; model: string; context1m: boolean }`
  - `type ClaudeVariantMark = { id: string; label: string }`
  - `const MAX_CLAUDE_OLLAMA_VARIANTS = 20`, `const MAX_CLAUDE_OLLAMA_VARIANT_LABEL_LENGTH = 40`
  - `function validateClaudeOllamaVariantDraft(draft: { label: string; model: string }): { ok: true } | { ok: false; field: 'label' | 'model' }`
  - `function normalizeClaudeOllamaVariants(input: unknown): ClaudeOllamaVariant[]`
  - `function buildClaudeOllamaVariantEnv(variant: ClaudeOllamaVariant): Record<string, string>`
  - `type ClaudeVariantLaunch = { ok: true; env: Record<string, string>; mark: ClaudeVariantMark } | { ok: false }`
  - `function resolveClaudeVariantLaunch(args: { variants: readonly ClaudeOllamaVariant[] | null | undefined; variantId: string; baseEnv: Record<string, string> }): ClaudeVariantLaunch`
- Produz em `GlobalSettings`: `claudeOllamaVariants?: ClaudeOllamaVariant[]`

- [ ] **Passo 1: escrever os testes que falham**

```ts
const kimi = { id: 'v1', label: 'Kimi K3.1', model: 'kimi-k3.1-pro:cloud', context1m: true }

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
  expect(resolveClaudeVariantLaunch({ variants: [kimi], variantId: 'gone', baseEnv: {} })).toEqual({
    ok: false
  })
  expect(resolveClaudeVariantLaunch({ variants: undefined, variantId: 'v1', baseEnv: {} })).toEqual(
    { ok: false }
  )
})
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
    validateClaudeOllamaVariantDraft({ label: 'DS', model: 'library/deepseek-v4.1-flash:cloud' })
  ).toEqual({ ok: true })
})
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
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `pnpm test src/shared/claude-ollama-variants.test.ts`
Esperado: FAIL, módulo inexistente.

- [ ] **Passo 3: implementar o módulo**

`label` é comparado depois de `trim()` e gravado aparado. `normalizeClaudeOllamaVariants` aplica `validateClaudeOllamaVariantDraft`, descarta id vazio ou repetido (mantém o primeiro), trata `context1m` ausente como `false` e corta em 20.
`resolveClaudeVariantLaunch` devolve `env: { ...baseEnv, ...buildClaudeOllamaVariantEnv(variant) }`.

- [ ] **Passo 4: ligar a configuração**

Adicionar `claudeOllamaVariants?: ClaudeOllamaVariant[]` a `GlobalSettings`, com comentário de uma linha.
Em `settings-update.ts`, `if ('claudeOllamaVariants' in updates) sanitizedUpdates.claudeOllamaVariants = normalizeClaudeOllamaVariants(updates.claudeOllamaVariants)`.
Na leitura das configurações carregadas, normalizar a chave do mesmo jeito, seguindo o padrão usado para `agentDefaultEnv`.
Não adicionar a chave a `src/shared/rpc-contract/client-settings-params.ts`: clientes pareados não usam variantes.
Não adicionar default em `default-global-settings.ts`: ausente equivale a lista vazia.

- [ ] **Passo 5: rodar e ver passar**

Rodar: `pnpm test src/shared/claude-ollama-variants.test.ts src/main/persistence/applying-settings` e `pnpm tc`
Esperado: PASS.

- [ ] **Passo 6: commit**

```bash
git add src/shared/claude-ollama-variants.ts src/shared/claude-ollama-variants.test.ts src/shared/global-settings-types.ts src/main/persistence
git commit -m "feat(agents): add the Ollama Claude variant model and its launch env"
```

---

### Task 2: Marca de variante na aba, no título e no registro dormente

**Arquivos:**

- Modificar: `src/shared/terminal-tab-types.ts` (junto de `quickCommandLabel`, linha 71) e `src/shared/tab-types.ts` (linha 64)
- Modificar: `src/shared/workspace-session-schema.ts` (linhas 99 e 148)
- Modificar: `src/shared/workspace-session-sleeping-agents.ts` (linha 97) e `src/shared/agent-session-resume.ts` (`SleepingAgentSessionRecord`, linha 52)
- Modificar: `src/shared/tab-title-resolution.ts`
- Modificar: `src/renderer/src/store/slices/agent-status-sleeping-records.ts` (`sleepingRecordFromEntry`, linha 44)
- Modificar: os pontos que copiam `quickCommandLabel` entre `TerminalTab`, `Tab` e o estado salvo: `src/renderer/src/store/terminals/terminal-tab-creation.ts` (linhas 97, 125, 201), `src/renderer/src/store/slices/tabs/tabs-create-actions.ts` (linhas 95, 176), `src/renderer/src/store/slices/tabs/tabs-slice-contract.ts`, `src/renderer/src/store/slices/tabs-hydration.ts`, `src/renderer/src/store/slices/tabs/tabs-reconciliation.ts`, `src/renderer/src/store/slices/terminal-session-row-hydration.ts`
- Testes: `src/shared/tab-title-resolution.test.ts` (criar se não existir), o teste existente de `sleepingRecordFromEntry`, o teste existente do schema de sessão

**Interfaces:**

- Consome: `ClaudeVariantMark` (Tarefa 1).
- Produz:
  - `claudeVariant?: ClaudeVariantMark | null` em `TerminalTab`, `Tab` e `SleepingAgentSessionRecord`.
  - Opção `claudeVariant?: ClaudeVariantMark` em `store.createTab(worktreeId, groupId, undefined, options)`, no mesmo objeto que aceita `launchAgent` e `quickCommandLabel`.
  - `resolveTerminalTabTitle` e `resolveUnifiedTabLabel` passam a aceitar `claudeVariant` no `Pick`.

- [ ] **Passo 1: escrever os testes que falham**

```ts
const mark = { id: 'v1', label: 'Kimi K3.1' }
it('prefixes the conversation title with the variant label', () => {
  expect(
    resolveTerminalTabTitle(
      { customTitle: null, title: '✳ Corrigir o login', claudeVariant: mark },
      false
    )
  ).toBe('Kimi K3.1 · ✳ Corrigir o login')
})
it('shows only the label while Claude has no conversation title', () => {
  expect(
    resolveTerminalTabTitle(
      { customTitle: null, title: '✳ Claude Code', claudeVariant: mark },
      false
    )
  ).toBe('Kimi K3.1')
  expect(
    resolveTerminalTabTitle({ customTitle: null, title: '', claudeVariant: mark }, false)
  ).toBe('Kimi K3.1')
})
it('keeps a user rename without the prefix', () => {
  expect(
    resolveTerminalTabTitle({ customTitle: 'Meu', title: 'x', claudeVariant: mark }, false)
  ).toBe('Meu')
  expect(
    resolveUnifiedTabLabel({ customLabel: 'Meu', label: 'x', claudeVariant: mark }, false)
  ).toBe('Meu')
})
it('leaves tabs without a mark unchanged', () => {
  expect(resolveTerminalTabTitle({ customTitle: null, title: 'zsh' }, false)).toBe('zsh')
})
```

No teste de `sleepingRecordFromEntry`: com `tab.claudeVariant = mark`, o registro tem `claudeVariant: mark`; sem marca, o registro não tem a chave.
No teste do schema: uma aba e um registro dormente com `claudeVariant` sobrevivem ao parse, e um valor malformado vira `undefined` sem derrubar o parse.

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `pnpm test src/shared/tab-title-resolution.test.ts` e os testes de registro e schema tocados.
Esperado: FAIL.

- [ ] **Passo 3: implementar**

Tipos: `claudeVariant?: ClaudeVariantMark | null`, com comentário de uma linha.
Schema: `z.object({ id: z.string(), label: z.string() }).nullable().optional().catch(undefined)` nos três lugares.
Título: o `customTitle` ou `customLabel` volta cedo. Sem marca, a cadeia atual fica igual. Com marca, calcula o resto da cadeia atual e devolve só o `label` quando o resto está vazio ou, sem os símbolos iniciais, é `Claude Code`; senão devolve `${label} · ${resto}`.
O `tab.title` cru continua intocado, porque a detecção de agente e de status lê esse campo.
Cópia: em cada ponto que hoje copia `quickCommandLabel` na lista de arquivos acima, copiar `claudeVariant` do mesmo jeito. Os pontos de sincronização com host pareado e celular (`web-session-tabs-sync`, `sync-runtime-graph`) ficam de fora.
Conferir os chamadores de `resolveTerminalTabTitle` e `resolveUnifiedTabLabel` que montam o objeto campo a campo, e incluir `claudeVariant` neles.

- [ ] **Passo 4: rodar e ver passar**

Rodar: `pnpm test src/shared/tab-title-resolution.test.ts src/renderer/src/store` e `pnpm tc`
Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git commit -am "feat(tabs): persist the Ollama variant mark and prefix the tab title with it"
```

---

### Task 3: Lançamento de uma variante em nova aba

**Arquivos:**

- Modificar: `src/renderer/src/lib/launch-agent-in-new-tab.ts`
- Modificar: `src/renderer/src/lib/agent-launch-route-input.ts` (tipo `tuiCustomization`, linha 62, e `requiresTuiLaunchCommand`, linha 144)
- Modificar: `src/shared/claude-ollama-variants.ts`
- Testes: `src/renderer/src/lib/launch-agent-in-new-tab.test.ts`, `src/renderer/src/lib/agent-launch-route-input.test.ts`, `src/shared/claude-ollama-variants.test.ts`

**Interfaces:**

- Consome: `resolveClaudeVariantLaunch` (Tarefa 1), opção `claudeVariant` de `createTab` (Tarefa 2).
- Produz:
  - `claudeVariantId?: string` em `LaunchAgentInNewTabArgs`. Só vale com `agent === 'claude'`.
  - `launchesClaudeVariant?: boolean` em `tuiCustomization`, somado com `||` ao `requiresTuiLaunchCommand`.
  - `function withoutClaudeVariantModelOption<T>(options: Record<string, T> | undefined): Record<string, T> | undefined` em `src/shared/claude-ollama-variants.ts`, que remove a opção de modelo da sessão. A chave exata é a que `resolveAgentSessionOptionLaunch` lê para o `modelApply` do catálogo do Claude (`src/shared/agent-session-option-catalog-claude-codex.ts:163`).

- [ ] **Passo 1: escrever os testes que falham**

No harness existente de `launch-agent-in-new-tab.test.ts`, com `settings.claudeOllamaVariants = [kimi]`, `agentDefaultEnv.claude = { FOO: 'bar' }` e `openAgentTabsInChatByDefault: true`:

```ts
it('launches a variant in the terminal with the Ollama env and its mark', () => {
  const result = launchAgentInNewTab({ agent: 'claude', claudeVariantId: 'v1', worktreeId: 'wt-1' })
  expect(result?.surface.kind).toBe('local-terminal')
  // queued: argumento de store.queueTabStartupCommand; createdTab: retorno de store.createTab, ambos do harness
  expect(queued.env).toMatchObject({
    FOO: 'bar',
    ANTHROPIC_BASE_URL: 'http://localhost:11434',
    ANTHROPIC_API_KEY: ''
  })
  expect(queued.launchConfig.agentEnv.ANTHROPIC_MODEL).toBe('kimi-k3.1-pro:cloud[1m]')
  expect(queued.command).not.toMatch(/--model/)
  expect(createdTab.claudeVariant).toEqual({ id: 'v1', label: 'Kimi K3.1' })
  expect(createdTab.viewMode ?? 'terminal').toBe('terminal')
})
it('returns null for an unknown variant and opens nothing', () => {
  expect(
    launchAgentInNewTab({ agent: 'claude', claudeVariantId: 'gone', worktreeId: 'wt-1' })
  ).toBeNull()
  expect(createTab).not.toHaveBeenCalled()
})
it('returns null for a variant on a paired host workspace', () => {
  /* isWebRuntimeSessionActive → true */
})
it('keeps plain Claude free of Ollama env', () => {
  launchAgentInNewTab({ agent: 'claude', worktreeId: 'wt-1' })
  expect(queued.env?.ANTHROPIC_BASE_URL).toBeUndefined()
  expect(createdTab.claudeVariant).toBeUndefined()
})
```

Em `agent-launch-route-input.test.ts`: `tuiCustomization: { launchesClaudeVariant: true }` gera `requiresTuiLaunchCommand: true`.
Em `claude-ollama-variants.test.ts`: `withoutClaudeVariantModelOption({ <chave do modelo>: 'opus', effort: 'high' })` mantém só `effort`, e `undefined` devolve `undefined`.

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `pnpm test src/renderer/src/lib/launch-agent-in-new-tab.test.ts src/renderer/src/lib/agent-launch-route-input.test.ts`
Esperado: FAIL.

- [ ] **Passo 3: implementar**

Em `launchAgentInNewTabInternal`, logo depois de `agentEnv`: com `claudeVariantId`, devolver `null` se o agente não for `claude` ou se `resolveClaudeVariantLaunch` falhar; senão usar o `env` resolvido como `agentEnv`.
Com variante: passar `withoutClaudeVariantModelOption(...)` como `sessionOptions`, devolver `null` quando `isWebRuntimeSessionActive(runtimeEnvironmentId)`, passar `tuiCustomization: { cwd: initialCwd, launchesClaudeVariant: true }` ao `planAgentSessionLaunch`, forçar `viewMode: 'terminal'` no `initialViewModeProps` e passar `claudeVariant: mark` ao `createTab`.
Um `agentSessionLaunchPlan` recebido pronto continua valendo, e o chamador que o monta com variante passa `launchesClaudeVariant` (Tarefa 4).

- [ ] **Passo 4: rodar e ver passar**

Rodar: os testes do Passo 2, `pnpm test src/shared/claude-ollama-variants.test.ts` e `pnpm tc`
Esperado: PASS.

- [ ] **Passo 5: conferir o valor vazio no processo**

Ler o caminho do `env` do plano até o spawn do PTY (`src/renderer/src/components/terminal-pane/ipc-pty-spawn-request.ts` e o spawn no main).
Se algum ponto descartar valor vazio, colocar `ANTHROPIC_API_KEY` na lista `envToDelete` desse lançamento, com um teste que prove a remoção. Registrar no commit qual dos dois caminhos foi usado.

- [ ] **Passo 6: commit**

```bash
git commit -am "feat(agents): launch Ollama Claude variants in a terminal tab with their env"
```

---

### Task 4: Retomada, fork e continuação de uma aba de variante

**Arquivos:**

- Modificar: `src/shared/claude-ollama-variants.ts`
- Modificar: `src/renderer/src/lib/sleeping-agent-session-launch.ts` (linhas 76 a 83 e `createTab`, linha 101)
- Modificar: `src/renderer/src/components/terminal-pane/pty-connection/cold-restore-resume-startup.ts` (linhas 87 a 94)
- Modificar: `src/renderer/src/components/terminal-pane/terminal-agent-session-fork.ts` (`PreparedAgentSessionFork`, linha 27; `prepareAgentSessionForkFromPane`, linha 89; lançamento, linhas 233 a 255)
- Modificar: `src/renderer/src/lib/agent-session-continuation.ts` (`AgentSessionContinuationRequest`, linha 18), `src/renderer/src/components/terminal-pane/terminal-agent-session-continuation.ts`, `src/renderer/src/components/agent-session-continuation/AgentSessionContinuationDialog.tsx` (linha 132), `src/renderer/src/lib/launch-agent-session-continuation.ts` (linha 12)
- Testes: `src/shared/claude-ollama-variants.test.ts`, testes existentes de retomada dormente, de restauração a frio, de fork e de continuação

**Interfaces:**

- Consome: `ClaudeVariantMark`, `resolveClaudeVariantLaunch` (Tarefa 1), `claudeVariant` na aba e no registro (Tarefa 2), `claudeVariantId` no lançamento (Tarefa 3).
- Produz:
  - `function resolveResumeAgentLaunchEnv(args: { agent: TuiAgent; launchConfig: SleepingAgentLaunchConfig | undefined; claudeVariant: ClaudeVariantMark | null | undefined; settings: Pick<GlobalSettings, 'agentDefaultEnv' | 'claudeOllamaVariants'> | null | undefined }): { ok: true; env: Record<string, string> } | { ok: false }` em `src/shared/claude-ollama-variants.ts`.
  - `claudeVariantId: string | null` em `PreparedAgentSessionFork`.
  - `sourceClaudeVariantId?: string | null` em `AgentSessionContinuationRequest`.
  - `claudeVariantId?: string | null` em `LaunchAgentSessionContinuationArgs`.

- [ ] **Passo 1: escrever os testes que falham**

```ts
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
```

Nos testes de fluxo:

- Retomada dormente de um registro com `claudeVariant` e sem `launchConfig`, com a variante removida: `launchSleepingAgentSession` devolve `false`, mostra o aviso existente e não chama `createTab`.
- Retomada dormente com a variante presente: a aba criada tem `claudeVariant: mark`.
- Restauração a frio de uma aba marcada, sem `launchConfig` e com a variante removida: o plano de retomada é `null`.
- Fork de uma aba marcada: `launchAgentInNewTab` recebe `claudeVariantId: 'v1'`, e o `planAgentSessionLaunch` recebe `tuiCustomization.launchesClaudeVariant: true`.
- Continuação a partir de uma aba marcada com destino `claude`: `launchAgentInNewTab` recebe `claudeVariantId: 'v1'`. Com destino `codex`, não recebe.

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `pnpm test src/shared/claude-ollama-variants.test.ts` e os testes de fluxo tocados.
Esperado: FAIL.

- [ ] **Passo 3: implementar**

`resolveResumeAgentLaunchEnv`: `launchConfig` presente devolve `launchConfig.agentEnv`. Sem ele, com marca e agente `claude`, usa `resolveClaudeVariantLaunch` com `baseEnv` de `resolveTuiAgentLaunchEnv('claude', settings.agentDefaultEnv)`. Sem marca, devolve `resolveTuiAgentLaunchEnv(agent, settings?.agentDefaultEnv)`.
Retomada dormente e restauração a frio trocam o ternário de `agentEnv` por essa função e abortam quando ela falha. A restauração a frio lê a marca da aba que está sendo restaurada.
`launchSleepingAgentSession` passa `claudeVariant: record.claudeVariant` ao `createTab`.
Fork: `prepareAgentSessionForkFromPane` lê `claudeVariant` da aba de origem e preenche `claudeVariantId` só quando o agente resolvido é `claude`.
Continuação: `prepareAgentSessionContinuationFromPane` preenche `sourceClaudeVariantId`. O diálogo repassa o id só quando `selectedAgent === 'claude'`, e `launchAgentSessionContinuation` o encaminha ao `launchAgentInNewTab`.
A retomada pelo AI Vault (`src/renderer/src/lib/ai-vault-resume-command.ts`) não muda.

- [ ] **Passo 4: rodar e ver passar**

Rodar: os testes do Passo 2 e `pnpm tc`
Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git commit -am "feat(agents): keep Ollama variant sessions on Ollama across resume, fork and continuation"
```

---

### Task 5: Cadastro de variantes em Settings, Agents

**Arquivos:**

- Criar: `src/renderer/src/components/settings/ClaudeOllamaVariantsEditor.tsx`
- Criar: `src/renderer/src/components/settings/ClaudeOllamaVariantsEditor.test.tsx`
- Modificar: `src/renderer/src/components/settings/AgentCatalogRow.tsx` (props, linhas 74 a 96, e o bloco expandido, linhas 216 a 225)
- Modificar: `src/renderer/src/components/settings/AgentsPane.tsx` (linhas 182 a 236)
- Modificar: os arquivos de locale em `src/renderer/src/i18n/locales/`, pelo fluxo de tradução existente

**Interfaces:**

- Consome: `ClaudeOllamaVariant`, `validateClaudeOllamaVariantDraft`, `MAX_CLAUDE_OLLAMA_VARIANTS` (Tarefa 1); `createBrowserUuid` (`src/renderer/src/lib/browser-uuid.ts`).
- Produz:
  - `function ClaudeOllamaVariantsEditor(props: { variants: readonly ClaudeOllamaVariant[]; onSave: (next: ClaudeOllamaVariant[]) => void }): React.JSX.Element`
  - Prop `extraSettings?: React.ReactNode` em `AgentCatalogRow`, renderizada no fim do bloco expandido, depois do editor de Environment.

- [ ] **Passo 1: escrever os testes que falham**

Com `@testing-library/react`, no padrão dos testes de componente de `src/renderer/src/components/settings/`:

- Adicionar com nome "Kimi K3.1", modelo `kimi-k3.1-pro:cloud` e 1M marcado chama `onSave` com um item de `id` não vazio e esses valores.
- Modelo `kimi[1m]` mostra erro no campo do modelo e não chama `onSave`.
- Editar o nome de um item chama `onSave` com o mesmo `id` e o nome novo.
- Remover chama `onSave` sem o item.
- Com 20 itens, o botão de adicionar fica desabilitado.

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `pnpm test src/renderer/src/components/settings/ClaudeOllamaVariantsEditor.test.tsx`
Esperado: FAIL.

- [ ] **Passo 3: implementar o editor**

Lista com nome, modelo, um selo "1M" quando ligado e os botões Edit e Remove. Formulário inline para adicionar e editar, com `Input`, `Checkbox` e `Button` de `components/ui/`.
Layout do spec, seção "Cadastro em Settings". Título da seção: "Ollama models".

- [ ] **Passo 4: ligar no painel**

Em `AgentsPane`, para `agent.id === 'claude'`, passar `extraSettings={<ClaudeOllamaVariantsEditor variants={settings.claudeOllamaVariants ?? []} onSave={(next) => updateSettings({ claudeOllamaVariants: next })} />}`.

- [ ] **Passo 5: rodar e ver passar**

Rodar: o teste do Passo 2, `pnpm tc`, `pnpm run check:code-quality:changed` e `pnpm lint` só nos arquivos tocados, via `oxlint <arquivos>`.
Esperado: PASS, sem aviso do guia de estilo.

- [ ] **Passo 6: commit**

```bash
git commit -am "feat(settings): add the Ollama models editor to the Claude agent row"
```

---

### Task 6: Variantes nos seletores da barra de abas

**Arquivos:**

- Modificar: `src/renderer/src/components/tab-bar/tab-agent-launch-options.ts`
- Modificar: `src/renderer/src/components/tab-bar/use-tab-bar-runtime-model.ts` (linhas 144 a 160)
- Modificar: `src/renderer/src/components/tab-bar/use-tab-bar-create-menu-controller.ts` (linhas 34 e 223 a 249)
- Modificar: `src/renderer/src/components/tab-bar/TabBarCreateEntry.tsx` (linhas 52, 236 a 246, 388 a 399, e `getActiveOptionId`)
- Modificar: `src/renderer/src/components/tab-bar/tab-bar-surface.tsx` (linha 236)
- Modificar: `src/renderer/src/components/tab-bar/QuickLaunchButton.tsx` (linhas 133 a 233)
- Testes: `src/renderer/src/components/tab-bar/tab-agent-launch-options.test.ts`, teste existente do `QuickLaunchButton`

**Interfaces:**

- Consome: `ClaudeOllamaVariant` (Tarefa 1), `claudeVariantId` em `launchAgentInNewTab` (Tarefa 3).
- Produz:
  - `claudeVariantId?: string` em `TabAgentLaunchOption`.
  - `buildTabAgentLaunchOptions(agents, commandOverrides = {}, claudeVariants: readonly ClaudeOllamaVariant[] = [])`, que insere uma opção por variante logo depois da opção `claude`, só quando `claude` está em `agents`.
  - `launchAgentFromNewTabEntry: (option: TabAgentLaunchOption) => void` e `onLaunchAgent?: (option: TabAgentLaunchOption) => void`.

- [ ] **Passo 1: escrever os testes que falham**

```ts
it('lists each variant right after Claude', () => {
  const options = buildTabAgentLaunchOptions(['claude', 'codex'], {}, [kimi])
  expect(options.map((o) => [o.agent, o.label, o.claudeVariantId])).toEqual([
    ['claude', 'Claude', undefined],
    ['claude', 'Kimi K3.1', 'v1'],
    ['codex', 'Codex', undefined]
  ])
})
it('hides variants when Claude is not offered', () => {
  expect(buildTabAgentLaunchOptions(['codex'], {}, [kimi]).some((o) => o.claudeVariantId)).toBe(
    false
  )
})
it('matches a variant by label and by model', () => {
  const options = buildTabAgentLaunchOptions(['claude'], {}, [kimi])
  expect(findMatchingTabAgentLaunchOptions('kimi', options)[0]?.claudeVariantId).toBe('v1')
  expect(findMatchingTabAgentLaunchOptions('k3.1-pro', options)[0]?.claudeVariantId).toBe('v1')
})
```

No teste do `QuickLaunchButton`: com Claude detectado e `claudeOllamaVariants = [kimi]`, aparece o item "Kimi K3.1", e selecioná-lo chama `launchAgentInNewTab` com `agent: 'claude'` e `claudeVariantId: 'v1'`. Com o workspace em host pareado, o item não aparece.

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `pnpm test src/renderer/src/components/tab-bar`
Esperado: FAIL.

- [ ] **Passo 3: implementar**

Aliases da variante: `label` e `model`, normalizados e compactados pelas funções já existentes no arquivo.
`use-tab-bar-runtime-model.ts` lê `claudeOllamaVariants` e passa `[]` quando `isWebRuntimeSessionActive(activeRuntimeEnvironmentId)` é verdadeiro.
`QuickLaunchAgentMenuItems` renderiza um `DropdownMenuItem` por variante depois do Claude, com `AgentIcon agent="claude"`, `key={`claude-variant:${id}`}`, e chama `runLaunch('claude', variant.id)`. Como o componente também serve ao menu de envio de notas de revisão (`ReviewNotesSendMenuContent.tsx`), as variantes aparecem lá também.
`getActiveOptionId` inclui o `claudeVariantId` para que Claude e variantes tenham ids distintos.
O bloqueio por lançamento estruturado pendente não se aplica a variantes, que sempre usam terminal.

- [ ] **Passo 4: rodar e ver passar**

Rodar: `pnpm test src/renderer/src/components/tab-bar`, `pnpm tc` e `pnpm run check:code-quality:changed`
Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git commit -am "feat(tab-bar): offer Ollama Claude variants in the new tab menu"
```

---

### Task 7: Variantes no compositor de novo workspace

**Arquivos:**

- Modificar: `src/renderer/src/components/NewWorkspaceComposerCard.tsx` (linhas 162 a 173 e o seletor de agentes que consome `visibleQuickAgents`)
- Modificar: o estado de identidade do compositor, onde `tuiAgent` mora: `src/renderer/src/hooks/composer-state/workspace-identity-state.ts`, `composer-card-contract.ts`, `composer-card-props.ts`, `composer-target-state.ts` (linha 182)
- Modificar: os três planos de início: `src/renderer/src/hooks/composer-state/quick-startup-plan.ts` (linhas 59 a 92), `full-submit-preparation.ts` (linhas 181 a 224), `folder-submit-orchestration.ts` (linha 127)
- Modificar: a criação da aba do agente e a decisão de rota estruturada no envio, em `full-creation-execution.ts`, `full-creation-startup.ts` e `full-creation-structured-launch.ts`
- Testes: testes existentes de `full-submit-orchestration`, `full-creation-execution` e `folder-workspace-composer-submit`

**Interfaces:**

- Consome: `resolveClaudeVariantLaunch`, `withoutClaudeVariantModelOption` (Tarefas 1 e 3), opção `claudeVariant` de `createTab` (Tarefa 2), `launchesClaudeVariant` (Tarefa 3).
- Produz: `claudeVariantId: string | null` no estado de identidade do compositor, ao lado de `tuiAgent`. Escolher uma variante grava `tuiAgent: 'claude'` e o id. Escolher qualquer outro agente, ou o Claude puro, zera o id.

- [ ] **Passo 1: escrever os testes que falham**

- Envio completo com `tuiAgent: 'claude'` e `claudeVariantId: 'v1'`: o `backendStartup.env` contém `ANTHROPIC_BASE_URL: 'http://localhost:11434'`, o comando não contém `--model`, a rota é terminal e a aba criada tem `claudeVariant: mark`.
- Envio de workspace de pasta com variante: o `agentEnv` do plano contém o ambiente do Ollama.
- Envio com `claudeVariantId: 'gone'`: o envio cria o workspace e não lança agente, com o aviso existente de falha de lançamento.
- Envio com Claude puro: nenhum `ANTHROPIC_BASE_URL` no ambiente.

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `pnpm test src/renderer/src/hooks/composer-state src/renderer/src/components/sidebar/folder-workspace-composer-submit.test.ts`
Esperado: FAIL.

- [ ] **Passo 3: implementar**

No seletor, cada variante aparece logo depois do Claude, só quando o Claude está em `visibleQuickAgents` e o workspace alvo não é de host pareado, com o nome cadastrado e o ícone do Claude. Uma variante selecionada aparece como selecionada, e o Claude puro não.
Nos três planos de início, com `claudeVariantId`, trocar `resolveTuiAgentLaunchEnv(...)` pelo `env` de `resolveClaudeVariantLaunch` e `sessionOptions` por `withoutClaudeVariantModelOption(sessionOptions)`. Falha de resolução vira plano `null`.
Na rota de envio, a variante força terminal pelo mesmo `launchesClaudeVariant`, e a aba do agente recebe `claudeVariant`.

- [ ] **Passo 4: rodar e ver passar**

Rodar: os testes do Passo 2, `pnpm tc` e `pnpm run check:code-quality:changed`
Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git commit -am "feat(composer): let the new workspace composer launch Ollama Claude variants"
```

---

### Task 8: Verificação final e documentação

**Arquivos:**

- Modificar: `specs/orca-claude-ollama-variants-design.md`, `docs/adr/0004-variantes-claude-ollama.md`, `specs/epics/EP-04-variantes-claude-ollama.md` (status)
- Modificar: `TODO.md`

- [ ] **Passo 1: suíte completa dos módulos tocados**

Rodar: `pnpm tc`, `pnpm test src/shared src/renderer/src/lib src/renderer/src/components/tab-bar src/renderer/src/components/settings src/renderer/src/hooks/composer-state src/renderer/src/store src/main/persistence` e `pnpm run check:code-quality:changed`
Esperado: tudo verde. Falha preexistente, conferida na `main`, é registrada no `TODO.md` e não bloqueia.

- [ ] **Passo 2: checagem real no app, em segundo plano**

Com `ORCA_BACKGROUND_LAUNCH=1` e a skill `$electron` com Playwright CDP (sem computer-use), abrir o Orca de desenvolvimento, cadastrar "DeepSeek Flash" com `deepseek-v4.1-flash:cloud`, abrir pela barra de abas e capturar a tela do renderer oculto.
Conferir no terminal da aba, com `echo $ANTHROPIC_BASE_URL` numa aba aberta pela variante e numa aba de terminal comum, que só a primeira tem o valor.
Conferir que uma aba do Claude puro aberta ao lado não tem as variáveis.
Se houver worktree SSH disponível, repetir num worktree remoto (Foco da revisão, item 4). Sem SSH, registrar a verificação pendente no `TODO.md`.

- [ ] **Passo 3: atualizar status e TODO**

Status do design, do ADR e do épico: "implementado em dd/MM/yyyy".
No `TODO.md`, mover o item de implementação para uma seção `## Variantes Ollama, finalizado em dd/mm/aaaa` e acrescentar em "Pendentes de ação sua" o teste do usuário: cadastrar os dois modelos, abrir cada um e conferir resposta do Ollama.

- [ ] **Passo 4: commit**

```bash
git commit -am "docs(ollama): mark the Ollama Claude variants as implemented"
```
