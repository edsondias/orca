# FT-02: painel visual

Épico: [EP-01](../epics/EP-01-orca-android-auto.md).
Fase: 2.
Design: seção 7 de [orca-android-auto-design.md](../orca-android-auto-design.md).

## Valor

O usuário vê de relance, sem tocar em nada, o estado de todos os agentes na tela de 7 polegadas.
Tocar no ícone do Orca no carro também passa a ligar a sessão de carro com o app fechado.

## Stories

| Story | Título | Depende de |
|---|---|---|
| [ST-08](../stories/ST-08-spike-limite-de-telas.md) | Spike do limite de 5 telas no DHU | FT-01 |
| [ST-09](../stories/ST-09-car-app-service-e-abas.md) | `OrcaCarAppService` e telas em abas | ST-08 |
| [ST-10](../stories/ST-10-car-snapshot-e-resumo.md) | `CarSnapshot` e resumo de uma linha | nenhuma |
| [ST-11](../stories/ST-11-renderizador-de-imagens.md) | `CarImageRenderer` | ST-10 |

## Portão

A ST-08 decide entre a grade com vagas fixas e o `ListTemplate` com imagens.
As stories ST-09 e ST-11 só começam depois dessa decisão.

## Critério de conclusão

As três abas atualizam sozinhas no DHU e no carro, e uma hora de uso com agentes entrando e saindo não fecha o app.
