# ST-01: campos opcionais no evento de notificação

Feature: [FT-01](../features/FT-01-notificacoes-no-carro.md).
Camada: desktop.

## História

Como usuário no carro, quero que cada aviso diga qual prompt ele destrava, para que a minha resposta chegue ao agente certo.

## Escopo

Acrescentar `promptRef` ao `MobileNotificationDispatchEvent` em `src/main/runtime/runtime-mobile-notification-controller.ts`.
O `promptRef` é `{ kind: 'terminal', terminalHandle, fence, interactivePrompt, lastAssistantMessage }` ou `{ kind: 'structured', sessionId }`.
A `fence` é `{ generation, permissionSequence, blockedSince, promptKey }`, e o `lastAssistantMessage` leva até 4000 caracteres.
O `promptRef` só é anexado a avisos de bloqueio, e uma falha ao montá-lo nunca suprime a notificação.
Acrescentar o valor `'agent-exited'` em `source`, nascido no main como fato `agent-exited`, publicado com `desktopAllowed: false` e fora do push, porque o gateway só aceita as fontes de `MOBILE_PUSH_SOURCES`.
O aviso é emitido só com o veredito `exited`, ou sem veredito de presença quando a leitura em primeiro plano respondeu.
Preencher os campos a partir do store de status de agentes, sem criar um produtor novo.

## Critérios de aceite

- [ ] Um evento de agente de terminal bloqueado traz `promptRef.kind = 'terminal'` com a `fence` atual do painel.
- [ ] Um evento de sessão estruturada traz `promptRef.kind = 'structured'` só com o `sessionId`.
- [ ] Um agente sem contato com o host SSH, com veredito `unverifiable` ou `live`, nunca gera `agent-exited`.
- [ ] O `agent-exited` não chega a um celular antigo, porque sai com `desktopAllowed: false`.
- [ ] Um teste mostra que um cliente antigo trata o evento novo como notificação genérica.
- [ ] A mudança segue `docs/reference/remote-wire-compatibility.md`.
