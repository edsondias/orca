# ST-07: roteiros de validação da fase 1

## Preparação

1. No desktop, com Node 24 e sem `CI`, gerar o instalador deste branch com `pnpm build:win` e instalar por cima do Orca atual, porque o método `terminal.replyToAgentPrompt` só existe nele.
2. Em `mobile/android`, rodar `gradlew assembleRelease`, que embute o JavaScript e dispensa o Metro no carro.
3. Instalar `mobile/android/app/build/outputs/apk/release/app-release.apk` no celular com `adb install -r`.
4. Instalar o Tailscale no PC e no celular, na mesma conta.
5. No desktop, em Settings, Mobile, escolher o endereço do Tailscale (100.x.x.x) e parear o celular pelo QR code.
6. No celular, ativar o modo desenvolvedor do Android Auto (tocar 10 vezes na versão, em Configurações do Android Auto) e ligar "Fontes desconhecidas".
7. No app Orca, em Settings, ligar "Car mode".

## Roteiro no DHU (sem o desktop real)

1. Em `mobile/`, rodar `MOCK_CAR=1 pnpm mock-server`.
2. Instalar o APK no celular e parear com `ws://<ip-do-pc>:6768` e o token `mock-device-token`.
3. No celular, ativar o modo desenvolvedor do Android Auto e iniciar o servidor da unidade principal.
4. No PC, rodar `adb forward tcp:5277 tcp:5277` e abrir `desktop-head-unit.exe` em `%LOCALAPPDATA%\Android\Sdk\extras\google\auto`.
5. No app, ligar "Car mode".
6. No DHU, desativar o envio automático de mensagens (em Configurações ou no menu da aplicação) para que o eco seja confirmado manualmente antes de enviar.
7. Esperado: em até 5 segundos, o DHU anuncia "Do you want to proceed? 1. Yes; 2. No" de "Claude · feat-login".
8. Responder "one" (ou "um") pelo DHU e confirmar o envio.
9. Esperado: a conversa recebe "✓ Sent: Yes".
10. Responder de novo à mesma conversa.
11. Esperado: "The agent already moved on; reply discarded".
12. Reiniciar o mock server antes de executar o roteiro novamente, pois o servidor lembra que o prompt foi respondido.

## Roteiro no carro (desktop real, carro parado)

1. No desktop, abrir um Claude Code numa worktree e pedir algo que exija permissão.
2. Conectar o celular ao C4 Cactus pelo cabo USB, com o Orca aberto uma vez.
3. Desativar o envio automático de mensagens no carro (em Configurações ou no menu da aplicação) para que o eco seja confirmado manualmente antes de enviar.
4. Esperado: o carro anuncia o pedido de permissão.
5. Responder "um" e confirmar o eco.
6. Esperado: o agente destrava no desktop em até cerca de 5 segundos e o carro recebe o recibo.
7. Soltar o cabo por 30 segundos e reconectar.
8. Esperado: a sessão continua, sem perder a conversa.
9. Desligar o Tailscale no celular por mais de 60 segundos.
10. Esperado: uma única mensagem "No connection to the desktop", que some ao religar.

Execução do roteiro no DHU: pendente, a cargo do usuário.
