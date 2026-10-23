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
