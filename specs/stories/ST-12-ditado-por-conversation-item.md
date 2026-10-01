# ST-12: conversa por agente com ditado

Feature: [FT-03](../features/FT-03-ditado-pelo-painel.md).
Camada: mobile, Kotlin e JS.

## História

Como usuário no carro, quero tocar num agente parado e ditar uma tarefa nova para ele.

## Escopo

Tocar num cartão do painel abre a conversa do agente como `ConversationItem`.
O ditado e a confirmação são do próprio Android Auto.
A resposta passa pelo `ReplyRouter` da ST-06, com as mesmas guardas.
Para um agente bloqueado, a resposta segue a regra da fase 1.
Para um agente parado, o texto vai como instrução nova pelo envio normal do agente.

## Critérios de aceite

- [ ] No DHU, tocar num agente parado, ditar e confirmar faz o agente começar a trabalhar.
- [ ] Tocar num agente bloqueado e responder segue as mesmas guardas da fase 1.
- [ ] Voltar da conversa para o painel não gasta passo do limite de 5 telas.
