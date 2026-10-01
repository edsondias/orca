# Orca no Android Auto, fase 1: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIO: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** o carro anuncia quando um agente de terminal bloqueia, termina ou encerra, e o usuário destrava o agente por voz, com eco do Android Auto e recibo.

**Arquitetura:** o desktop anexa ao evento de notificação mobile uma referência ao prompt com uma guarda (`fence`). O celular, numa sessão de carro mantida por um serviço em primeiro plano, consome o stream `notifications.subscribe`, publica notificações `MessagingStyle` por um módulo Kotlin novo e devolve a resposta por um método RPC novo que só escreve no PTY se a guarda ainda for a atual.

**Stack:** TypeScript (Electron main, React Native/Expo 55), zod, vitest, Kotlin com `androidx.core` e `androidx.car.app`, JUnit 4.

**Spec:** [specs/orca-android-auto-design.md](../orca-android-auto-design.md), com as correções da Tarefa 12.

## Restrições globais

- Node 24 para o desktop; `pnpm install --config.node-linker=hoisted` em `mobile/` no Windows.
- minSdk 24, compileSdk 36, targetSdk 36, Kotlin 2.1.20, AGP 8.12.0 (valores efetivos do prebuild).
- Pacote Android `com.stably.orca.mobile`.
- Campos novos no que o host publica são opcionais e aditivos (`docs/reference/remote-wire-compatibility.md`).
- Vocabulário de veredito: `live`, `unverifiable`, `exited`, sem sinônimos (`docs/reference/ssh-execution-boundary.md`).
- O host de execução é o dono do status do agente (`docs/reference/agent-status-store.md`).
- Nada de nomes `helpers`, `utils`, `common` ou `misc`.
- Comentários de uma linha, só o porquê não óbvio.
- Sem type assertion, exceto `as const`; cast inevitável leva `// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: ...`.
- O mobile não tem i18n: textos do carro são literais em inglês, concentrados em `mobile/src/car/car-copy.ts`.
- O mobile chama RPC só por `bindDeferredRpcOperation`; `client.subscribe` novo exige entrada em `mobile/src/transport/rpc-subscription-inventory.ts`.
- Respostas nunca ficam em fila durante queda de conexão.
- O `connection-log` nunca registra o texto de uma resposta.

## Foco de revisão

- Resposta que chega depois de o agente ter seguido para outro prompt: nada pode ser escrito no PTY (Tarefas 1 e 2).
- Agente reiniciado na mesma aba, com a `permissionSequence` de volta a zero: a guarda precisa recusar por `generation` (Tarefa 1).
- Bloqueio que chega só pelo hook HTTP, como no Claude Code: a guarda precisa usar o `stateStartedAt` do hook (Tarefa 1).
- Host SSH sem contato no momento da resposta: o recibo diz `unverifiable`, nunca "encerrado" (Tarefa 9).
- Android Auto entregando a mesma resposta duas vezes: só um envio (Tarefa 7).

## Mapa de arquivos

**Desktop**

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/shared/terminal-agent-prompt-fence.ts` | criar | tipo `TerminalAgentPromptFence` e comparação pura |
| `src/main/runtime/orca-runtime-agent-prompt-request-correlation.ts` | modificar | `getTerminalAgentPromptFence`, `replyToTerminalAgentPrompt`, `resolveMobileNotificationPromptRef` |
| `src/shared/rpc-contract/terminal-unary-params.ts` | modificar | schema `TerminalReplyToAgentPrompt` |
| `src/main/runtime/rpc/methods/terminal/terminal-reply-to-agent-prompt-method.ts` | criar | método `terminal.replyToAgentPrompt` |
| `src/main/runtime/rpc/methods/terminal.ts` | modificar | registrar o método |
| `src/main/runtime/runtime-rpc/runtime-rpc-mobile-method-allowlist.ts` | modificar | liberar o método ao mobile |
| `src/shared/mobile-notification-prompt-ref.ts` | criar | tipo `MobileNotificationPromptRef` |
| `src/main/runtime/runtime-mobile-notification-controller.ts` | modificar | `promptRef` e `source: 'agent-exited'` |
| `src/main/notifications/notification-delivery-service.ts` | modificar | anexar `promptRef` |
| `src/main/ipc/notifications.ts` | modificar | ligar o resolvedor ao runtime |
| `src/shared/notification-settings-types.ts` | modificar | `agentSessionId` no pedido |
| `src/renderer/src/components/native-chat/structured-attention-dispatch.ts` | modificar | enviar `agentSessionId` |
| `src/main/runtime/orca-runtime-emit-daemon-pty-transient-fact.ts` | modificar | aviso mobile de agente encerrado |

**Mobile**

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `mobile/plugins/with-android-auto.js` | criar | manifesto, XML do Android Auto, serviço e permissões |
| `mobile/modules/orca-car-messaging/**` | criar | módulo Kotlin: notificações, receptor, serviço, `CarConnection` |
| `mobile/src/car/car-copy.ts` | criar | textos do carro |
| `mobile/src/car/car-session-store.ts` | criar | estado da sessão de carro |
| `mobile/src/car/car-reply-normalization.ts` | criar | voz para tecla ou texto, deduplicação |
| `mobile/src/car/car-conversation-store.ts` | criar | conversas por agente |
| `mobile/src/car/car-reply-operations.ts` | criar | operação RPC `terminal.replyToAgentPrompt` |
| `mobile/src/car/car-reply-router.ts` | criar | envio e recibos |
| `mobile/src/car/car-session-bridge.ts` | criar | liga stream, módulo nativo e roteador |
| `mobile/src/transport/host-logical-client.ts` | modificar | manter a conexão com a sessão ativa |
| `mobile/src/storage/preferences.ts` | modificar | preferência "Car mode" |
| `mobile/src/settings/car-settings-screen.tsx` | criar | interruptor "Car mode" |
| `mobile/scripts/mock-server-car-scenario.ts` | criar | cenário `MOCK_CAR=1` |

---

### Tarefa 1: guarda do prompt de terminal no runtime

**Arquivos:**
- Criar: `src/shared/terminal-agent-prompt-fence.ts`
- Criar: `src/shared/terminal-agent-prompt-fence.test.ts`
- Modificar: `src/main/runtime/orca-runtime-agent-prompt-request-correlation.ts` (classe que já tem `getTerminalPromptRequestBinding`, linhas 23-40)
- Criar: `src/main/runtime/terminal-agent-prompt-reply.test.ts`

**Interfaces:**
- Produz: `type TerminalAgentPromptFence = { generation: number; permissionSequence: number; blockedSince: number | null; promptKey: string | null }`
- Produz: `isTerminalAgentPromptFenceCurrent(expected: TerminalAgentPromptFence, current: TerminalAgentPromptFence | null): boolean`
- Produz no runtime: `getTerminalAgentPromptFence(handle: string): TerminalAgentPromptFence | null`
- Produz no runtime: `replyToTerminalAgentPrompt(handle: string, expected: TerminalAgentPromptFence, action: { text: string; enter: boolean }, options?: { signal?: AbortSignal }): Promise<void>`, que rejeita com `Error('agent_prompt_changed')` sem escrever.

- [ ] **Passo 1: escrever o teste da comparação pura**

```ts
// src/shared/terminal-agent-prompt-fence.test.ts
import { describe, expect, it } from 'vitest'
import { isTerminalAgentPromptFenceCurrent } from './terminal-agent-prompt-fence'

const fence = { generation: 3, permissionSequence: 2, blockedSince: 1000, promptKey: null }

describe('isTerminalAgentPromptFenceCurrent', () => {
  it('accepts the same prompt', () => {
    expect(isTerminalAgentPromptFenceCurrent(fence, { ...fence })).toBe(true)
  })
  it('refuses when the agent is no longer blocked', () => {
    expect(isTerminalAgentPromptFenceCurrent(fence, null)).toBe(false)
  })
  it('refuses a respawned pty even when the sequence restarted at the same value', () => {
    expect(isTerminalAgentPromptFenceCurrent(fence, { ...fence, generation: 4 })).toBe(false)
  })
  it('refuses a newer OSC permission prompt', () => {
    expect(isTerminalAgentPromptFenceCurrent(fence, { ...fence, permissionSequence: 3 })).toBe(false)
  })
  it('refuses a newer hook-reported block', () => {
    expect(isTerminalAgentPromptFenceCurrent(fence, { ...fence, blockedSince: 2000, promptKey: null })).toBe(false)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `pnpm test src/shared/terminal-agent-prompt-fence.test.ts`
Esperado: FAIL, módulo `./terminal-agent-prompt-fence` não encontrado.

- [ ] **Passo 3: implementar o tipo e a comparação**

```ts
// src/shared/terminal-agent-prompt-fence.ts
/** Identity of one pending agent prompt on a terminal, as the execution host saw it. */
export type TerminalAgentPromptFence = {
  /** PTY lifecycle generation; a respawn resets permissionSequence, so both are compared. */
  generation: number
  /** OSC/title permission observations on this PTY. */
  permissionSequence: number
  /** Hook-reported stateStartedAt of the blocked state; hook blocks never bump permissionSequence. */
  blockedSince: number | null
}

export function isTerminalAgentPromptFenceCurrent(
  expected: TerminalAgentPromptFence,
  current: TerminalAgentPromptFence | null
): boolean {
  return (
    current !== null &&
    current.generation === expected.generation &&
    current.permissionSequence === expected.permissionSequence &&
    current.blockedSince === expected.blockedSince
  )
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `pnpm test src/shared/terminal-agent-prompt-fence.test.ts`
Esperado: PASS, 5 testes.

- [ ] **Passo 5: escrever o teste de runtime**

Usar a fixture `createAgentPromptSubmissionRuntime` de `src/main/runtime/agent-prompt-submission-runtime-test-fixture.ts:8-28`. A preparação do terminal e a injeção do título de permissão seguem `src/main/runtime/agent-prompt-submission-runtime.test.ts:113-140`; copie dali a criação do terminal e o `runtime.onPtyData('pty-prompt', '\x1b]0;Codex waiting for permission\x07', Date.now())`.

```ts
// src/main/runtime/terminal-agent-prompt-reply.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createAgentPromptSubmissionRuntime } from './agent-prompt-submission-runtime-test-fixture'

async function blockedRuntime() {
  const writes: string[] = []
  const fixture = createAgentPromptSubmissionRuntime((data: string) => writes.push(data), 'codex')
  // Prepare o terminal 'pty-prompt' exatamente como em agent-prompt-submission-runtime.test.ts:113-140.
  const { runtime, handle } = await fixture
  runtime.onPtyData('pty-prompt', '\x1b]0;Codex waiting for permission\x07', Date.now())
  return { runtime, handle, writes }
}

describe('replyToTerminalAgentPrompt', () => {
  it('writes when the prompt is still the one the phone saw', async () => {
    const { runtime, handle, writes } = await blockedRuntime()
    const fence = runtime.getTerminalAgentPromptFence(handle)
    expect(fence).not.toBeNull()
    await runtime.replyToTerminalAgentPrompt(handle, fence!, { text: '1', enter: false })
    expect(writes.join('')).toContain('1')
  })

  it('writes nothing after a newer permission prompt', async () => {
    const { runtime, handle, writes } = await blockedRuntime()
    const fence = runtime.getTerminalAgentPromptFence(handle)!
    runtime.onPtyData('pty-prompt', '\x1b]0;Codex working\x07', Date.now())
    runtime.onPtyData('pty-prompt', '\x1b]0;Codex waiting for permission\x07', Date.now())
    const before = writes.length
    await expect(
      runtime.replyToTerminalAgentPrompt(handle, fence, { text: '1', enter: false })
    ).rejects.toThrow('agent_prompt_changed')
    expect(writes.length).toBe(before)
  })

  it('reports no fence for an agent that is not blocked', async () => {
    const { runtime, handle } = await blockedRuntime()
    runtime.onPtyData('pty-prompt', '\x1b]0;Codex working\x07', Date.now())
    expect(runtime.getTerminalAgentPromptFence(handle)).toBeNull()
  })
})
```

Se a fixture retornar outra forma, ajuste só a desestruturação, mantendo os três cenários. Não use `!` fora de teste.

- [ ] **Passo 6: rodar e ver falhar**

Rodar: `pnpm test src/main/runtime/terminal-agent-prompt-reply.test.ts`
Esperado: FAIL, `getTerminalAgentPromptFence is not a function`.

- [ ] **Passo 7: implementar no runtime**

Em `orca-runtime-agent-prompt-request-correlation.ts`, na mesma classe de `getTerminalPromptRequestBinding`, acrescente:

```ts
import {
  isTerminalAgentPromptFenceCurrent,
  type TerminalAgentPromptFence
} from '../../shared/terminal-agent-prompt-fence'

  getTerminalAgentPromptFence(handle: string): TerminalAgentPromptFence | null {
    const binding = this.getTerminalPromptRequestBinding(handle)
    const activity = this.getAgentPromptActivity(handle, binding.ptyId)
    const hookRow = this.findHookAgentStatusForHandle(handle)
    const blocked = hookRow
      ? hookRow.state === 'blocked' || hookRow.state === 'waiting'
      : activity.status === 'permission'
    if (!blocked) {
      return null
    }
    return {
      generation: binding.generation,
      permissionSequence: activity.permissionSequence,
      blockedSince: hookRow?.stateStartedAt ?? null
    }
  }

  async replyToTerminalAgentPrompt(
    handle: string,
    expected: TerminalAgentPromptFence,
    action: { text: string; enter: boolean },
    options: { signal?: AbortSignal } = {}
  ): Promise<void> {
    await this.sendTerminal(
      handle,
      { text: action.text, enter: action.enter },
      {
        signal: options.signal,
        inputKind: 'driving',
        // Checked at write time so a prompt that changed after the phone read it is never answered.
        beforeWrite: () => {
          if (!isTerminalAgentPromptFenceCurrent(expected, this.getTerminalAgentPromptFence(handle))) {
            throw new Error('agent_prompt_changed')
          }
        }
      }
    )
  }

  protected findHookAgentStatusForHandle(handle: string): AgentStatusIpcPayload | null {
    return (this.getAgentStatusSnapshotFn?.() ?? []).find((row) => row.terminalHandle === handle) ?? null
  }
```

Importe `AgentStatusIpcPayload` de `../../shared/agent-status-ipc-payload`. Confirme em `orca-runtime-controller-knows-pty-is-live.ts:94-152` que uma exceção em `beforeWrite` impede a escrita e rejeita a promessa; o segundo teste do Passo 5 prova isso.

- [ ] **Passo 8: rodar e ver passar**

Rodar: `pnpm test src/main/runtime/terminal-agent-prompt-reply.test.ts src/shared/terminal-agent-prompt-fence.test.ts`
Esperado: PASS.

- [ ] **Passo 9: typecheck e commit**

Rodar: `pnpm tc:node`
Esperado: sem erros.

```bash
git add src/shared/terminal-agent-prompt-fence.ts src/shared/terminal-agent-prompt-fence.test.ts src/main/runtime/orca-runtime-agent-prompt-request-correlation.ts src/main/runtime/terminal-agent-prompt-reply.test.ts
git commit -m "feat(runtime): guard terminal agent prompt replies with a host-side fence"
```

---

### Tarefa 2: método RPC `terminal.replyToAgentPrompt`

**Arquivos:**
- Modificar: `src/shared/rpc-contract/terminal-unary-params.ts` (perto de `TerminalSend`, linhas 102-133)
- Criar: `src/main/runtime/rpc/methods/terminal/terminal-reply-to-agent-prompt-method.ts`
- Modificar: `src/main/runtime/rpc/methods/terminal.ts` (lista `TERMINAL_METHODS`, linhas 14-23)
- Modificar: `src/main/runtime/rpc/methods/terminal/terminal-manifest-characterization.test.ts` (lista `METHOD_CASES` e o total 37, linhas 11-53 e 72-76)
- Modificar: `src/main/runtime/runtime-rpc/runtime-rpc-mobile-method-allowlist.ts` (junto de `'terminal.send'`, linha 283)
- Criar: `src/main/runtime/rpc/terminal-reply-to-agent-prompt.test.ts`
- Regenerar: `src/shared/rpc-contract/rpc-params-catalog.generated.ts`

**Interfaces:**
- Consome: `runtime.replyToTerminalAgentPrompt` (Tarefa 1)
- Produz: método `terminal.replyToAgentPrompt`, params `{ terminal: string; fence: TerminalAgentPromptFence; text: string; enter: boolean }`, resultado `{ delivered: true } | { delivered: false; reason: 'prompt-changed' | 'prompt-changed-after-text' }`
- Consome da Tarefa 1 (correção pós-revisão): a guarda tem também `promptKey: string | null`, e o runtime rejeita com `agent_prompt_changed_after_text` quando o texto já foi escrito mas o Enter foi retido. Acrescente um teste que mapeia esse erro para `{ delivered: false, reason: 'prompt-changed-after-text' }`.

- [ ] **Passo 1: escrever o teste do método**

```ts
// src/main/runtime/rpc/terminal-reply-to-agent-prompt.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../orca-runtime'
import { RpcDispatcher } from './dispatcher'
import { TERMINAL_METHODS } from './methods/terminal'

const fence = { generation: 1, permissionSequence: 2, blockedSince: null, promptKey: null }

function dispatcherWith(reply: ReturnType<typeof vi.fn>) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the method under test only touches these two members.
  const runtime = { getRuntimeId: () => 'test-runtime', replyToTerminalAgentPrompt: reply } as unknown as OrcaRuntimeService
  return new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })
}

describe('terminal.replyToAgentPrompt', () => {
  it('delivers when the host fence matches', async () => {
    const reply = vi.fn().mockResolvedValue(undefined)
    const response = await dispatcherWith(reply).dispatch({
      id: 'r1', authToken: 'tok', method: 'terminal.replyToAgentPrompt',
      params: { terminal: 't1', fence, text: '1', enter: false }
    })
    expect(response).toMatchObject({ ok: true, result: { delivered: true } })
    expect(reply).toHaveBeenCalledWith('t1', fence, { text: '1', enter: false }, expect.anything())
  })

  it('reports prompt-changed instead of failing', async () => {
    const reply = vi.fn().mockRejectedValue(new Error('agent_prompt_changed'))
    const response = await dispatcherWith(reply).dispatch({
      id: 'r2', authToken: 'tok', method: 'terminal.replyToAgentPrompt',
      params: { terminal: 't1', fence, text: '1', enter: false }
    })
    expect(response).toMatchObject({ ok: true, result: { delivered: false, reason: 'prompt-changed' } })
  })

  it('rejects text over 500 characters', async () => {
    const response = await dispatcherWith(vi.fn()).dispatch({
      id: 'r3', authToken: 'tok', method: 'terminal.replyToAgentPrompt',
      params: { terminal: 't1', fence, text: 'x'.repeat(501), enter: true }
    })
    expect(response.ok).toBe(false)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `pnpm test src/main/runtime/rpc/terminal-reply-to-agent-prompt.test.ts`
Esperado: FAIL com `method_not_found`.

- [ ] **Passo 3: schema**

Em `terminal-unary-params.ts`, depois de `TerminalSend`:

```ts
export const TerminalAgentPromptFenceParams = z
  .object({
    generation: z.number().int().nonnegative(),
    permissionSequence: z.number().int().nonnegative(),
    blockedSince: z.number().int().nonnegative().nullable(),
    promptKey: z.string().max(64).nullable()
  })
  .strict()

export const TerminalReplyToAgentPrompt = TerminalHandle.extend({
  fence: TerminalAgentPromptFenceParams,
  text: z.string().min(1).max(500),
  enter: z.boolean()
})
```

Reexporte `TerminalReplyToAgentPrompt` em `src/main/runtime/rpc/methods/terminal/unary-schemas.ts`, como `TerminalSend`.

- [ ] **Passo 4: método**

```ts
// src/main/runtime/rpc/methods/terminal/terminal-reply-to-agent-prompt-method.ts
import { defineMethod } from '../../core'
import { TerminalReplyToAgentPrompt } from './unary-schemas'

export const TERMINAL_REPLY_TO_AGENT_PROMPT_METHODS = [
  defineMethod({
    name: 'terminal.replyToAgentPrompt',
    params: TerminalReplyToAgentPrompt,
    handler: async (params, { runtime, signal }) => {
      try {
        await runtime.replyToTerminalAgentPrompt(
          params.terminal,
          params.fence,
          { text: params.text, enter: params.enter },
          { signal }
        )
        return { delivered: true as const }
      } catch (error) {
        if (error instanceof Error && error.message === 'agent_prompt_changed') {
          return { delivered: false as const, reason: 'prompt-changed' as const }
        }
        // The text reached the agent's input but the Enter was withheld because the prompt moved on.
        if (error instanceof Error && error.message === 'agent_prompt_changed_after_text') {
          return { delivered: false as const, reason: 'prompt-changed-after-text' as const }
        }
        throw error
      }
    }
  })
]
```

Use o mesmo import de `defineMethod` que `terminal-send-method.ts` usa; se o contexto do handler não expuser `signal`, siga a forma de `terminal-send-method.ts:22-60`.

- [ ] **Passo 5: registrar, catalogar e liberar**

Em `methods/terminal.ts`, acrescente `...TERMINAL_REPLY_TO_AGENT_PROMPT_METHODS` a `TERMINAL_METHODS`.
Em `terminal-manifest-characterization.test.ts`, acrescente `'terminal.replyToAgentPrompt'` na posição em que ele aparece no registro e troque o total de 37 para 38.
No allowlist, logo depois de `'terminal.send',`, acrescente `'terminal.replyToAgentPrompt',`.

Rodar: `pnpm run generate:rpc-params-catalog`
Esperado: `rpc-params-catalog.generated.ts` passa a conter `terminal.replyToAgentPrompt`.

- [ ] **Passo 6: rodar os testes**

Rodar: `pnpm test src/main/runtime/rpc/terminal-reply-to-agent-prompt.test.ts src/main/runtime/rpc/methods/terminal/terminal-manifest-characterization.test.ts src/main/runtime/mobile-rpc-allowlist.test.ts src/main/runtime/runtime-rpc-mobile-method-allowlist.test.ts`
Esperado: PASS.

- [ ] **Passo 7: commit**

```bash
git add src/shared/rpc-contract src/main/runtime/rpc src/main/runtime/runtime-rpc/runtime-rpc-mobile-method-allowlist.ts
git commit -m "feat(rpc): add terminal.replyToAgentPrompt for fenced prompt replies"
```

---

### Tarefa 3: `promptRef` e aviso de agente encerrado no evento mobile

**Arquivos:**
- Criar: `src/shared/mobile-notification-prompt-ref.ts`
- Modificar: `src/main/runtime/runtime-mobile-notification-controller.ts:16-32`
- Modificar: `src/main/runtime/orca-runtime-agent-prompt-request-correlation.ts`
- Modificar: `src/shared/notification-settings-types.ts:27-54`
- Modificar: `src/main/notifications/notification-delivery-service.ts:18-40,91-118`
- Modificar: `src/main/ipc/notifications.ts:121-151`
- Modificar: `src/renderer/src/components/native-chat/structured-attention-dispatch.ts:97-121`
- Modificar: `src/main/runtime/orca-runtime-emit-daemon-pty-transient-fact.ts`
- Testes: `src/main/notifications/notification-delivery-service.test.ts`, `src/main/runtime/push/push-dispatcher.test.ts`, `src/main/runtime/mobile-notification-prompt-ref.test.ts`

**Interfaces:**
- Consome: `getTerminalAgentPromptFence` (Tarefa 1)
- Produz:

```ts
export type MobileNotificationPromptRef =
  | {
      kind: 'terminal'
      terminalHandle: string
      fence: TerminalAgentPromptFence
      /** Inputs for the phone's existing permission parser; lastAssistantMessage is capped at 4000 chars. */
      permission?: { interactivePrompt?: string; lastAssistantMessage?: string }
    }
  | { kind: 'structured'; sessionId: string }
```

- Produz: `MobileNotificationDispatchEvent.promptRef?: MobileNotificationPromptRef` e `source` com o valor `'agent-exited'`.
- Produz no runtime: `resolveMobileNotificationPromptRef(paneKey: string): MobileNotificationPromptRef | undefined`.

- [ ] **Passo 1: testes que falham**

Em `notification-delivery-service.test.ts`, use o harness das linhas 50-77 e acrescente:

```ts
it('attaches the prompt reference the runtime resolves for the pane', async () => {
  const promptRef = {
    kind: 'terminal' as const,
    terminalHandle: 't1',
    fence: { generation: 1, permissionSequence: 0, blockedSince: 5, promptKey: null }
  }
  const { service, deps } = createHarness({ resolvePromptRef: () => promptRef })
  await service.dispatch({ source: 'agent-task-complete', worktreeId: 'wt', paneKey: 'p1', agentState: 'blocked' })
  expect(deps.dispatchMobileNotification).toHaveBeenCalledWith(expect.objectContaining({ promptRef }))
})

it('sends a structured reference when the request names an agent session', async () => {
  const { service, deps } = createHarness({ resolvePromptRef: () => undefined })
  await service.dispatch({ source: 'agent-task-complete', worktreeId: 'wt', agentSessionId: 's1', agentState: 'blocked' })
  expect(deps.dispatchMobileNotification).toHaveBeenCalledWith(
    expect.objectContaining({ promptRef: { kind: 'structured', sessionId: 's1' } })
  )
})
```

Ajuste `createHarness` e o formato do `dispatch` ao que o arquivo já usa; o essencial é a dependência nova `resolvePromptRef` e as duas asserções.

Em `push-dispatcher.test.ts`, com a fixture de `push-dispatcher.test-fixture.ts`:

```ts
it('never pushes agent-exited, which only rides the paired socket', () => {
  const plan = planSendFor({ type: 'notification', source: 'agent-exited', title: 'Agent exited', body: '', worktreeId: 'wt' })
  expect(plan).toBeNull()
})
```

Use o nome real do helper da fixture para planejar um envio.

Crie `src/main/runtime/mobile-notification-prompt-ref.test.ts` com o teste de compatibilidade:

```ts
import { describe, expect, it } from 'vitest'
import { RuntimeMobileNotificationController } from './runtime-mobile-notification-controller'

describe('mobile notification prompt reference', () => {
  it('rides the socket stream and the replay untouched', () => {
    const controller = new RuntimeMobileNotificationController()
    const seen: unknown[] = []
    controller.onDispatched((event) => seen.push(event))
    const promptRef = { kind: 'structured' as const, sessionId: 's1' }
    controller.dispatch({ type: 'notification', source: 'agent-task-complete', agentState: 'blocked', title: 't', body: '', worktreeId: 'wt', promptRef })
    expect(seen[0]).toMatchObject({ promptRef })
    expect(controller.getMissedSince(0)[0]).toMatchObject({ promptRef })
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `pnpm test src/main/notifications/notification-delivery-service.test.ts src/main/runtime/push/push-dispatcher.test.ts src/main/runtime/mobile-notification-prompt-ref.test.ts`
Esperado: FAIL de tipo e de asserção.

- [ ] **Passo 3: tipos**

Crie `src/shared/mobile-notification-prompt-ref.ts` com o tipo das Interfaces, importando `TerminalAgentPromptFence`.
No controller, acrescente `'agent-exited'` à união de `source` e o campo `promptRef?: MobileNotificationPromptRef`, com o comentário `// Optional and additive: old phones ignore it.`
Em `notification-settings-types.ts`, acrescente ao `NotificationDispatchRequest` o campo `agentSessionId?: string`.

- [ ] **Passo 4: resolvedor no runtime**

Na mesma classe da Tarefa 1:

```ts
  resolveMobileNotificationPromptRef(paneKey: string): MobileNotificationPromptRef | undefined {
    const handle = this.getTerminalHandleForPaneKey(paneKey)
    if (!handle) {
      return undefined
    }
    const fence = this.getTerminalAgentPromptFence(handle)
    if (!fence) {
      return undefined
    }
    const row = this.findHookAgentStatusForHandle(handle)
    const permission = row
      ? {
          ...(row.interactivePrompt ? { interactivePrompt: row.interactivePrompt } : {}),
          ...(row.lastAssistantMessage ? { lastAssistantMessage: row.lastAssistantMessage.slice(0, 4000) } : {})
        }
      : undefined
    return { kind: 'terminal', terminalHandle: handle, fence, ...(permission ? { permission } : {}) }
  }
```

Se `getTerminalHandleForPaneKey` lançar erro para um painel sem PTY, envolva a chamada num `try` que devolve `undefined`.

- [ ] **Passo 5: serviço de entrega e wiring**

Em `NotificationDeliveryDependencies`, acrescente:

```ts
  /** Resolves which pending prompt a phone reply would answer; undefined when none is fenceable. */
  resolvePromptRef?: (request: NotificationDispatchRequest) => MobileNotificationPromptRef | undefined
```

No bloco das linhas 104-115, antes de chamar `deps.dispatchMobileNotification`:

```ts
const promptRef = request.agentSessionId
  ? { kind: 'structured' as const, sessionId: request.agentSessionId }
  : deps.resolvePromptRef?.(request)
```

e acrescente `...(promptRef ? { promptRef } : {})` ao objeto despachado.

Em `src/main/ipc/notifications.ts:121`, passe:

```ts
resolvePromptRef: (request) =>
  request.paneKey ? runtime.resolveMobileNotificationPromptRef(request.paneKey) : undefined,
```

Em `structured-attention-dispatch.ts:97-121`, acrescente `agentSessionId: completion.sessionId` ao pedido enviado (use o nome real da variável que guarda o `sessionId` naquele trecho).

- [ ] **Passo 6: aviso de agente encerrado**

Ache onde o fato é gravado:

Rodar: `rg -n "recordTerminalSideEffectFact\(ptyId: string" src/main/runtime`

No corpo de `recordTerminalSideEffectFact`, logo no início, acrescente:

```ts
    if (fact.kind === 'agent-exited') {
      this.announceAgentExitedToMobile(ptyId)
    }
```

E, na mesma classe:

```ts
  // Only the exited verdict lands here; lost contact is unverifiable and never announced as exit.
  protected announceAgentExitedToMobile(ptyId: string): void {
    const attribution = this.resolveTerminalSideEffectAttribution(ptyId)
    this.mobileNotifications.dispatch({
      type: 'notification',
      source: 'agent-exited',
      title: 'Agent exited',
      body: '',
      emittedAt: Date.now(),
      ...(attribution.worktreeId ? { worktreeId: attribution.worktreeId } : {}),
      ...(attribution.paneKey ? { notificationId: `agent-exited:${attribution.paneKey}` } : {})
    })
  }
```

Acrescente um teste em `terminal-agent-prompt-reply.test.ts`, usando a mesma fixture, que chama `confirmPtyAgentExit` ou provoca o fato `agent-exited` como em `orca-runtime-serialize-agent-prompt-submission.ts:93-112`, e verifica que `runtime.getMissedNotificationsSince(0, undefined)` contém `source: 'agent-exited'`.

- [ ] **Passo 7: rodar e ver passar**

Rodar: `pnpm test src/main/notifications src/main/runtime/push src/main/runtime/mobile-notification-prompt-ref.test.ts src/main/runtime/terminal-agent-prompt-reply.test.ts`
Esperado: PASS.

- [ ] **Passo 8: typecheck e commit**

Rodar: `pnpm tc:node && pnpm tc:web`
Esperado: sem erros.

```bash
git add src/shared src/main src/renderer/src/components/native-chat/structured-attention-dispatch.ts
git commit -m "feat(notifications): attach a fenced prompt reference and announce agent exit to phones"
```

---

### Tarefa 4: config plugin `with-android-auto`

**Arquivos:**
- Criar: `mobile/plugins/with-android-auto.js`
- Criar: `mobile/scripts/with-android-auto.test.ts`
- Modificar: `mobile/app.json` (array `plugins`, linhas 81-117)

**Interfaces:**
- Produz: `applyAndroidAutoManifest(manifest)` e `AUTOMOTIVE_APP_DESC_XML`, exportados para teste.
- Produz no manifesto: meta-data `com.google.android.gms.car.application`, serviço `expo.modules.orcacarmessaging.OrcaCarSessionService` com `foregroundServiceType="connectedDevice"`, receptor `expo.modules.orcacarmessaging.CarReplyReceiver`, permissões `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CONNECTED_DEVICE` e `CHANGE_NETWORK_STATE`.

- [ ] **Passo 1: teste**

```ts
// mobile/scripts/with-android-auto.test.ts
import { describe, expect, it } from 'vitest'
// oxlint-disable-next-line typescript/no-require-imports -- the plugin is CommonJS, as Expo loads it.
const plugin = require('../plugins/with-android-auto.js')

function emptyManifest() {
  return { manifest: { $: {}, 'uses-permission': [], application: [{ $: { 'android:name': '.MainApplication' } }] } }
}

describe('with-android-auto', () => {
  it('declares Android Auto, the car session service, the reply receiver and permissions', () => {
    const manifest = plugin.applyAndroidAutoManifest(emptyManifest())
    const app = manifest.manifest.application[0]
    expect(app['meta-data']).toContainEqual({
      $: { 'android:name': 'com.google.android.gms.car.application', 'android:resource': '@xml/automotive_app_desc' }
    })
    expect(app.service[0].$['android:foregroundServiceType']).toBe('connectedDevice')
    expect(app.receiver[0].$['android:exported']).toBe('false')
    const permissions = manifest.manifest['uses-permission'].map((p: { $: Record<string, string> }) => p.$['android:name'])
    expect(permissions).toEqual(expect.arrayContaining([
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
      'android.permission.CHANGE_NETWORK_STATE'
    ]))
  })

  it('is idempotent across repeated prebuilds', () => {
    const once = plugin.applyAndroidAutoManifest(emptyManifest())
    const twice = plugin.applyAndroidAutoManifest(once)
    const app = twice.manifest.application[0]
    expect(app['meta-data']).toHaveLength(1)
    expect(app.service).toHaveLength(1)
    expect(app.receiver).toHaveLength(1)
    expect(twice.manifest['uses-permission']).toHaveLength(3)
  })

  it('describes a notification-only car app in phase 1', () => {
    expect(plugin.AUTOMOTIVE_APP_DESC_XML).toContain('<uses name="notification"/>')
    expect(plugin.AUTOMOTIVE_APP_DESC_XML).not.toContain('template')
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `cd mobile && pnpm exec vitest run scripts/with-android-auto.test.ts`
Esperado: FAIL, módulo não encontrado.

- [ ] **Passo 3: plugin**

```js
// mobile/plugins/with-android-auto.js
const fs = require('fs')
const path = require('path')
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins')

const MODULE_PACKAGE = 'expo.modules.orcacarmessaging'
const PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
  'android.permission.CHANGE_NETWORK_STATE'
]
// Phase 1 is notification messaging only; phase 2 adds <uses name="template"/>.
const AUTOMOTIVE_APP_DESC_XML = '<automotiveApp>\n  <uses name="notification"/>\n</automotiveApp>\n'

function upsertByName(list, entry) {
  const items = list ?? []
  const name = entry.$['android:name']
  return [...items.filter((item) => item.$['android:name'] !== name), entry]
}

function applyAndroidAutoManifest(config) {
  const manifest = config.manifest
  manifest['uses-permission'] = PERMISSIONS.reduce(
    (list, name) => upsertByName(list, { $: { 'android:name': name } }),
    manifest['uses-permission']
  )
  const app = manifest.application[0]
  app['meta-data'] = upsertByName(app['meta-data'], {
    $: { 'android:name': 'com.google.android.gms.car.application', 'android:resource': '@xml/automotive_app_desc' }
  })
  app.service = upsertByName(app.service, {
    $: {
      'android:name': `${MODULE_PACKAGE}.OrcaCarSessionService`,
      'android:exported': 'false',
      'android:foregroundServiceType': 'connectedDevice'
    }
  })
  app.receiver = upsertByName(app.receiver, {
    $: { 'android:name': `${MODULE_PACKAGE}.CarReplyReceiver`, 'android:exported': 'false' }
  })
  return config
}

function withAndroidAuto(config) {
  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = applyAndroidAutoManifest(cfg.modResults)
    return cfg
  })
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const xmlDir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml')
      fs.mkdirSync(xmlDir, { recursive: true })
      fs.writeFileSync(path.join(xmlDir, 'automotive_app_desc.xml'), AUTOMOTIVE_APP_DESC_XML)
      return cfg
    }
  ])
}

module.exports = withAndroidAuto
module.exports.applyAndroidAutoManifest = applyAndroidAutoManifest
module.exports.AUTOMOTIVE_APP_DESC_XML = AUTOMOTIVE_APP_DESC_XML
```

Em `app.json`, acrescente `"./plugins/with-android-auto.js"` logo depois de `"./plugins/android-respect-rotation-lock.js"`.

- [ ] **Passo 4: rodar e ver passar**

Rodar: `cd mobile && pnpm exec vitest run scripts/with-android-auto.test.ts`
Esperado: PASS, 3 testes.

- [ ] **Passo 5: commit**

```bash
git add mobile/plugins/with-android-auto.js mobile/scripts/with-android-auto.test.ts mobile/app.json
git commit -m "feat(mobile): declare Android Auto messaging in the Android manifest"
```

---

### Tarefa 5: módulo nativo `orca-car-messaging`

**Arquivos (todos em `mobile/modules/orca-car-messaging/`):**
- Criar: `expo-module.config.json`, `package.json`, `android/.gitignore`, `android/build.gradle`, `android/src/main/AndroidManifest.xml`
- Criar em `android/src/main/java/expo/modules/orcacarmessaging/`: `CarConversationSpec.kt`, `CarNotificationPublisher.kt`, `CarReplyReceiver.kt`, `OrcaCarSessionService.kt`, `OrcaCarMessagingModule.kt`
- Criar: `android/src/test/java/expo/modules/orcacarmessaging/CarConversationSpecTest.kt`
- Criar: `src/index.ts`

**Interfaces:**
- Produz em JS (`mobile/modules/orca-car-messaging/src/index.ts`):

```ts
export type CarMessage = { sender: 'agent' | 'me' | 'orca'; text: string; timestamp: number }
export type CarConversation = { id: string; title: string; messages: CarMessage[]; canReply: boolean }
export type CarReplyEvent = { conversationId: string; text: string }
export type CarMarkReadEvent = { conversationId: string }
export type CarProjectionEvent = { projecting: boolean }

export const OrcaCarMessaging: {
  startSession(): Promise<void>
  stopSession(): Promise<void>
  publishConversation(conversation: CarConversation): Promise<void>
  clearConversation(conversationId: string): Promise<void>
  clearConversations(): Promise<void>
  addReplyListener(listener: (event: CarReplyEvent) => void): { remove(): void }
  addMarkReadListener(listener: (event: CarMarkReadEvent) => void): { remove(): void }
  addProjectionListener(listener: (event: CarProjectionEvent) => void): { remove(): void }
}
```

- [ ] **Passo 1: teste Kotlin das regras puras**

```kotlin
// android/src/test/java/expo/modules/orcacarmessaging/CarConversationSpecTest.kt
package expo.modules.orcacarmessaging

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CarConversationSpecTest {
  @Test
  fun `reply action carries exactly one remote input and opens no UI`() {
    val reply = carActionSpecs(canReply = true).single { it.kind == CarActionKind.REPLY }
    assertEquals(1, reply.remoteInputCount)
    assertFalse(reply.showsUserInterface)
  }

  @Test
  fun `mark as read is always present and opens no UI`() {
    for (canReply in listOf(true, false)) {
      val markRead = carActionSpecs(canReply).single { it.kind == CarActionKind.MARK_AS_READ }
      assertEquals(0, markRead.remoteInputCount)
      assertFalse(markRead.showsUserInterface)
    }
  }

  @Test
  fun `a conversation without a fenced prompt offers no reply`() {
    assertTrue(carActionSpecs(canReply = false).none { it.kind == CarActionKind.REPLY })
  }

  @Test
  fun `request codes are stable per conversation and distinct per action`() {
    assertEquals(replyRequestCode("agent-a"), replyRequestCode("agent-a"))
    assertNotEquals(replyRequestCode("agent-a"), markReadRequestCode("agent-a"))
    assertNotEquals(replyRequestCode("agent-a"), replyRequestCode("agent-b"))
  }

  @Test
  fun `notification id is stable per conversation`() {
    assertEquals(conversationNotificationId("agent-a"), conversationNotificationId("agent-a"))
  }
}
```

- [ ] **Passo 2: arquivos do módulo e regras puras**

`expo-module.config.json`:
```json
{
  "platforms": ["android"],
  "android": { "modules": ["expo.modules.orcacarmessaging.OrcaCarMessagingModule"] }
}
```

`package.json`:
```json
{ "name": "orca-car-messaging", "version": "0.0.1", "private": true }
```

`android/.gitignore`:
```
/build/
```

`android/src/main/AndroidManifest.xml`:
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android" />
```

`android/build.gradle`:
```groovy
apply plugin: 'com.android.library'

group = 'expo.modules.orcacarmessaging'
version = '0.0.1'

def expoModulesCorePlugin = new File(project(':expo-modules-core').projectDir.absolutePath, 'ExpoModulesCorePlugin.gradle')
apply from: expoModulesCorePlugin
applyKotlinExpoModulesCorePlugin()
useCoreDependencies()
useExpoPublishing()
useDefaultAndroidSdkVersions()

android {
  namespace 'expo.modules.orcacarmessaging'
}

dependencies {
  // CarConnection reports whether Android Auto is projecting; core-ktx comes from expo-modules-core.
  implementation 'androidx.car.app:app:1.4.0'
  testImplementation 'junit:junit:4.13.2'
}
```

`CarConversationSpec.kt`:
```kotlin
package expo.modules.orcacarmessaging

enum class CarActionKind { REPLY, MARK_AS_READ }

data class CarActionSpec(val kind: CarActionKind, val remoteInputCount: Int, val showsUserInterface: Boolean)

const val REMOTE_INPUT_KEY = "orca_car_reply"
const val CAR_CHANNEL_ID = "orca-car"
const val CAR_GROUP = "orca-car-conversations"

internal fun carActionSpecs(canReply: Boolean): List<CarActionSpec> = buildList {
  if (canReply) add(CarActionSpec(CarActionKind.REPLY, remoteInputCount = 1, showsUserInterface = false))
  add(CarActionSpec(CarActionKind.MARK_AS_READ, remoteInputCount = 0, showsUserInterface = false))
}

// Android Auto requires one PendingIntent per conversation and action, identical across updates.
internal fun replyRequestCode(conversationId: String): Int = ("reply:$conversationId").hashCode()
internal fun markReadRequestCode(conversationId: String): Int = ("read:$conversationId").hashCode()
internal fun conversationNotificationId(conversationId: String): Int = ("car:$conversationId").hashCode()
```

- [ ] **Passo 3: rodar o teste Kotlin**

Rodar: `cd mobile/android && ./gradlew :orca-car-messaging:testDebugUnitTest`
(Windows: `cd mobile\android; .\gradlew.bat :orca-car-messaging:testDebugUnitTest`; o módulo só aparece no Gradle depois de `npx expo prebuild --platform android --no-install` em `mobile/`.)
Esperado: PASS, 5 testes.

- [ ] **Passo 4: publicador de notificações**

```kotlin
// CarNotificationPublisher.kt
package expo.modules.orcacarmessaging

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput

data class CarMessageData(val sender: String, val text: String, val timestamp: Long)
data class CarConversationData(val id: String, val title: String, val messages: List<CarMessageData>, val canReply: Boolean)

class CarNotificationPublisher(private val context: Context) {
  private val me = Person.Builder().setName("Me").setKey("me").build()

  fun ensureChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CAR_CHANNEL_ID, "Orca in the car", NotificationManager.IMPORTANCE_HIGH)
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  fun publish(conversation: CarConversationData) {
    val agent = Person.Builder().setName(conversation.title).setKey(conversation.id).build()
    val orca = Person.Builder().setName("Orca").setKey("orca").build()
    val style = NotificationCompat.MessagingStyle(me).setConversationTitle(conversation.title).setGroupConversation(false)
    for (message in conversation.messages) {
      val sender = when (message.sender) { "me" -> me; "orca" -> orca; else -> agent }
      style.addMessage(NotificationCompat.MessagingStyle.Message(message.text, message.timestamp, sender))
    }
    val builder = NotificationCompat.Builder(context, CAR_CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setStyle(style)
      .setGroup(CAR_GROUP)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
    for (spec in carActionSpecs(conversation.canReply)) {
      when (spec.kind) {
        CarActionKind.REPLY -> builder.addAction(replyAction(conversation.id))
        CarActionKind.MARK_AS_READ -> builder.addInvisibleAction(markReadAction(conversation.id))
      }
    }
    NotificationManagerCompat.from(context).notify(conversationNotificationId(conversation.id), builder.build())
  }

  fun clear(conversationIds: Collection<String>) {
    val manager = NotificationManagerCompat.from(context)
    conversationIds.forEach { manager.cancel(conversationNotificationId(it)) }
  }

  private fun receiverIntent(action: String, conversationId: String) =
    Intent(context, CarReplyReceiver::class.java).setAction(action).putExtra(CarReplyReceiver.EXTRA_CONVERSATION_ID, conversationId)

  private fun replyAction(conversationId: String): NotificationCompat.Action {
    val pending = PendingIntent.getBroadcast(
      context, replyRequestCode(conversationId), receiverIntent(CarReplyReceiver.ACTION_REPLY, conversationId),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    )
    return NotificationCompat.Action.Builder(0, "Reply", pending)
      .addRemoteInput(RemoteInput.Builder(REMOTE_INPUT_KEY).build())
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
      .setShowsUserInterface(false)
      .build()
  }

  private fun markReadAction(conversationId: String): NotificationCompat.Action {
    val pending = PendingIntent.getBroadcast(
      context, markReadRequestCode(conversationId), receiverIntent(CarReplyReceiver.ACTION_MARK_READ, conversationId),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return NotificationCompat.Action.Builder(0, "Mark as read", pending)
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
      .setShowsUserInterface(false)
      .build()
  }
}
```

- [ ] **Passo 5: receptor, serviço e módulo**

```kotlin
// CarReplyReceiver.kt
package expo.modules.orcacarmessaging

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput

class CarReplyReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID) ?: return
    when (intent.action) {
      ACTION_REPLY -> {
        val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(REMOTE_INPUT_KEY)?.toString() ?: return
        OrcaCarMessagingModule.emitReply(conversationId, text)
      }
      ACTION_MARK_READ -> OrcaCarMessagingModule.emitMarkRead(conversationId)
    }
  }

  companion object {
    const val ACTION_REPLY = "expo.modules.orcacarmessaging.REPLY"
    const val ACTION_MARK_READ = "expo.modules.orcacarmessaging.MARK_READ"
    const val EXTRA_CONVERSATION_ID = "conversationId"
  }
}
```

```kotlin
// OrcaCarSessionService.kt
package expo.modules.orcacarmessaging

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

// Keeps the process, and with it the JS runtime and the host socket, alive while the car session runs.
class OrcaCarSessionService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    CarNotificationPublisher(this).ensureChannel()
    val notification = NotificationCompat.Builder(this, CAR_CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Orca in the car")
      .setOngoing(true)
      .setSilent(true)
      .build()
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE else 0
    ServiceCompat.startForeground(this, ONGOING_NOTIFICATION_ID, notification, type)
    return START_STICKY
  }

  companion object {
    const val ONGOING_NOTIFICATION_ID = 0x0CA4
  }
}
```

```kotlin
// OrcaCarMessagingModule.kt
package expo.modules.orcacarmessaging

import android.content.Intent
import androidx.car.app.connection.CarConnection
import androidx.core.content.ContextCompat
import androidx.core.os.bundleOf
import androidx.lifecycle.Observer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class OrcaCarMessagingModule : Module() {
  private val published = mutableSetOf<String>()
  private var connection: CarConnection? = null
  private val projectionObserver = Observer<Int> { type ->
    sendEvent(ON_PROJECTION, bundleOf("projecting" to (type == CarConnection.CONNECTION_TYPE_PROJECTION)))
  }

  override fun definition() = ModuleDefinition {
    Name("OrcaCarMessaging")
    Events(ON_REPLY, ON_MARK_READ, ON_PROJECTION)

    OnCreate {
      active = WeakReference(this@OrcaCarMessagingModule)
      val context = requireNotNull(appContext.reactContext)
      appContext.mainQueue.launch {
        connection = CarConnection(context).also { it.type.observeForever(projectionObserver) }
      }
    }

    OnDestroy {
      appContext.mainQueue.launch { connection?.type?.removeObserver(projectionObserver) }
    }

    AsyncFunction("startSession") {
      val context = requireNotNull(appContext.reactContext)
      ContextCompat.startForegroundService(context, Intent(context, OrcaCarSessionService::class.java))
    }

    AsyncFunction("stopSession") {
      val context = requireNotNull(appContext.reactContext)
      context.stopService(Intent(context, OrcaCarSessionService::class.java))
    }

    AsyncFunction("publishConversation") { conversation: Map<String, Any?> ->
      val context = requireNotNull(appContext.reactContext)
      val data = parseConversation(conversation)
      published.add(data.id)
      CarNotificationPublisher(context).apply { ensureChannel(); publish(data) }
    }

    AsyncFunction("clearConversation") { conversationId: String ->
      val context = requireNotNull(appContext.reactContext)
      CarNotificationPublisher(context).clear(listOf(conversationId))
      published.remove(conversationId)
    }

    AsyncFunction("clearConversations") {
      val context = requireNotNull(appContext.reactContext)
      CarNotificationPublisher(context).clear(published.toList())
      published.clear()
    }
  }

  private fun parseConversation(raw: Map<String, Any?>): CarConversationData {
    @Suppress("UNCHECKED_CAST")
    val messages = (raw["messages"] as? List<Map<String, Any?>>).orEmpty().map {
      CarMessageData(it["sender"] as String, it["text"] as String, (it["timestamp"] as Number).toLong())
    }
    return CarConversationData(raw["id"] as String, raw["title"] as String, messages, raw["canReply"] as Boolean)
  }

  companion object {
    private const val ON_REPLY = "onCarReply"
    private const val ON_MARK_READ = "onCarMarkRead"
    private const val ON_PROJECTION = "onProjectionChanged"
    private var active: WeakReference<OrcaCarMessagingModule>? = null

    fun emitReply(conversationId: String, text: String) {
      active?.get()?.sendEvent(ON_REPLY, bundleOf("conversationId" to conversationId, "text" to text))
    }

    fun emitMarkRead(conversationId: String) {
      active?.get()?.sendEvent(ON_MARK_READ, bundleOf("conversationId" to conversationId))
    }
  }
}
```

O `CarConnection.type` é `LiveData<Int>`; se o classpath não trouxer `androidx.lifecycle`, acrescente `implementation 'androidx.lifecycle:lifecycle-livedata:2.8.7'` ao `build.gradle`. A resposta só chega ao JS com o processo vivo, o que o serviço em primeiro plano garante durante a sessão; a partida a frio fica para a fase 2.

- [ ] **Passo 6: lado TS**

```ts
// mobile/modules/orca-car-messaging/src/index.ts
import { requireNativeModule } from 'expo-modules-core'
import { Platform } from 'react-native'

export type CarMessage = { sender: 'agent' | 'me' | 'orca'; text: string; timestamp: number }
export type CarConversation = { id: string; title: string; messages: CarMessage[]; canReply: boolean }
export type CarReplyEvent = { conversationId: string; text: string }
export type CarMarkReadEvent = { conversationId: string }
export type CarProjectionEvent = { projecting: boolean }
type Subscription = { remove(): void }

type NativeCarMessaging = {
  startSession(): Promise<void>
  stopSession(): Promise<void>
  publishConversation(conversation: CarConversation): Promise<void>
  clearConversation(conversationId: string): Promise<void>
  clearConversations(): Promise<void>
  addListener(event: 'onCarReply', listener: (event: CarReplyEvent) => void): Subscription
  addListener(event: 'onCarMarkRead', listener: (event: CarMarkReadEvent) => void): Subscription
  addListener(event: 'onProjectionChanged', listener: (event: CarProjectionEvent) => void): Subscription
}

const native: NativeCarMessaging | null =
  Platform.OS === 'android' ? requireNativeModule<NativeCarMessaging>('OrcaCarMessaging') : null

const noop: Subscription = { remove() {} }

export const OrcaCarMessaging = {
  startSession: async () => native?.startSession(),
  stopSession: async () => native?.stopSession(),
  publishConversation: async (conversation: CarConversation) => native?.publishConversation(conversation),
  clearConversation: async (conversationId: string) => native?.clearConversation(conversationId),
  clearConversations: async () => native?.clearConversations(),
  addReplyListener: (listener: (event: CarReplyEvent) => void) => native?.addListener('onCarReply', listener) ?? noop,
  addMarkReadListener: (listener: (event: CarMarkReadEvent) => void) =>
    native?.addListener('onCarMarkRead', listener) ?? noop,
  addProjectionListener: (listener: (event: CarProjectionEvent) => void) =>
    native?.addListener('onProjectionChanged', listener) ?? noop
}
```

- [ ] **Passo 7: compilar e testar**

Rodar em `mobile/`: `npx expo prebuild --platform android --no-install`, depois em `mobile/android`: `./gradlew :orca-car-messaging:testDebugUnitTest assembleDebug`
Esperado: PASS e `BUILD SUCCESSFUL`. Confira em `android/app/src/main/AndroidManifest.xml` a meta-data, o serviço e o receptor da Tarefa 4.

- [ ] **Passo 8: commit**

```bash
git add mobile/modules/orca-car-messaging
git commit -m "feat(mobile): add the orca-car-messaging native module for Android Auto"
```

---

### Tarefa 6: estado da sessão de carro, preferência e conexão em segundo plano

**Arquivos:**
- Criar: `mobile/src/car/car-session-store.ts`
- Criar: `mobile/src/car/car-session-store.test.ts`
- Modificar: `mobile/src/transport/host-logical-client.ts:20-22`
- Modificar: `mobile/src/storage/preferences.ts` (junto do modelo das linhas 102-119)
- Modificar: `mobile/src/transport/types.ts:51-66` (códigos de diagnóstico)
- Criar: `mobile/src/settings/car-settings-screen.tsx`, `mobile/app/car-settings.tsx`
- Modificar: `mobile/app/_layout.tsx:229-233`, `mobile/src/settings/mobile-settings-menu-items.ts:4-14`

**Interfaces:**
- Produz:

```ts
export type CarSessionPhase = 'inactive' | 'active' | 'ending'
export type CarSessionSnapshot = { phase: CarSessionPhase; carModeEnabled: boolean; projecting: boolean }
export const CAR_SESSION_END_GRACE_MS = 60_000
export function createCarSessionStore(deps: { setTimer: typeof setTimeout; clearTimer: typeof clearTimeout }): {
  getSnapshot(): CarSessionSnapshot
  subscribe(listener: () => void): () => void
  setProjecting(projecting: boolean): void
  setCarModeEnabled(enabled: boolean): void
  isActive(): boolean
}
export const carSessionStore: ReturnType<typeof createCarSessionStore>
export function isCarSessionActive(): boolean
```

- [ ] **Passo 1: teste**

```ts
// mobile/src/car/car-session-store.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CAR_SESSION_END_GRACE_MS, createCarSessionStore } from './car-session-store'

describe('car session store', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const make = () => createCarSessionStore({ setTimer: setTimeout, clearTimer: clearTimeout })

  it('starts inactive', () => {
    expect(make().getSnapshot().phase).toBe('inactive')
  })

  it('activates when Android Auto projects', () => {
    const store = make()
    store.setProjecting(true)
    expect(store.getSnapshot().phase).toBe('active')
  })

  it('activates from Car mode without projection', () => {
    const store = make()
    store.setCarModeEnabled(true)
    expect(store.isActive()).toBe(true)
  })

  it('keeps the session through a 60 second cable glitch', () => {
    const store = make()
    store.setProjecting(true)
    store.setProjecting(false)
    expect(store.getSnapshot().phase).toBe('ending')
    expect(store.isActive()).toBe(true)
    vi.advanceTimersByTime(CAR_SESSION_END_GRACE_MS - 1)
    store.setProjecting(true)
    expect(store.getSnapshot().phase).toBe('active')
  })

  it('ends after the grace period', () => {
    const store = make()
    store.setProjecting(true)
    store.setProjecting(false)
    vi.advanceTimersByTime(CAR_SESSION_END_GRACE_MS)
    expect(store.getSnapshot().phase).toBe('inactive')
  })

  it('notifies subscribers on every phase change', () => {
    const store = make()
    const listener = vi.fn()
    store.subscribe(listener)
    store.setProjecting(true)
    store.setProjecting(false)
    vi.advanceTimersByTime(CAR_SESSION_END_GRACE_MS)
    expect(listener).toHaveBeenCalledTimes(3)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `cd mobile && pnpm exec vitest run src/car/car-session-store.test.ts`
Esperado: FAIL, módulo não encontrado.

- [ ] **Passo 3: implementar a store**

```ts
// mobile/src/car/car-session-store.ts
export type CarSessionPhase = 'inactive' | 'active' | 'ending'
export type CarSessionSnapshot = { phase: CarSessionPhase; carModeEnabled: boolean; projecting: boolean }

// Covers a loose USB cable without tearing down the host socket and the car conversations.
export const CAR_SESSION_END_GRACE_MS = 60_000

type Deps = { setTimer: typeof setTimeout; clearTimer: typeof clearTimeout }

export function createCarSessionStore(deps: Deps) {
  let snapshot: CarSessionSnapshot = { phase: 'inactive', carModeEnabled: false, projecting: false }
  let endTimer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<() => void>()

  const emit = (next: CarSessionSnapshot) => {
    const changed = next.phase !== snapshot.phase
    snapshot = next
    if (changed) {
      listeners.forEach((listener) => listener())
    }
  }

  const cancelEnd = () => {
    if (endTimer) {
      deps.clearTimer(endTimer)
      endTimer = null
    }
  }

  const reconcile = (inputs: Pick<CarSessionSnapshot, 'carModeEnabled' | 'projecting'>) => {
    const wanted = inputs.carModeEnabled || inputs.projecting
    if (wanted) {
      cancelEnd()
      emit({ ...inputs, phase: 'active' })
      return
    }
    if (snapshot.phase === 'inactive') {
      emit({ ...inputs, phase: 'inactive' })
      return
    }
    emit({ ...inputs, phase: 'ending' })
    if (!endTimer) {
      endTimer = deps.setTimer(() => {
        endTimer = null
        emit({ ...snapshot, phase: 'inactive' })
      }, CAR_SESSION_END_GRACE_MS)
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setProjecting: (projecting: boolean) => reconcile({ carModeEnabled: snapshot.carModeEnabled, projecting }),
    setCarModeEnabled: (carModeEnabled: boolean) => reconcile({ carModeEnabled, projecting: snapshot.projecting }),
    isActive: () => snapshot.phase !== 'inactive'
  }
}

export const carSessionStore = createCarSessionStore({ setTimer: setTimeout, clearTimer: clearTimeout })

export function isCarSessionActive(): boolean {
  return carSessionStore.isActive()
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `cd mobile && pnpm exec vitest run src/car/car-session-store.test.ts`
Esperado: PASS, 6 testes.

- [ ] **Passo 5: manter a conexão com a sessão ativa**

Em `host-logical-client.ts`, troque as linhas 20-22 por:

```ts
  const applyForeground = () =>
    // The car session keeps the host socket as if foreground; Android keeps the process alive via the car service.
    endpointLifecycle.setForeground(AppState.currentState === 'active' || isCarSessionActive())
  applyForeground()
  const appStateSubscription = AppState.addEventListener('change', applyForeground)
  const unsubscribeCarSession = carSessionStore.subscribe(applyForeground)
```

e, no ponto em que `appStateSubscription.remove()` é chamado, acrescente `unsubscribeCarSession()`. Importe `carSessionStore` e `isCarSessionActive` de `../car/car-session-store`.

- [ ] **Passo 6: preferência, códigos de log e tela**

Em `preferences.ts`, seguindo o modelo das linhas 102-119:

```ts
const CAR_MODE_KEY = 'orca:carModeEnabled'

export async function loadCarModeEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CAR_MODE_KEY)) === 'true'
  } catch {
    return false
  }
}

export async function saveCarModeEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(CAR_MODE_KEY, String(enabled))
}
```

Em `types.ts`, acrescente à união `ConnectionDiagnosticCode`: `'car-session-started' | 'car-session-ended' | 'car-reply-delivered' | 'car-reply-refused'`.

Crie `mobile/src/settings/car-settings-screen.tsx` copiando a moldura (`MobileSettingsFrame`, `MobileSettingsSection`) de `mobile/src/settings/mobile-settings-menu.tsx` e a linha com `Switch` de `native-chat-settings-screen.tsx:39-53`, com o rótulo `Car mode`, o subtítulo `Keep Orca connected for Android Auto while the app is closed`, o valor vindo de `loadCarModeEnabled()` e, ao mudar, `saveCarModeEnabled(value)` seguido de `carSessionStore.setCarModeEnabled(value)`.
Crie `mobile/app/car-settings.tsx` reexportando a tela, como em `app/native-chat-settings.tsx:1`.
Em `app/_layout.tsx`, acrescente `<Stack.Screen name="car-settings" options={{ headerShown: false }} />` junto das outras telas de configuração, e no menu (`mobile-settings-menu-items.ts`) um item `Car mode` para a rota `/car-settings`.

- [ ] **Passo 7: testes e typecheck**

Rodar: `cd mobile && pnpm exec vitest run src/car src/transport && pnpm typecheck`
Esperado: PASS e sem erros.

- [ ] **Passo 8: commit**

```bash
git add mobile/src/car mobile/src/transport mobile/src/storage/preferences.ts mobile/src/settings mobile/app
git commit -m "feat(mobile): add the car session and keep the host socket alive during it"
```

---

### Tarefa 7: normalização da resposta por voz

**Arquivos:**
- Criar: `mobile/src/car/car-copy.ts`
- Criar: `mobile/src/car/car-reply-normalization.ts`
- Criar: `mobile/src/car/car-reply-normalization.test.ts`

**Interfaces:**
- Consome: `detectAgentPermission`, `parseApprovalFromStatus` e o tipo `MobileChatPermission` de `mobile/src/session/mobile-native-chat-permission.ts`.
- Produz:

```ts
export type CarReplyKeystroke = { text: string; enter: boolean; label: string }
export function carPermissionOptions(permission: { interactivePrompt?: string; lastAssistantMessage?: string } | undefined, state: string): MobileChatPermission | null
export function normalizeCarReply(spoken: string, permission: MobileChatPermission | null): CarReplyKeystroke | null
export function createCarReplyDeduplicator(now: () => number): (key: string) => boolean
export const CAR_REPLY_MAX_LENGTH = 500
export const CAR_REPLY_DEDUPE_MS = 30_000
```

- [ ] **Passo 1: teste**

```ts
// mobile/src/car/car-reply-normalization.test.ts
import { describe, expect, it } from 'vitest'
import {
  CAR_REPLY_DEDUPE_MS,
  carPermissionOptions,
  createCarReplyDeduplicator,
  normalizeCarReply
} from './car-reply-normalization'

const numbered = carPermissionOptions(
  { lastAssistantMessage: 'Do you want to proceed?\n1. Yes\n2. Yes, and don\'t ask again\n3. No, and tell Claude' },
  'blocked'
)
const approval = carPermissionOptions({ interactivePrompt: JSON.stringify({ approval: { tool: 'Bash', summary: 'pnpm test' } }) }, 'blocked')

describe('normalizeCarReply', () => {
  it('maps a spoken number word to that option key without Enter', () => {
    expect(normalizeCarReply('um', numbered)).toEqual({ text: '1', enter: false, label: 'Yes' })
    expect(normalizeCarReply('Dois.', numbered)).toMatchObject({ text: '2', enter: false })
    expect(normalizeCarReply('3', numbered)).toMatchObject({ text: '3', enter: false })
  })

  it('maps yes and no words onto the first and the deny option', () => {
    expect(normalizeCarReply('sim', approval)).toMatchObject({ text: '1', enter: false, label: 'Allow' })
    expect(normalizeCarReply('não', approval)).toMatchObject({ enter: false, label: 'Deny' })
  })

  it('sends anything else verbatim with Enter', () => {
    expect(normalizeCarReply('um teste rápido', numbered)).toEqual({ text: 'um teste rápido', enter: true, label: 'um teste rápido' })
  })

  it('sends verbatim when there is no option menu', () => {
    expect(normalizeCarReply('um', null)).toEqual({ text: 'um', enter: true, label: 'um' })
  })

  it('refuses an empty or oversized reply', () => {
    expect(normalizeCarReply('   ', numbered)).toBeNull()
    expect(normalizeCarReply('x'.repeat(501), null)).toBeNull()
  })

  it('reads no options from a working agent', () => {
    expect(carPermissionOptions({ lastAssistantMessage: '1. Yes\n2. No\nDo you want to proceed?' }, 'working')).toBeNull()
  })
})

describe('createCarReplyDeduplicator', () => {
  it('drops a repeat inside 30 seconds and accepts it after', () => {
    let now = 0
    const accept = createCarReplyDeduplicator(() => now)
    expect(accept('agent-a|5|1')).toBe(true)
    expect(accept('agent-a|5|1')).toBe(false)
    now += CAR_REPLY_DEDUPE_MS
    expect(accept('agent-a|5|1')).toBe(true)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `cd mobile && pnpm exec vitest run src/car/car-reply-normalization.test.ts`
Esperado: FAIL, módulo não encontrado.

- [ ] **Passo 3: implementar**

```ts
// mobile/src/car/car-copy.ts
// The mobile app ships English copy only; every string the car speaks lives here.
export const CAR_COPY = {
  sent: (label: string) => `✓ Sent: ${label}`,
  promptChanged: 'The agent already moved on; reply discarded',
  hostUnverifiable: "No contact with the host; can't tell if the agent is alive",
  agentExited: 'Agent exited',
  desktopTooOld: 'Update Orca desktop to reply from the car',
  replyFromPhone: 'Reply to this one from your phone',
  disconnected: 'No connection to the desktop',
  replyRejected: 'Reply not sent'
} as const
```

```ts
// mobile/src/car/car-reply-normalization.ts
import {
  detectAgentPermission,
  parseApprovalFromStatus,
  type MobileChatPermission
} from '../session/mobile-native-chat-permission'

export type CarReplyKeystroke = { text: string; enter: boolean; label: string }

export const CAR_REPLY_MAX_LENGTH = 500
export const CAR_REPLY_DEDUPE_MS = 30_000

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, one: 1, dois: 2, duas: 2, two: 2, tres: 3, three: 3, quatro: 4, four: 4
}
const YES_WORDS = new Set(['sim', 'yes', 'pode', 'allow', 'aprovar'])
const NO_WORDS = new Set(['nao', 'no', 'deny', 'negar'])

function spokenToken(spoken: string): string {
  return spoken.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[.!?,]+$/u, '')
}

/** Reuses the phone's existing permission parsers so the car sends the same keys as the chat cards. */
export function carPermissionOptions(
  permission: { interactivePrompt?: string; lastAssistantMessage?: string } | undefined,
  state: string
): MobileChatPermission | null {
  if (!permission) {
    return null
  }
  return (
    detectAgentPermission({ state, lastAssistantMessage: permission.lastAssistantMessage }) ??
    parseApprovalFromStatus(permission.interactivePrompt)
  )
}

export function normalizeCarReply(
  spoken: string,
  permission: MobileChatPermission | null
): CarReplyKeystroke | null {
  const trimmed = spoken.trim()
  if (!trimmed || trimmed.length > CAR_REPLY_MAX_LENGTH) {
    return null
  }
  const verbatim = { text: trimmed, enter: true, label: trimmed }
  if (!permission) {
    return verbatim
  }
  const token = spokenToken(trimmed)
  const index = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token]
  if (index !== undefined) {
    const option = permission.options[index - 1]
    return option ? { text: option.send, enter: false, label: option.label } : verbatim
  }
  if (YES_WORDS.has(token)) {
    const option = permission.options[0]
    return option ? { text: option.send, enter: false, label: option.label } : verbatim
  }
  if (NO_WORDS.has(token)) {
    const option = permission.options.find((candidate) => /deny|no\b/i.test(candidate.label)) ?? permission.options.at(-1)
    return option ? { text: option.send, enter: false, label: option.label } : verbatim
  }
  return verbatim
}

export function createCarReplyDeduplicator(now: () => number): (key: string) => boolean {
  const seen = new Map<string, number>()
  return (key) => {
    const at = now()
    const previous = seen.get(key)
    if (previous !== undefined && at - previous < CAR_REPLY_DEDUPE_MS) {
      return false
    }
    seen.set(key, at)
    return true
  }
}
```

Se a ordem ou os rótulos que `detectAgentPermission` devolve para o menu numerado forem outros, ajuste só as expectativas de `label` do teste ao que o parser existente produz; não mude o parser.

- [ ] **Passo 4: rodar e ver passar**

Rodar: `cd mobile && pnpm exec vitest run src/car/car-reply-normalization.test.ts`
Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add mobile/src/car/car-copy.ts mobile/src/car/car-reply-normalization.ts mobile/src/car/car-reply-normalization.test.ts
git commit -m "feat(mobile): normalize spoken car replies onto the agent's option keys"
```

---

### Tarefa 8: conversas por agente

**Arquivos:**
- Criar: `mobile/src/car/car-conversation-store.ts`
- Criar: `mobile/src/car/car-conversation-store.test.ts`

**Interfaces:**
- Consome: `CarConversation`, `CarMessage` (Tarefa 5), `CAR_COPY` (Tarefa 7).
- Consome o evento do stream, lido localmente com este tipo:

```ts
export type CarNotificationEvent = {
  type: 'notification'
  source: string
  title: string
  body: string
  worktreeId?: string
  notificationId?: string
  notificationSeq?: number
  emittedAt?: number
  agentState?: string
  promptRef?:
    | { kind: 'terminal'; terminalHandle: string; fence: { generation: number; permissionSequence: number; blockedSince: number | null; promptKey: string | null }; permission?: { interactivePrompt?: string; lastAssistantMessage?: string } }
    | { kind: 'structured'; sessionId: string }
}
```

- Produz:

```ts
export type CarPendingPrompt = {
  hostId: string
  terminalHandle: string
  fence: { generation: number; permissionSequence: number; blockedSince: number | null; promptKey: string | null }
  notificationSeq: number
  agentState: string
  permission?: { interactivePrompt?: string; lastAssistantMessage?: string }
}
export function createCarConversationStore(now: () => number): {
  applyEvent(hostId: string, event: CarNotificationEvent): CarConversation | null
  appendOrcaMessage(conversationId: string, text: string): CarConversation | null
  appendMyMessage(conversationId: string, text: string): CarConversation | null
  pendingPrompt(conversationId: string): CarPendingPrompt | null
  clearPendingPrompt(conversationId: string): void
  conversationIds(): string[]
  clear(): void
}
```

- [ ] **Passo 1: teste**

```ts
// mobile/src/car/car-conversation-store.test.ts
import { describe, expect, it } from 'vitest'
import { createCarConversationStore } from './car-conversation-store'

const fence = { generation: 1, permissionSequence: 0, blockedSince: 10, promptKey: null }
const blocked = {
  type: 'notification' as const, source: 'agent-task-complete', title: 'Claude · feat-login', body: 'Allow command: pnpm test?',
  notificationSeq: 7, agentState: 'blocked', emittedAt: 100,
  promptRef: { kind: 'terminal' as const, terminalHandle: 't1', fence }
}

describe('car conversation store', () => {
  it('keeps one stable conversation per terminal', () => {
    const store = createCarConversationStore(() => 1)
    const first = store.applyEvent('h1', blocked)
    const second = store.applyEvent('h1', { ...blocked, notificationSeq: 8, body: 'Allow edit?' })
    expect(first?.id).toBe(second?.id)
    expect(second?.messages.map((m) => m.text)).toEqual(['Allow command: pnpm test?', 'Allow edit?'])
  })

  it('offers a reply only for a fenced terminal prompt', () => {
    const store = createCarConversationStore(() => 1)
    expect(store.applyEvent('h1', blocked)?.canReply).toBe(true)
    const done = store.applyEvent('h1', { ...blocked, notificationSeq: 9, agentState: 'done', promptRef: undefined, body: 'Done' })
    expect(done?.canReply).toBe(false)
    expect(store.pendingPrompt(done!.id)).toBeNull()
  })

  it('keeps structured sessions read-only in phase 1', () => {
    const store = createCarConversationStore(() => 1)
    const conversation = store.applyEvent('h1', { ...blocked, promptRef: { kind: 'structured', sessionId: 's1' } })
    expect(conversation?.canReply).toBe(false)
    expect(conversation?.messages.at(-1)?.text).toContain('Reply to this one from your phone')
  })

  it('announces an exited agent with the exited wording', () => {
    const store = createCarConversationStore(() => 1)
    const conversation = store.applyEvent('h1', { type: 'notification', source: 'agent-exited', title: 'Agent exited', body: '', notificationId: 'agent-exited:p1' })
    expect(conversation?.messages.at(-1)?.text).toBe('Agent exited')
  })

  it('ignores terminal bells and tests', () => {
    const store = createCarConversationStore(() => 1)
    expect(store.applyEvent('h1', { ...blocked, source: 'terminal-bell' })).toBeNull()
    expect(store.applyEvent('h1', { ...blocked, source: 'test' })).toBeNull()
  })

  it('forgets everything on clear', () => {
    const store = createCarConversationStore(() => 1)
    store.applyEvent('h1', blocked)
    store.clear()
    expect(store.conversationIds()).toEqual([])
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `cd mobile && pnpm exec vitest run src/car/car-conversation-store.test.ts`
Esperado: FAIL, módulo não encontrado.

- [ ] **Passo 3: implementar**

```ts
// mobile/src/car/car-conversation-store.ts
import type { CarConversation, CarMessage } from '../../modules/orca-car-messaging/src'
import { CAR_COPY } from './car-copy'

export type CarNotificationEvent = {
  type: 'notification'
  source: string
  title: string
  body: string
  worktreeId?: string
  notificationId?: string
  notificationSeq?: number
  emittedAt?: number
  agentState?: string
  promptRef?:
    | {
        kind: 'terminal'
        terminalHandle: string
        fence: { generation: number; permissionSequence: number; blockedSince: number | null; promptKey: string | null }
        permission?: { interactivePrompt?: string; lastAssistantMessage?: string }
      }
    | { kind: 'structured'; sessionId: string }
}

export type CarPendingPrompt = {
  hostId: string
  terminalHandle: string
  fence: { generation: number; permissionSequence: number; blockedSince: number | null; promptKey: string | null }
  notificationSeq: number
  agentState: string
  permission?: { interactivePrompt?: string; lastAssistantMessage?: string }
}

const CAR_SOURCES = new Set(['agent-task-complete', 'agent-exited', 'plugin'])
// Android Auto reads only unread messages of the current session; a short tail keeps the readout brief.
const MAX_MESSAGES = 5

function conversationIdFor(hostId: string, event: CarNotificationEvent): string {
  if (event.promptRef?.kind === 'terminal') {
    return `${hostId}:terminal:${event.promptRef.terminalHandle}`
  }
  if (event.promptRef?.kind === 'structured') {
    return `${hostId}:session:${event.promptRef.sessionId}`
  }
  return `${hostId}:${event.notificationId ?? event.worktreeId ?? event.title}`
}

export function createCarConversationStore(now: () => number) {
  const conversations = new Map<string, CarConversation>()
  const pending = new Map<string, CarPendingPrompt>()

  const append = (id: string, message: CarMessage): CarConversation | null => {
    const current = conversations.get(id)
    if (!current) {
      return null
    }
    const next = { ...current, messages: [...current.messages, message].slice(-MAX_MESSAGES) }
    conversations.set(id, next)
    return next
  }

  return {
    applyEvent(hostId: string, event: CarNotificationEvent): CarConversation | null {
      if (event.type !== 'notification' || !CAR_SOURCES.has(event.source)) {
        return null
      }
      const id = conversationIdFor(hostId, event)
      const at = event.emittedAt ?? now()
      const text = event.source === 'agent-exited' ? CAR_COPY.agentExited : event.body || event.title
      const ref = event.promptRef
      if (ref?.kind === 'terminal' && event.notificationSeq !== undefined) {
        pending.set(id, {
          hostId,
          terminalHandle: ref.terminalHandle,
          fence: ref.fence,
          notificationSeq: event.notificationSeq,
          agentState: event.agentState ?? 'blocked',
          ...(ref.permission ? { permission: ref.permission } : {})
        })
      } else {
        pending.delete(id)
      }
      const messages: CarMessage[] = [
        ...(conversations.get(id)?.messages ?? []),
        { sender: 'agent', text, timestamp: at },
        ...(ref?.kind === 'structured' ? [{ sender: 'orca' as const, text: CAR_COPY.replyFromPhone, timestamp: at }] : [])
      ]
      const next: CarConversation = { id, title: event.title, messages: messages.slice(-MAX_MESSAGES), canReply: pending.has(id) }
      conversations.set(id, next)
      return next
    },
    appendOrcaMessage: (id: string, text: string) => append(id, { sender: 'orca', text, timestamp: now() }),
    appendMyMessage: (id: string, text: string) => append(id, { sender: 'me', text, timestamp: now() }),
    pendingPrompt: (id: string) => pending.get(id) ?? null,
    clearPendingPrompt(id: string) {
      pending.delete(id)
      const current = conversations.get(id)
      if (current) {
        conversations.set(id, { ...current, canReply: false })
      }
    },
    conversationIds: () => [...conversations.keys()],
    clear() {
      conversations.clear()
      pending.clear()
    }
  }
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `cd mobile && pnpm exec vitest run src/car/car-conversation-store.test.ts`
Esperado: PASS, 6 testes.

- [ ] **Passo 5: commit**

```bash
git add mobile/src/car/car-conversation-store.ts mobile/src/car/car-conversation-store.test.ts
git commit -m "feat(mobile): keep one car conversation per agent with its pending prompt"
```

---

### Tarefa 9: operação RPC e roteador de respostas

**Arquivos:**
- Criar: `mobile/src/car/car-reply-operations.ts`
- Criar: `mobile/src/car/car-reply-router.ts`
- Criar: `mobile/src/car/car-reply-router.test.ts`

**Interfaces:**
- Consome: `normalizeCarReply`, `carPermissionOptions`, `createCarReplyDeduplicator` (Tarefa 7); `CarPendingPrompt` (Tarefa 8); `CAR_COPY`; `isMethodNotFoundRefusal` de `mobile/src/transport/rpc-acceptance-policies.ts:24`.
- Produz:

```ts
export type CarReplyOutcome =
  | { kind: 'delivered'; label: string }
  | { kind: 'prompt-changed' }
  | { kind: 'unsupported' }
  | { kind: 'unverifiable' }
  | { kind: 'rejected' }
  | { kind: 'duplicate' }
export function createCarReplyRouter(deps: {
  send(hostId: string, params: { terminal: string; fence: CarPendingPrompt['fence']; text: string; enter: boolean }): Promise<CarReplySendResult>
  now(): number
}): { reply(conversationId: string, prompt: CarPendingPrompt, spoken: string): Promise<CarReplyOutcome>; isHostUnsupported(hostId: string): boolean }
export type CarReplySendResult = 'delivered' | 'prompt-changed' | 'method-not-found' | 'disconnected' | 'unverifiable' | 'failed'
export function carReplyReceipt(outcome: CarReplyOutcome): string | null
```

- [ ] **Passo 1: teste**

```ts
// mobile/src/car/car-reply-router.test.ts
import { describe, expect, it, vi } from 'vitest'
import { carReplyReceipt, createCarReplyRouter } from './car-reply-router'

const prompt = {
  hostId: 'h1', terminalHandle: 't1', notificationSeq: 7, agentState: 'blocked',
  fence: { generation: 1, permissionSequence: 0, blockedSince: 10, promptKey: null },
  permission: { lastAssistantMessage: 'Do you want to proceed?\n1. Yes\n2. No' }
}

describe('car reply router', () => {
  it('sends the option key for a spoken number and reports the label', async () => {
    const send = vi.fn().mockResolvedValue('delivered')
    const router = createCarReplyRouter({ send, now: () => 0 })
    const outcome = await router.reply('c1', prompt, 'um')
    expect(send).toHaveBeenCalledWith('h1', { terminal: 't1', fence: prompt.fence, text: '1', enter: false })
    expect(outcome).toEqual({ kind: 'delivered', label: 'Yes' })
    expect(carReplyReceipt(outcome)).toBe('✓ Sent: Yes')
  })

  it('reports a prompt that changed and sends nothing again', async () => {
    const send = vi.fn().mockResolvedValue('prompt-changed')
    const outcome = await createCarReplyRouter({ send, now: () => 0 }).reply('c1', prompt, 'um')
    expect(outcome.kind).toBe('prompt-changed')
    expect(send).toHaveBeenCalledTimes(1)
    expect(carReplyReceipt(outcome)).toBe('The agent already moved on; reply discarded')
  })

  it('marks a host without the method and stops offering replies there', async () => {
    const send = vi.fn().mockResolvedValue('method-not-found')
    const router = createCarReplyRouter({ send, now: () => 0 })
    expect((await router.reply('c1', prompt, 'um')).kind).toBe('unsupported')
    expect(router.isHostUnsupported('h1')).toBe(true)
  })

  it('never queues a reply while disconnected', async () => {
    const send = vi.fn().mockResolvedValue('disconnected')
    const outcome = await createCarReplyRouter({ send, now: () => 0 }).reply('c1', prompt, 'um')
    expect(outcome.kind).toBe('rejected')
  })

  it('says unverifiable for a host it cannot reach, never exited', async () => {
    const send = vi.fn().mockResolvedValue('unverifiable')
    const outcome = await createCarReplyRouter({ send, now: () => 0 }).reply('c1', prompt, 'um')
    expect(carReplyReceipt(outcome)).toBe("No contact with the host; can't tell if the agent is alive")
  })

  it('drops the same delivery repeated by Android Auto', async () => {
    const send = vi.fn().mockResolvedValue('delivered')
    const router = createCarReplyRouter({ send, now: () => 0 })
    await router.reply('c1', prompt, 'um')
    expect((await router.reply('c1', prompt, 'um')).kind).toBe('duplicate')
    expect(send).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `cd mobile && pnpm exec vitest run src/car/car-reply-router.test.ts`
Esperado: FAIL, módulo não encontrado.

- [ ] **Passo 3: operação RPC**

```ts
// mobile/src/car/car-reply-operations.ts
import { z } from 'zod'
import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc-operation'
import { rpcResultVariant } from '../transport/rpc-operation-result-reader'

const carReplySchema = z
  .looseObject({ delivered: z.boolean(), reason: z.string().optional() })
  .transform((reply) => (reply.delivered ? 'delivered' : reply.reason === 'prompt-changed' ? 'prompt-changed' : 'failed'))

/** Fenced reply to the prompt the car announced; the host refuses when the prompt moved on. */
export const carAgentPromptReply = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'terminal.car-agent-prompt-reply',
    method: 'terminal.replyToAgentPrompt',
    acceptance: 'object-result-or-null',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('car-agent-prompt-reply', carReplySchema)
  })
)
```

Confirme as assinaturas de `defineRpcOperation` e `rpcResultVariant` contra o exemplo de `mobile/src/session/mobile-session-write-operations.ts:28-36`.

- [ ] **Passo 4: roteador**

```ts
// mobile/src/car/car-reply-router.ts
import { CAR_COPY } from './car-copy'
import type { CarPendingPrompt } from './car-conversation-store'
import { carPermissionOptions, createCarReplyDeduplicator, normalizeCarReply } from './car-reply-normalization'

export type CarReplySendResult = 'delivered' | 'prompt-changed' | 'method-not-found' | 'disconnected' | 'unverifiable' | 'failed'

export type CarReplyOutcome =
  | { kind: 'delivered'; label: string }
  | { kind: 'prompt-changed' }
  | { kind: 'unsupported' }
  | { kind: 'unverifiable' }
  | { kind: 'rejected' }
  | { kind: 'duplicate' }

type Deps = {
  send(hostId: string, params: { terminal: string; fence: CarPendingPrompt['fence']; text: string; enter: boolean }): Promise<CarReplySendResult>
  now(): number
}

export function createCarReplyRouter(deps: Deps) {
  const unsupportedHosts = new Set<string>()
  const accept = createCarReplyDeduplicator(deps.now)

  return {
    isHostUnsupported: (hostId: string) => unsupportedHosts.has(hostId),
    async reply(conversationId: string, prompt: CarPendingPrompt, spoken: string): Promise<CarReplyOutcome> {
      const keystroke = normalizeCarReply(spoken, carPermissionOptions(prompt.permission, prompt.agentState))
      if (!keystroke) {
        return { kind: 'rejected' }
      }
      if (!accept(`${conversationId}|${prompt.notificationSeq}|${keystroke.text}`)) {
        return { kind: 'duplicate' }
      }
      const result = await deps.send(prompt.hostId, {
        terminal: prompt.terminalHandle,
        fence: prompt.fence,
        text: keystroke.text,
        enter: keystroke.enter
      })
      switch (result) {
        case 'delivered':
          return { kind: 'delivered', label: keystroke.label }
        case 'prompt-changed':
          return { kind: 'prompt-changed' }
        case 'method-not-found':
          unsupportedHosts.add(prompt.hostId)
          return { kind: 'unsupported' }
        case 'unverifiable':
          return { kind: 'unverifiable' }
        default:
          return { kind: 'rejected' }
      }
    }
  }
}

export function carReplyReceipt(outcome: CarReplyOutcome): string | null {
  switch (outcome.kind) {
    case 'delivered':
      return CAR_COPY.sent(outcome.label)
    case 'prompt-changed':
      return CAR_COPY.promptChanged
    case 'unsupported':
      return CAR_COPY.desktopTooOld
    case 'unverifiable':
      return CAR_COPY.hostUnverifiable
    case 'rejected':
      return CAR_COPY.replyRejected
    case 'duplicate':
      return null
  }
}
```

- [ ] **Passo 5: rodar e ver passar**

Rodar: `cd mobile && pnpm exec vitest run src/car/car-reply-router.test.ts`
Esperado: PASS, 6 testes.

- [ ] **Passo 6: commit**

```bash
git add mobile/src/car/car-reply-operations.ts mobile/src/car/car-reply-router.ts mobile/src/car/car-reply-router.test.ts
git commit -m "feat(mobile): route car replies through the fenced host method with receipts"
```

---

### Tarefa 10: ponte da sessão de carro

**Arquivos:**
- Criar: `mobile/src/car/car-session-bridge.ts`
- Criar: `mobile/src/car/car-session-bridge.test.ts`
- Criar: `mobile/src/car/use-car-session-bridge.ts`
- Modificar: `mobile/src/transport/rpc-subscription-inventory.ts`
- Modificar: `mobile/app/_layout.tsx` (montar o hook)
- Modificar: `mobile/src/transport/persisted-connection-log-store.ts` (helper de log do carro)

**Interfaces:**
- Consome: `carSessionStore` (Tarefa 6), `OrcaCarMessaging` (Tarefa 5), `createCarConversationStore` (Tarefa 8), `createCarReplyRouter`, `carReplyReceipt`, `carAgentPromptReply` (Tarefa 9), `isMethodNotFoundRefusal`.
- Produz:

```ts
export type CarBridgeHost = { hostId: string; client: RpcClient }
export const CAR_DISCONNECTED_NOTICE_MS = 60_000
export const CAR_SYSTEM_CONVERSATION_ID = 'orca:system'
export function createCarSessionBridge(deps: {
  messaging: Pick<typeof OrcaCarMessaging, 'startSession' | 'stopSession' | 'publishConversation' | 'clearConversation' | 'clearConversations' | 'addReplyListener'>
  subscribe(host: CarBridgeHost, onEvent: (event: unknown) => void): () => void
  send: Parameters<typeof createCarReplyRouter>[0]['send']
  log(hostId: string, code: 'car-session-started' | 'car-session-ended' | 'car-reply-delivered' | 'car-reply-refused', detail: string): void
  canNotify(): Promise<boolean>
  now(): number
}): {
  start(hosts: CarBridgeHost[]): Promise<'started' | 'no-notification-permission'>
  stop(): Promise<void>
  setHosts(hosts: CarBridgeHost[]): void
}
```

- [ ] **Passo 1: teste**

```ts
// mobile/src/car/car-session-bridge.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createCarSessionBridge } from './car-session-bridge'

function harness(sendResult = 'delivered') {
  let onEvent: (event: unknown) => void = () => {}
  let onReply: (event: { conversationId: string; text: string }) => void = () => {}
  const published: Array<{ id: string; canReply: boolean; messages: Array<{ text: string }> }> = []
  const deps = {
    messaging: {
      startSession: vi.fn().mockResolvedValue(undefined),
      stopSession: vi.fn().mockResolvedValue(undefined),
      publishConversation: vi.fn(async (c) => { published.push(c) }),
      clearConversations: vi.fn().mockResolvedValue(undefined),
      addReplyListener: vi.fn((listener) => { onReply = listener; return { remove() {} } })
    },
    subscribe: vi.fn((_host, listener) => { onEvent = listener; return () => {} }),
    send: vi.fn().mockResolvedValue(sendResult),
    log: vi.fn(),
    now: () => 0
  }
  const bridge = createCarSessionBridge(deps)
  return { bridge, deps, published, emit: (e: unknown) => onEvent(e), reply: (e: { conversationId: string; text: string }) => onReply(e) }
}

const blocked = {
  type: 'notification', source: 'agent-task-complete', title: 'Claude · feat-login', body: 'Allow command?',
  notificationSeq: 7, agentState: 'blocked',
  promptRef: { kind: 'terminal', terminalHandle: 't1', fence: { generation: 1, permissionSequence: 0, blockedSince: 10, promptKey: null },
    permission: { lastAssistantMessage: 'Do you want to proceed?\n1. Yes\n2. No' } }
}

describe('car session bridge', () => {
  it('publishes a blocked agent as a repliable conversation', async () => {
    const h = harness()
    await h.bridge.start([{ hostId: 'h1', client: {} as never }])
    h.emit(blocked)
    await Promise.resolve()
    expect(h.published.at(-1)).toMatchObject({ canReply: true })
    expect(h.deps.log).toHaveBeenCalledWith('h1', 'car-session-started', expect.any(String))
  })

  it('answers a voice reply and appends the receipt without logging the text', async () => {
    const h = harness()
    await h.bridge.start([{ hostId: 'h1', client: {} as never }])
    h.emit(blocked)
    await Promise.resolve()
    const id = h.published.at(-1)!.id
    h.reply({ conversationId: id, text: 'um' })
    await vi.waitFor(() => expect(h.published.at(-1)?.messages.at(-1)?.text).toBe('✓ Sent: Yes'))
    expect(h.published.at(-1)?.canReply).toBe(false)
    const logged = JSON.stringify(h.deps.log.mock.calls)
    expect(logged).not.toContain('"um"')
  })

  it('stops offering replies on a host without the method', async () => {
    const h = harness('method-not-found')
    await h.bridge.start([{ hostId: 'h1', client: {} as never }])
    h.emit(blocked)
    await Promise.resolve()
    h.reply({ conversationId: h.published.at(-1)!.id, text: 'um' })
    await vi.waitFor(() => expect(h.published.at(-1)?.messages.at(-1)?.text).toBe('Update Orca desktop to reply from the car'))
    h.emit({ ...blocked, notificationSeq: 8 })
    await Promise.resolve()
    expect(h.published.at(-1)?.canReply).toBe(false)
  })

  it('clears the car conversations and stops the service on stop', async () => {
    const h = harness()
    await h.bridge.start([{ hostId: 'h1', client: {} as never }])
    await h.bridge.stop()
    expect(h.deps.messaging.clearConversations).toHaveBeenCalled()
    expect(h.deps.messaging.stopSession).toHaveBeenCalled()
  })

  it('does not start without notification permission', async () => {
    const h = harness()
    h.deps.canNotify.mockResolvedValue(false)
    await expect(h.bridge.start([{ hostId: 'h1', client: {} as never }])).resolves.toBe('no-notification-permission')
    expect(h.deps.messaging.startSession).not.toHaveBeenCalled()
  })

  it('says once that the desktop is unreachable after 60 seconds, and only once', async () => {
    vi.useFakeTimers()
    const h = harness()
    await h.bridge.start([{ hostId: 'h1', client: {} as never }])
    h.bridge.setHosts([])
    vi.advanceTimersByTime(CAR_DISCONNECTED_NOTICE_MS)
    vi.advanceTimersByTime(CAR_DISCONNECTED_NOTICE_MS)
    const notices = h.published.filter((c) => c.messages.at(-1)?.text === 'No connection to the desktop')
    expect(notices).toHaveLength(1)
    h.bridge.setHosts([{ hostId: 'h1', client: {} as never }])
    expect(h.deps.messaging.clearConversation).toHaveBeenCalledWith(CAR_SYSTEM_CONVERSATION_ID)
    vi.useRealTimers()
  })
})
```

Acrescente ao `harness` as dependências `canNotify: vi.fn().mockResolvedValue(true)` e, em `messaging`, `clearConversation: vi.fn().mockResolvedValue(undefined)`, e importe `CAR_DISCONNECTED_NOTICE_MS` e `CAR_SYSTEM_CONVERSATION_ID` de `./car-session-bridge`.

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `cd mobile && pnpm exec vitest run src/car/car-session-bridge.test.ts`
Esperado: FAIL, módulo não encontrado.

- [ ] **Passo 3: implementar a ponte**

```ts
// mobile/src/car/car-session-bridge.ts
import type { OrcaCarMessaging } from '../../modules/orca-car-messaging/src'
import type { RpcClient } from '../transport/rpc-client'
import { CAR_COPY } from './car-copy'
import { createCarConversationStore, type CarNotificationEvent } from './car-conversation-store'
import { carReplyReceipt, createCarReplyRouter } from './car-reply-router'

export type CarBridgeHost = { hostId: string; client: RpcClient }
type LogCode = 'car-session-started' | 'car-session-ended' | 'car-reply-delivered' | 'car-reply-refused'

type Deps = {
  messaging: Pick<
    typeof OrcaCarMessaging,
    'startSession' | 'stopSession' | 'publishConversation' | 'clearConversation' | 'clearConversations' | 'addReplyListener'
  >
  subscribe(host: CarBridgeHost, onEvent: (event: unknown) => void): () => void
  send: Parameters<typeof createCarReplyRouter>[0]['send']
  log(hostId: string, code: LogCode, detail: string): void
  canNotify(): Promise<boolean>
  now(): number
}

export const CAR_DISCONNECTED_NOTICE_MS = 60_000
export const CAR_SYSTEM_CONVERSATION_ID = 'orca:system'

function isCarNotificationEvent(value: unknown): value is CarNotificationEvent {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'notification'
}

export function createCarSessionBridge(deps: Deps) {
  const conversations = createCarConversationStore(deps.now)
  const router = createCarReplyRouter({ send: deps.send, now: deps.now })
  const subscriptions = new Map<string, () => void>()
  let replyListener: { remove(): void } | null = null

  const publish = (conversation: ReturnType<typeof conversations.applyEvent>) => {
    if (conversation) {
      void deps.messaging.publishConversation(conversation)
    }
  }

  const onEvent = (hostId: string) => (event: unknown) => {
    if (!isCarNotificationEvent(event)) {
      return
    }
    const conversation = conversations.applyEvent(hostId, event)
    if (conversation && router.isHostUnsupported(hostId)) {
      conversations.clearPendingPrompt(conversation.id)
      publish({ ...conversation, canReply: false })
      return
    }
    publish(conversation)
  }

  const handleReply = async ({ conversationId, text }: { conversationId: string; text: string }) => {
    const prompt = conversations.pendingPrompt(conversationId)
    if (!prompt) {
      publish(conversations.appendOrcaMessage(conversationId, carReplyReceipt({ kind: 'prompt-changed' }) ?? ''))
      return
    }
    conversations.appendMyMessage(conversationId, text)
    const outcome = await router.reply(conversationId, prompt, text)
    if (outcome.kind === 'duplicate') {
      return
    }
    conversations.clearPendingPrompt(conversationId)
    deps.log(
      prompt.hostId,
      outcome.kind === 'delivered' ? 'car-reply-delivered' : 'car-reply-refused',
      `${outcome.kind}, ${text.length} chars`
    )
    publish(conversations.appendOrcaMessage(conversationId, carReplyReceipt(outcome) ?? ''))
  }

  let disconnectedTimer: ReturnType<typeof setTimeout> | null = null
  let disconnectedNoticeShown = false

  // One notice per outage; replies are never queued meanwhile.
  const trackReachability = (connectedHosts: number) => {
    if (connectedHosts > 0) {
      if (disconnectedTimer) {
        clearTimeout(disconnectedTimer)
        disconnectedTimer = null
      }
      if (disconnectedNoticeShown) {
        disconnectedNoticeShown = false
        void deps.messaging.clearConversation(CAR_SYSTEM_CONVERSATION_ID)
      }
      return
    }
    if (disconnectedTimer || disconnectedNoticeShown) {
      return
    }
    disconnectedTimer = setTimeout(() => {
      disconnectedTimer = null
      disconnectedNoticeShown = true
      void deps.messaging.publishConversation({
        id: CAR_SYSTEM_CONVERSATION_ID,
        title: 'Orca',
        canReply: false,
        messages: [{ sender: 'orca', text: CAR_COPY.disconnected, timestamp: deps.now() }]
      })
    }, CAR_DISCONNECTED_NOTICE_MS)
  }

  const setHosts = (hosts: CarBridgeHost[]) => {
    trackReachability(hosts.length)
    const wanted = new Set(hosts.map((host) => host.hostId))
    for (const [hostId, unsubscribe] of subscriptions) {
      if (!wanted.has(hostId)) {
        unsubscribe()
        subscriptions.delete(hostId)
      }
    }
    for (const host of hosts) {
      if (!subscriptions.has(host.hostId)) {
        subscriptions.set(host.hostId, deps.subscribe(host, onEvent(host.hostId)))
        deps.log(host.hostId, 'car-session-started', 'notifications stream attached')
      }
    }
  }

  return {
    async start(hosts: CarBridgeHost[]): Promise<'started' | 'no-notification-permission'> {
      if (!(await deps.canNotify())) {
        return 'no-notification-permission'
      }
      await deps.messaging.startSession()
      replyListener = deps.messaging.addReplyListener((event) => void handleReply(event))
      setHosts(hosts)
      return 'started'
    },
    setHosts,
    async stop() {
      if (disconnectedTimer) {
        clearTimeout(disconnectedTimer)
        disconnectedTimer = null
      }
      for (const [hostId, unsubscribe] of subscriptions) {
        unsubscribe()
        deps.log(hostId, 'car-session-ended', 'car session ended')
      }
      subscriptions.clear()
      replyListener?.remove()
      replyListener = null
      conversations.clear()
      await deps.messaging.clearConversations()
      await deps.messaging.stopSession()
    }
  }
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `cd mobile && pnpm exec vitest run src/car/car-session-bridge.test.ts`
Esperado: PASS, 4 testes.

- [ ] **Passo 5: ligar ao app**

Crie `mobile/src/car/use-car-session-bridge.ts`:

```ts
import * as Notifications from 'expo-notifications'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { OrcaCarMessaging } from '../../modules/orca-car-messaging/src'
import { isMethodNotFoundRefusal } from '../transport/rpc-acceptance-policies'
import { connectionLogStore } from '../transport/persisted-connection-log-store'
import { loadCarModeEnabled } from '../storage/preferences'
import { carAgentPromptReply } from './car-reply-operations'
import { createCarSessionBridge, type CarBridgeHost } from './car-session-bridge'
import { carSessionStore } from './car-session-store'

/** Mounted once at the root; hosts are the connected paired desktops. */
export function useCarSessionBridge(hosts: CarBridgeHost[]): void {
  const snapshot = useSyncExternalStore(carSessionStore.subscribe, carSessionStore.getSnapshot)
  const hostsRef = useRef(hosts)
  hostsRef.current = hosts
  const bridgeRef = useRef<ReturnType<typeof createCarSessionBridge> | null>(null)

  useEffect(() => {
    void loadCarModeEnabled().then((enabled) => carSessionStore.setCarModeEnabled(enabled))
    const projection = OrcaCarMessaging.addProjectionListener(({ projecting }) => carSessionStore.setProjecting(projecting))
    return () => projection.remove()
  }, [])

  useEffect(() => {
    if (snapshot.phase === 'inactive') {
      void bridgeRef.current?.stop()
      bridgeRef.current = null
      return
    }
    if (!bridgeRef.current) {
      bridgeRef.current = createCarSessionBridge({
        messaging: OrcaCarMessaging,
        subscribe: (host, onEvent) =>
          host.client.subscribe('notifications.subscribe', { includeDesktopSuppressed: true }, onEvent),
        send: async (hostId, params) => {
          const host = hostsRef.current.find((candidate) => candidate.hostId === hostId)
          if (!host) {
            return 'disconnected'
          }
          let response: Awaited<ReturnType<typeof carAgentPromptReply.request>>
          try {
            response = await carAgentPromptReply.request(host.client, params, { failWhenDisconnected: true })
          } catch {
            return 'disconnected'
          }
          if (isMethodNotFoundRefusal(response)) {
            return 'method-not-found'
          }
          return carAgentPromptReply.interpret(response) ?? 'failed'
        },
        log: (hostId, code, detail) =>
          connectionLogStore.append(hostId, { id: `${code}-${Date.now()}`, ts: Date.now(), level: 'info', code, message: code, detail }),
        canNotify: async () => (await Notifications.getPermissionsAsync()).granted,
        now: Date.now
      })
      void bridgeRef.current.start(hostsRef.current).then((result) => {
        if (result === 'no-notification-permission') {
          // The settings screen reads this to explain why Car mode stays off.
          carSessionStore.setCarModeEnabled(false)
        }
      })
    }
  }, [snapshot.phase])

  useEffect(() => {
    bridgeRef.current?.setHosts(hosts)
  }, [hosts])
}
```

Adapte a forma de `client.subscribe` e do retorno do `unsubscribe` ao que `mobile/src/notifications/mobile-notifications.ts:29-52` faz, inclusive chamando `desktopNotificationStreamUnsubscribe` no fim. Registre o novo `client.subscribe('notifications.subscribe', ...)` em `rpc-subscription-inventory.ts` com `{ kind: 'unwritten-scenario' }`, como o inventário exige. Para o erro de host SSH sem contato, mapeie para `'unverifiable'` a recusa do host cujo código o `terminal.send` usa para host remoto sem contato; descubra o código com `rg -n "unverifiable" src/main/runtime/rpc/methods/terminal`.

Monte o hook em `app/_layout.tsx`, dentro do `RpcClientProvider`, passando os hosts conectados que `use-mobile-home-host-connections.ts:44-101` já obtém com `useAllHostClients`.

- [ ] **Passo 6: rodar a suíte do mobile e typecheck**

Rodar: `cd mobile && pnpm exec vitest run src/car src/transport src/notifications && pnpm typecheck && pnpm lint`
Esperado: PASS, inclusive `rpc-subscription-boundary.test.ts` e `unvalidated-rpc-request-port-boundary.test.ts`.

- [ ] **Passo 7: commit**

```bash
git add mobile/src/car mobile/src/transport mobile/app/_layout.tsx
git commit -m "feat(mobile): bridge the car session to the desktop notification stream"
```

---

### Tarefa 11: cenário no mock server e roteiros

**Arquivos:**
- Criar: `mobile/scripts/mock-server-car-scenario.ts`
- Modificar: `mobile/scripts/mock-server-rpc-handlers.ts:127-136`
- Criar: `specs/stories/ST-07-roteiros.md`

**Interfaces:**
- Consome: as respostas que os métodos reais devolvem (Tarefas 2 e 3).
- Produz: `handleMockCarRequest(request, respond, success, error): boolean`, ativo com `MOCK_CAR=1`.

- [ ] **Passo 1: cenário**

```ts
// mobile/scripts/mock-server-car-scenario.ts
type Request = { id: string; method: string; params?: Record<string, unknown> }
type Respond = (message: unknown) => void
type Success = (id: string, result: unknown, streaming?: boolean) => unknown
type Failure = (id: string, code: string, message: string) => unknown

const FENCE = { generation: 1, permissionSequence: 1, blockedSince: 1_000, promptKey: null }
let promptAnswered = false

function blockedEvent(seq: number) {
  return {
    type: 'notification',
    source: 'agent-task-complete',
    title: 'Claude · feat-login',
    body: 'Allow command: pnpm test?',
    worktreeId: 'mock-worktree',
    notificationSeq: seq,
    emittedAt: Date.now(),
    agentState: 'blocked',
    promptRef: {
      kind: 'terminal',
      terminalHandle: 'mock-terminal',
      fence: FENCE,
      permission: { lastAssistantMessage: 'Do you want to proceed?\n1. Yes\n2. No' }
    }
  }
}

export function handleMockCarRequest(request: Request, respond: Respond, success: Success, error: Failure): boolean {
  if (process.env.MOCK_CAR !== '1') {
    return false
  }
  switch (request.method) {
    case 'notifications.subscribe':
      respond(success(request.id, { type: 'ready', subscriptionId: 'mock-car', epoch: 'mock-epoch' }, true))
      // A blocked agent shortly after attach, so the DHU shows the announcement without manual steps.
      setTimeout(() => respond(success(request.id, blockedEvent(1), true)), 3_000)
      return true
    case 'notifications.unsubscribe':
      respond(success(request.id, { unsubscribed: true }))
      return true
    case 'terminal.replyToAgentPrompt': {
      const fence = request.params?.fence
      const matches = JSON.stringify(fence) === JSON.stringify(FENCE) && !promptAnswered
      promptAnswered = promptAnswered || matches
      respond(success(request.id, matches ? { delivered: true } : { delivered: false, reason: 'prompt-changed' }))
      return true
    }
    default:
      return false
  }
}
```

Em `mock-server-rpc-handlers.ts`, coloque `handleMockCarRequest(request, respond, success, error) ||` como o primeiro item da cadeia das linhas 127-134, para que o cenário do carro tenha prioridade sobre `notifications.subscribe` quando `MOCK_CAR=1`.

- [ ] **Passo 2: roteiros**

Crie `specs/stories/ST-07-roteiros.md` com este conteúdo:

```markdown
# ST-07: roteiros de validação da fase 1

## Roteiro no DHU (sem o desktop real)

1. Em `mobile/`, rodar `MOCK_CAR=1 pnpm mock-server`.
2. Instalar o APK de debug no celular e parear com `ws://<ip-do-pc>:6768` e o token `mock-device-token`.
3. No celular, ativar o modo desenvolvedor do Android Auto e iniciar o servidor da unidade principal.
4. No PC, rodar `adb forward tcp:5277 tcp:5277` e abrir `desktop-head-unit.exe` em `%LOCALAPPDATA%\Android\Sdk\extras\google\auto`.
5. No app, ligar "Car mode".
6. Esperado: em até 5 segundos, o DHU anuncia "Allow command: pnpm test?" de "Claude · feat-login".
7. Responder "one" (ou "um") pelo DHU e confirmar o envio.
8. Esperado: a conversa recebe "✓ Sent: Yes".
9. Responder de novo à mesma conversa.
10. Esperado: "The agent already moved on; reply discarded".

## Roteiro no carro (desktop real, carro parado)

1. No desktop, abrir um Claude Code numa worktree e pedir algo que exija permissão.
2. Conectar o celular ao C4 Cactus pelo cabo USB, com o Orca aberto uma vez.
3. Esperado: o carro anuncia o pedido de permissão.
4. Responder "um" e confirmar o eco.
5. Esperado: o agente destrava no desktop em até cerca de 5 segundos e o carro recebe o recibo.
6. Soltar o cabo por 30 segundos e reconectar.
7. Esperado: a sessão continua, sem perder a conversa.
8. Desligar o Tailscale no celular por mais de 60 segundos.
9. Esperado: uma única mensagem "No connection to the desktop", que some ao religar.
```

- [ ] **Passo 3: validar no DHU**

Executar o roteiro do DHU.
Esperado: os passos 6, 8 e 10 acontecem como descrito. Registre o resultado e a data no fim de `ST-07-roteiros.md`.

- [ ] **Passo 4: commit**

```bash
git add mobile/scripts/mock-server-car-scenario.ts mobile/scripts/mock-server-rpc-handlers.ts specs/stories/ST-07-roteiros.md
git commit -m "test(mobile): add the car mock scenario and the phase 1 validation scripts"
```

---

### Tarefa 12: alinhar spec e stories ao que o código mostrou

**Arquivos:**
- Modificar: `specs/orca-android-auto-design.md` (seções 4, 5, 6, 9 e 11)
- Modificar: `specs/stories/ST-01-campos-opcionais-no-evento.md`, `ST-02-resposta-guardada-no-host.md`, `ST-05-sessao-de-carro.md`, `ST-06-conversas-e-reply-router.md`
- Criar: `specs/stories/ST-06b-resposta-a-sessoes-estruturadas.md`

- [ ] **Passo 1: registrar as correções**

Aplique ao spec, em frases completas e sem travessões:

1. A guarda do terminal é o `TerminalAgentPromptFence` com `generation`, `permissionSequence` e `blockedSince`, porque o bloqueio vindo do hook HTTP não incrementa a `permissionSequence` e um respawn a zera.
2. O método novo recebe `{ terminal, fence, text, enter }`; teclas de opção vão com `enter: false`, como as respostas de permissão que o celular já envia.
3. A normalização reaproveita `detectAgentPermission` e `parseApprovalFromStatus` do mobile; o host envia `interactivePrompt` e até 4000 caracteres de `lastAssistantMessage` no `promptRef`.
4. O `promptRef` estruturado leva só o `sessionId`; na fase 1, sessões estruturadas avisam no carro sem a ação de responder, e a resposta vai para a ST-06b.
5. A fase 1 não usa `worktree.ps`.
6. A fase 1 não usa tarefa headless: a sessão só começa com o app já iniciado, e o serviço em primeiro plano mantém o processo vivo; a partida a frio entra na fase 2.
7. O aviso de agente encerrado nasce no main, no fato `agent-exited`, e não vai por push, porque o gateway só aceita as fontes de `MOBILE_PUSH_SOURCES`.
8. Os textos do carro estão em inglês em `mobile/src/car/car-copy.ts`, porque o mobile não tem i18n.

- [ ] **Passo 2: criar a ST-06b**

```markdown
# ST-06b: resposta a sessões estruturadas pelo carro

Feature: [FT-01](../features/FT-01-notificacoes-no-carro.md).
Camada: mobile.

## História

Como usuário no carro, quero responder também aos agentes de sessão estruturada.

## Escopo

Ao receber um aviso com `promptRef.kind = 'structured'`, o celular lê o item pendente por `agentSession.history` e fixa `itemId`, `revision` e as opções.
A resposta usa `requestStructuredAgentSessionMutation` com `agentSession.respondToApproval` ou `agentSession.respondToQuestion`.
O `expectedRuntimeFence` vem do estado de `agentSession.subscribe`, que a sessão de carro precisa manter para esse `sessionId`.
As recusas `agent_session_item_revision_stale` e `agent_session_already_resolved` viram "The agent already moved on; reply discarded".

## Critérios de aceite

- [ ] Responder "um" a uma aprovação estruturada escolhe a primeira opção.
- [ ] Uma aprovação já resolvida no desktop gera a mensagem de descarte e nada muda.
```

- [ ] **Passo 3: commit**

```bash
git add specs
git commit -m "docs(android-auto): align the spec with the phase 1 implementation plan"
```

---

## Fora deste plano

As fases 2 e 3 (FT-02 e FT-03) e a ST-06b terão planos próprios.
O CI do mobile não roda Gradle, então os testes Kotlin da Tarefa 5 ficam locais.
