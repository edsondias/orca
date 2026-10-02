# ST-07: roteiros de validação da fase 1

## Roteiro no DHU (sem o desktop real)

1. Em `mobile/`, rodar `MOCK_CAR=1 pnpm mock-server`.
2. Instalar o APK de debug no celular e parear com `ws://<ip-do-pc>:6768` e o token `mock-device-token`.
3. No celular, ativar o modo desenvolvedor do Android Auto e iniciar o servidor da unidade principal.
4. No PC, rodar `adb forward tcp:5277 tcp:5277` e abrir `desktop-head-unit.exe` em `%LOCALAPPDATA%\Android\Sdk\extras\google\auto`.
5. No app, ligar "Car mode".
6. Esperado: em até 5 segundos, o DHU anuncia "Allow command: pnpm test?" de "Claude · feat-login".
7. Responder "one" (ou "um") pelo DHU e confirmar o envio.
8. Esperado: a conversa recebe "✓ Sent: Yes".
9. Responder de novo à mesma conversa.
10. Esperado: "The agent already moved on; reply discarded".

## Roteiro no carro (desktop real, carro parado)

1. No desktop, abrir um Claude Code numa worktree e pedir algo que exija permissão.
2. Conectar o celular ao C4 Cactus pelo cabo USB, com o Orca aberto uma vez.
3. Esperado: o carro anuncia o pedido de permissão.
4. Responder "um" e confirmar o eco.
5. Esperado: o agente destrava no desktop em até cerca de 5 segundos e o carro recebe o recibo.
6. Soltar o cabo por 30 segundos e reconectar.
7. Esperado: a sessão continua, sem perder a conversa.
8. Desligar o Tailscale no celular por mais de 60 segundos.
9. Esperado: uma única mensagem "No connection to the desktop", que some ao religar.

Execução do roteiro no DHU: pendente, a cargo do usuário.
