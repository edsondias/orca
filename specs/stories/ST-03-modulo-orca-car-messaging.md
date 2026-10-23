# ST-03: módulo nativo `orca-car-messaging`

Feature: [FT-01](../features/FT-01-notificacoes-no-carro.md).
Camada: mobile, Kotlin.

## História

Como usuário no carro, quero que o Android Auto anuncie os avisos do Orca e aceite a minha resposta por voz.

## Escopo

Criar o módulo Expo `mobile/modules/orca-car-messaging/`, no mesmo padrão de `orca-mobile-web-shell`.
Publicar notificações `MessagingStyle`, com uma conversa por agente e o agente como remetente.
Adicionar a ação "Responder" com exatamente um `RemoteInput`, `SEMANTIC_ACTION_REPLY` e `setShowsUserInterface(false)`.
Adicionar a ação invisível "Marcar como lida" com `SEMANTIC_ACTION_MARK_AS_READ` e `setShowsUserInterface(false)`.
Receber a resposta num serviço sem interface e repassá-la ao JS, ou subir uma tarefa headless quando o JS não estiver vivo.
Gerar `PendingIntent` estáveis por conversa.

## Critérios de aceite

- [ ] Os testes JUnit em `android/src/test` verificam as duas ações e os seus atributos.
- [ ] Os testes verificam que o `PendingIntent` de uma conversa é o mesmo em chamadas repetidas.
- [ ] No DHU, um aviso aparece e uma resposta chega ao JS.
