# ST-10: `CarSnapshot` e resumo de uma linha

Feature: [FT-02](../features/FT-02-painel-visual.md).
Camada: mobile, JS.

## História

Como usuário no carro, quero ler em poucas palavras o que cada agente está fazendo.

## Escopo

Criar `car-snapshot`, que monta as 6 vagas fixas a partir de `worktree.ps` e dos eventos de notificação.
Um agente mantém a vaga enquanto existir, e uma vaga vazia aparece como "livre".
Calcular um hash estável do snapshot para evitar redesenho sem mudança.
Criar `car-agent-summary`, com o resumo de até 60 caracteres conforme a tabela da seção 7 do design.
Reaproveitar a leitura de veredito de `mobile/src/worktree/agent-row-display.ts` em vez de reimplementar.

## Critérios de aceite

- [ ] Os testes cobrem o resumo de cada estado, a tradução de `toolName`, o corte em 60 caracteres e o fallback "Trabalhando".
- [ ] Os testes mostram que um agente não muda de vaga quando outro entra ou sai.
- [ ] O mesmo estado gera o mesmo hash, e qualquer mudança visível gera outro.
