# ST-08: spike do limite de 5 telas no DHU

Feature: [FT-02](../features/FT-02-painel-visual.md).
Camada: spike, código descartável.

## Pergunta

Atualizar uma `GridTemplate` quando agentes entram e saem conta como tela nova para o limite de 5 telas por tarefa?

## Experimento

Montar um `CarAppService` mínimo com `TabTemplate` e uma `GridTemplate` de 6 vagas fixas.
Fazer 50 trocas de agentes, alternando vagas ocupadas e livres, com `invalidate()` a cada 2 segundos.
Repetir com o carro simulado em movimento e parado.

## Resultado esperado

Uma decisão registrada neste arquivo: grade com vagas fixas, ou `ListTemplate` com as imagens como ícones de linha.
O código do spike não entra no produto.

## Critérios de aceite

- [ ] A decisão e a evidência do DHU estão registradas aqui.
- [ ] O design e a ST-09 foram atualizados se a decisão for a alternativa.
