# ST-05: sessão de carro

Feature: [FT-01](../features/FT-01-notificacoes-no-carro.md).
Camada: mobile, JS e Kotlin.

## História

Como usuário no carro, quero que o Orca continue conectado ao desktop com a tela do celular apagada, para receber os avisos durante toda a viagem.

## Escopo

Implementar os estados `inativa`, `ativa` e `encerrando`, conforme a seção 4 do design.
Detectar a projeção do Android Auto com `CarConnection`.
Criar o interruptor "Modo carro (Car mode)" nas configurações do app.
Subir o serviço em primeiro plano do tipo `connectedDevice`, com `specialUse` como alternativa, só com o app em primeiro plano.
Se o Android recusar o início, como a partir do Android 12 em segundo plano, a sessão não começa.
A notificação fixa usa um canal próprio de importância baixa e o ícone pequeno de notificação do app.
Não usar tarefa headless: a sessão só começa com o app já iniciado, e a partida a frio fica para a fase 2.
Fazer o supervisor de conexão ignorar o fechamento por segundo plano enquanto `carSessionActive` for verdadeiro.
Manter `notifications.subscribe`, com reposição por `notifications.getMissedSince`, sem `worktree.ps`, que entra na fase 2.
Encerrar 60 segundos depois da desconexão do Android Auto.
Registrar as transições no `connection-log`.

## Critérios de aceite

- [ ] Os testes cobrem as transições de estado e a tolerância de 60 segundos.
- [ ] Um teste mostra que a conexão não fecha em segundo plano com a sessão ativa e volta a fechar depois do fim.
- [ ] Com o Android recusando o início do serviço em segundo plano, a sessão não começa.
- [ ] Com a tela do celular apagada por 10 minutos no DHU, um aviso novo ainda chega.
