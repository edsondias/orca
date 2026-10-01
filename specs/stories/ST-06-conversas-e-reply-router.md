# ST-06: conversas, `ReplyRouter` e recibos

Feature: [FT-01](../features/FT-01-notificacoes-no-carro.md).
Camada: mobile, JS.

## História

Como usuário no carro, quero responder "um" a um agente bloqueado e ouvir a confirmação de que a resposta chegou.

## Escopo

Criar o `CarConversationStore`, que associa cada agente a uma conversa estável pelo `terminalHandle` ou pelo `sessionId`.
Criar a normalização da seção 6 do design, com o limite de 500 caracteres e a deduplicação de 30 segundos.
Ligar a normalização de opções de agentes de terminal só para as CLIs que tiverem transcrição capturada.
Criar o `ReplyRouter`, que usa `agentSession.respondToApproval` ou `respondToQuestion` para sessões estruturadas e `terminal.replyToAgentPrompt` para agentes de terminal.
Guardar por host a marca de que o método novo não existe, e nesse caso não oferecer "Responder".
Publicar o recibo e as mensagens de erro da seção 9 do design.

## Critérios de aceite

- [ ] "um" vira "1" só quando o prompt tem opções numeradas e a frase é só essa palavra.
- [ ] Uma resposta recusada pelo host gera "O agente já seguiu; resposta descartada" e nada é reenviado.
- [ ] Com um host sem o método novo, o aviso aparece sem a ação de responder.
- [ ] As mensagens de `unverifiable` e `exited` usam esse vocabulário, sem sinônimos.
- [ ] O `connection-log` registra tamanho e resultado da resposta, nunca o texto.
