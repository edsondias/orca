# ADR-0001: Orca no Android Auto por mensagens e Car App Library, com sessão de carro ao vivo

Data: 01/10/2026.
Status: aceito.
Design completo: [specs/orca-android-auto-design.md](../../specs/orca-android-auto-design.md).

## Contexto

O usuário quer acompanhar e destravar agentes do Orca enquanto dirige um C4 Cactus Shine 2019 com Android Auto por cabo.
O uso é pessoal, com o app instalado fora da Play Store.
O Android Auto não exibe a interface própria de um app de terceiros.
Ele aceita notificações de mensagem e telas montadas com modelos prontos da Car App Library.
No carro, o celular fica no 4G, fora da rede de casa, e o pareamento atual é por LAN.

## Decisão

1. A fase 1 usa notificações `MessagingStyle` com as ações de responder e marcar como lida.
   É o mecanismo de mensagens que o Android Auto oferece a qualquer app, sem depender de categoria nem de revisão da loja.
2. As fases 2 e 3 usam a Car App Library na categoria `MESSAGING`.
   O painel visual usa `TabTemplate` com imagens geradas no celular, e o ditado usa `ConversationItem`.
3. Os eventos chegam ao carro por uma sessão de carro ao vivo, e não pelo push do gateway.
   Enquanto o Android Auto estiver conectado, um serviço em primeiro plano mantém a assinatura `notifications.subscribe` pelo Tailscale, e o `worktree.ps` entra na fase 2.
4. A guarda contra resposta atrasada fica no host.
   Sessões estruturadas usam o `expectedRevision` que já existe, e agentes de terminal usam o método novo `terminal.replyToAgentPrompt` com a guarda `TerminalAgentPromptFence`, que vai além da `permissionSequence`.
5. As mudanças no que o desktop publica são só campos opcionais e aditivos.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Só notificações, sem Car App Library | Não permite mandar instrução nova a um agente parado nem mostrar um painel. |
| Tela livre com `Surface`, declarando o Orca como app de navegação | Disputaria o lugar do Google Maps, daria muito mais trabalho e poderia quebrar a cada atualização do Android Auto. |
| Cartão ao lado do mapa como app de mídia | Ocupa o lugar do player de música, e em telas de 800x480 a tela dividida pode não aparecer. |
| Push pelo gateway da Stably como fonte dos eventos | Depende de FCM e de um gateway que um build feito a partir do fork pode não alcançar, e exigiria mudar o payload de push. |
| `terminal.send` com checagem de estado no celular | Deixa uma janela de corrida entre a checagem e o envio, e contraria a regra de que o host de execução é o dono do status. |
| Orca Relay em vez de Tailscale | Está em beta, exige login e pode não estar disponível num build próprio. |

## Consequências

O caso principal, destravar um agente por voz, chega já na fase 1.
O desktop precisa estar ligado e alcançável pelo Tailscale durante a viagem.
Se o app estiver totalmente fechado, plugar o cabo não liga a sessão na fase 1, porque não há tarefa headless.
Abrir o app uma vez cobre esse caso até a fase 2, quando o ícone do Orca no carro passa a acordar o app.
Na fase 1, sessões estruturadas avisam no carro sem a ação de responder, que vem na story ST-06b.
Um desktop antigo, sem o método novo, faz o carro avisar sem oferecer resposta.
A Car App Library com `ConversationItem` está em beta e só seria publicável nas faixas de teste da Play Store, o que não afeta o uso pessoal.
O limite de 5 telas por tarefa pode fechar o painel quando agentes entram e saem.
A story ST-08 prova o desenho de vagas fixas no DHU antes de o painel ser construído.
Os testes Kotlin e o DHU ficam fora do CI, porque o CI do mobile não roda Gradle.

## Riscos aceitos

O Android Auto funciona com o celular bloqueado, então um passageiro pode aprovar algo por voz.
O eco antes do envio reduz o risco de erro de transcrição, mas não o de terceiros.
O usuário aceitou esse risco para uso pessoal.
