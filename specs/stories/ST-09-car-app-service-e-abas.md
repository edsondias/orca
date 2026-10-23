# ST-09: `OrcaCarAppService` e telas em abas

Feature: [FT-02](../features/FT-02-painel-visual.md).
Camada: mobile, Kotlin.

## História

Como usuário no carro, quero abrir o Orca pelo ícone na tela do carro e ver o painel com as abas Agora, Placar e Linha do tempo.

## Escopo

Criar o `OrcaCarAppService` na categoria `MESSAGING`, com `minCarApiLevel` 7.
Criar a `CarPanelScreen` com `TabTemplate` e as três abas, no formato decidido pela ST-08.
Receber o `CarSnapshot` do JS e redesenhar só quando o hash mudar, no máximo a cada 2 segundos.
Iniciar a sessão de carro quando o Android Auto abrir o serviço, mesmo com o app fechado.
Atualizar o `automotive_app_desc.xml` com `<uses name="template"/>` pela ST-04.

## Critérios de aceite

- [ ] Com o app fechado, tocar no ícone do Orca no DHU abre o painel e liga a sessão de carro.
- [ ] As três abas atualizam sozinhas quando o estado de um agente muda.
- [ ] Uma hora de uso no DHU com agentes entrando e saindo não fecha o app.
