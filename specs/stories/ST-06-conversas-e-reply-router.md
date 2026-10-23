# ST-06: conversas, `ReplyRouter` e recibos

Feature: [FT-01](../features/FT-01-notificacoes-no-carro.md).
Camada: mobile, JS.

## História

Como usuário no carro, quero responder "um" a um agente bloqueado e ouvir a confirmação de que a resposta chegou.

## Escopo

Criar o `CarConversationStore`, que associa cada agente a uma conversa estável pelo `terminalHandle` ou pelo `sessionId`.
Criar a normalização da seção 6 do design, reaproveitando `parseApprovalFromStatus` e `detectAgentPermission` do mobile, com o limite de 500 caracteres e a deduplicação de 30 segundos.
O envelope de aprovação tem precedência, e a leitura da mensagem só considera o último bloco numerado.
Com um menu de permissão detectado, só as respostas que mapeiam para uma opção seguem, e as outras recebem "Say the option number, or yes or no" com o prompt pendente.
"Não" só mapeia para uma opção cujo rótulo começa com "No" ou "Deny".
Sem menu detectado, nada é enviado, e a conversa é publicada só para leitura com "Reply to this one from your phone".
O carro lê o assunto da permissão, tirado da mesma linha de hook que a `fence`, e nunca o corpo genérico da notificação.
Uma entrega repetida é descartada por 30 segundos, mas uma resposta que falhou por causa transitória pode ser tentada de novo na hora.
Criar o `ReplyRouter`, que usa `terminal.replyToAgentPrompt { terminal, fence, text, enter }` para agentes de terminal, com teclas de opção em `enter: false`.
Na fase 1, sessões estruturadas avisam no carro sem a ação de responder, e a resposta a elas é a [ST-06b](ST-06b-resposta-a-sessoes-estruturadas.md).
Um aviso sem `promptRef`, como "pronto" depois de "bloqueado", cai numa conversa própria, e a conversa antiga pode oferecer "Responder" até a guarda do host recusar com "already moved on".
Os textos do carro são em inglês e ficam em `mobile/src/car/car-copy.ts`, porque o mobile não tem i18n.
Guardar por host a marca de que o método novo não existe, e nesse caso não oferecer "Responder".
Publicar o recibo e as mensagens de erro da seção 9 do design.

## Critérios de aceite

- [ ] "um" vira "1" só quando há um menu de permissão detectado e a frase é só essa palavra.
- [ ] Com um menu detectado, uma resposta que não mapeia para opção recebe "Say the option number, or yes or no" e nada é enviado.
- [ ] Sem menu detectado, nada é enviado e o carro diz "Reply to this one from your phone".
- [ ] O carro lê "Allow", a ferramenta e o resumo do comando, e não a última fala do agente.
- [ ] Uma lista em prosa antes do menu nunca vira menu.
- [ ] Uma resposta recusada pelo host gera "The agent already moved on; reply discarded" e nada é reenviado.
- [ ] Com um host sem o método novo, o aviso aparece sem a ação de responder.
- [ ] Uma resposta a um host sem contato gera "Reply not sent", sem afirmar que o agente morreu.
- [ ] O aviso de agente encerrado usa "Agent exited" só com o veredito `exited`.
- [ ] O `connection-log` registra tamanho e resultado da resposta, nunca o texto.
