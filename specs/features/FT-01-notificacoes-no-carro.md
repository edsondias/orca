# FT-01: notificações no carro

Épico: [EP-01](../epics/EP-01-orca-android-auto.md).
Fase: 1.
Design: seções 4, 5, 6, 9 e 10 de [orca-android-auto-design.md](../orca-android-auto-design.md).

## Valor

O usuário fica sabendo no carro quando um agente bloqueia, termina ou cai.
Ele destrava o agente por voz, com eco antes do envio, sem tocar no celular.

## Stories

| Story | Título | Depende de |
|---|---|---|
| [ST-01](../stories/ST-01-campos-opcionais-no-evento.md) | Campos opcionais no evento de notificação | nenhuma |
| [ST-02](../stories/ST-02-resposta-guardada-no-host.md) | Método `terminal.replyToAgentPrompt` com guarda no host | nenhuma |
| [ST-03](../stories/ST-03-modulo-orca-car-messaging.md) | Módulo nativo `orca-car-messaging` | ST-04 |
| [ST-04](../stories/ST-04-config-plugin-android-auto.md) | Config plugin `with-android-auto` | nenhuma |
| [ST-05](../stories/ST-05-sessao-de-carro.md) | Sessão de carro | ST-03 |
| [ST-06](../stories/ST-06-conversas-e-reply-router.md) | Conversas, `ReplyRouter` e recibos | ST-01, ST-02, ST-03, ST-05 |
| [ST-06b](../stories/ST-06b-resposta-a-sessoes-estruturadas.md) | Resposta a sessões estruturadas pelo carro | ST-06 |
| [ST-07](../stories/ST-07-validacao-dhu-e-carro.md) | Cenário no mock server e roteiros no DHU e no carro | ST-06 |

## Critério de conclusão

O critério de sucesso da seção 1 do design é cumprido no carro.
