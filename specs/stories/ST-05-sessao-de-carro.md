# ST-05: sessão de carro

Feature: [FT-01](../features/FT-01-notificacoes-no-carro.md).
Camada: mobile, JS e Kotlin.

## História

Como usuário no carro, quero que o Orca continue conectado ao desktop com a tela do celular apagada, para receber os avisos durante toda a viagem.

## Escopo

Implementar os estados `inativa`, `ativa` e `encerrando`, conforme a seção 4 do design.
Detectar a projeção do Android Auto com `CarConnection`.
Criar o interruptor "Modo carro" nas configurações do app.
Subir o serviço em primeiro plano do tipo `connectedDevice`, com `specialUse` como alternativa.
Fazer o supervisor de conexão ignorar o fechamento por segundo plano enquanto `carSessionActive` for verdadeiro.
Manter `notifications.subscribe`, com reposição por `notifications.getMissedSince`, e `worktree.ps`.
Encerrar 60 segundos depois da desconexão do Android Auto.
Registrar as transições no `connection-log`.

## Critérios de aceite

- [ ] Os testes cobrem as transições de estado e a tolerância de 60 segundos.
- [ ] Um teste mostra que a conexão não fecha em segundo plano com a sessão ativa e volta a fechar depois do fim.
- [ ] Com a tela do celular apagada por 10 minutos no DHU, um aviso novo ainda chega.
