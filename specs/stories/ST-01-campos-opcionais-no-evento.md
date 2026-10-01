# ST-01: campos opcionais no evento de notificação

Feature: [FT-01](../features/FT-01-notificacoes-no-carro.md).
Camada: desktop.

## História

Como usuário no carro, quero que cada aviso diga qual prompt ele destrava, para que a minha resposta chegue ao agente certo.

## Escopo

Acrescentar `promptRef` ao `MobileNotificationDispatchEvent` em `src/main/runtime/runtime-mobile-notification-controller.ts`.
O `promptRef` é `{ kind: 'terminal', terminalHandle, permissionSequence }` ou `{ kind: 'structured', sessionId, itemId, expectedRevision, options }`.
Acrescentar o valor `'agent-exited'` em `source`, emitido só com o veredito `exited`.
Preencher os campos a partir do store de status de agentes, sem criar um produtor novo.

## Critérios de aceite

- [ ] Um evento de agente de terminal bloqueado traz `promptRef.kind = 'terminal'` com a `permissionSequence` atual do painel.
- [ ] Um evento de sessão estruturada traz `promptRef.kind = 'structured'` com o `expectedRevision` e as opções.
- [ ] Um agente sem contato com o host SSH nunca gera `agent-exited`.
- [ ] Um teste mostra que um cliente antigo trata o evento novo como notificação genérica.
- [ ] A mudança segue `docs/reference/remote-wire-compatibility.md`.
