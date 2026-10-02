# ST-07: cenário no mock server e roteiros no DHU e no carro

Feature: [FT-01](../features/FT-01-notificacoes-no-carro.md).
Camada: validação.

## História

Como desenvolvedor, quero um roteiro repetível para provar a fase 1 sem e com o carro.

## Escopo

Criar no `mobile/scripts/mock-server.ts` um cenário de agente bloqueado com `promptRef` e o método `terminal.replyToAgentPrompt`, que no mock aceita ou recusa a `fence` recebida.
Escrever o roteiro do DHU e o roteiro do carro, conforme a seção 11 do design, em [ST-07-roteiros.md](ST-07-roteiros.md).

## Critérios de aceite

- [ ] No DHU, com o mock server, o fluxo de aviso, resposta, eco e recibo funciona.
- [ ] No carro parado, o critério de sucesso da seção 1 do design é cumprido com o desktop real.
- [ ] No carro, soltar o cabo e derrubar o Tailscale geram as mensagens previstas na seção 9.
