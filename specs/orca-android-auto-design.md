# Orca no Android Auto: design

Data: 01/10/2026.
Status: aprovado no brainstorming, aguardando revisão do spec escrito.
Decisão registrada em [ADR-0001](../docs/adr/0001-orca-no-android-auto.md).
Épico: [EP-01](epics/EP-01-orca-android-auto.md).

## 1. Objetivo

O usuário quer acompanhar e destravar os agentes do Orca enquanto dirige.
O uso é pessoal, num Citroën C4 Cactus Shine 2019, com o app instalado fora da Play Store.
O carro anuncia quando um agente bloqueia, termina ou cai, e o usuário responde por voz.
Numa segunda etapa, a tela do carro mostra um painel visual com o estado de todos os agentes.
Numa terceira etapa, o usuário toca num agente do painel e dita uma instrução nova.

### Critério de sucesso

Com o celular no cabo USB e um agente bloqueado no desktop, o carro anuncia a mensagem.
O usuário responde "um", o Android Auto lê de volta e pergunta se pode enviar.
O usuário confirma, o agente destrava em até cerca de 5 segundos e chega um recibo na conversa.

### O que o usuário disse

O carro é um C4 Cactus Shine 2019.
Os eventos desejados são agente bloqueado, agente que terminou, agente que caiu e instrução nova.
A resposta por voz pode fazer tudo, inclusive aprovar, desde que haja eco antes do envio.
O celular alcança o desktop pelo Tailscale.
O painel deve ser visual, em abas com grade, placar e linha do tempo.
A ordem das fases é notificações, depois painel, depois ditado.

### Suposições

O celular tem Android 9 ou superior, e isso ainda será confirmado pelo adb.
O desktop fica ligado com o Orca aberto enquanto o usuário dirige.
A opção de envio automático de mensagens do Android Auto fica desligada, porque é ela que garante o eco.
O texto das mensagens do carro é em inglês, porque o app não tem i18n (seção 9).

### Fora do escopo

Distribuição pela Play Store.
Android Automotive OS.
iOS e CarPlay.
Mudança no payload de push enviado pelo gateway.
Saída de terminal, logs ou diffs na tela do carro.

## 2. Compatibilidade do carro e do celular

| Requisito | Situação |
|---|---|
| Central com Android Auto | Atende. A versão Shine tem tela touch de 7 polegadas com Android Auto e Apple CarPlay. |
| Conexão | Por cabo USB. A central de 2019 não tem Android Auto sem fio, o que não afeta o Orca. |
| Notificações de mensagem | Funcionam em qualquer central com Android Auto, porque quem desenha a tela é o celular. |
| Resposta por voz | Usa o microfone do carro e o Google Assistente do celular. |
| Celular | Precisa de Android 9 ou superior. |
| Painel e ditado | Exigem Car API 7, que depende da versão do app Android Auto no celular e não da central. |
| App fora da loja | Exige o modo desenvolvedor do Android Auto com "Fontes desconhecidas" ativado. |
| Resolução | Centrais PSA dessa geração costumam projetar em 800x480, o que cabe de 4 a 5 linhas por tela. |

## 3. Arquitetura

```
Desktop (Orca)                                 Celular (Orca mobile)                          Carro
notifications.subscribe ── Tailscale ──► Sessão de carro (serviço em primeiro plano)
worktree.ps (fase 2)                           ├─ CarConversationStore (JS)
                                               ├─ CarSnapshot (JS) ──► CarImageRenderer (Kotlin)
                                               ├─ orca-car-messaging (Kotlin) ─────────────────► Android Auto
terminal.replyToAgentPrompt ◄─────────────     └─ ReplyRouter (JS)
agentSession.respondToApproval ◄────────── (ST-06b)
```

| Unidade | Onde | Responsabilidade | Fase |
|---|---|---|---|
| Campos opcionais no `MobileNotificationDispatchEvent` | `src/main/runtime/runtime-mobile-notification-controller.ts` | Dizer qual prompt a resposta destrava e distinguir o agente encerrado | 1 |
| `terminal.replyToAgentPrompt` | `src/main/runtime/rpc/methods/` | Escrever a resposta no PTY só se a guarda `TerminalAgentPromptFence` ainda valer | 1 |
| Sessão de carro | `mobile/src/car/` e o módulo nativo | Manter vivas as assinaturas enquanto o Android Auto estiver conectado | 1 |
| `orca-car-messaging` | `mobile/modules/orca-car-messaging/` | Notificação `MessagingStyle`, ações de responder e marcar como lida, receptor da resposta | 1 |
| `CarConversationStore` | `mobile/src/car/` | Mapear cada agente para uma conversa estável e guardar o histórico da sessão | 1 |
| `ReplyRouter` | `mobile/src/car/` | Normalizar a resposta, escolher o método de envio e publicar o recibo, com os textos em inglês de `car-copy.ts` | 1 |
| Config plugin `with-android-auto` | `mobile/plugins/` | Manifesto, `automotive_app_desc.xml`, serviços e permissões | 1 e 2 |
| `CarSnapshot` e resumo de uma linha | `mobile/src/car/` | Montar a estrutura de dados do painel | 2 |
| `OrcaCarAppService` e `CarPanelScreen` | módulo nativo | Telas do painel com `TabTemplate`, categoria `MESSAGING` | 2 |
| `CarImageRenderer` | módulo nativo | Desenhar cartão, rosca e faixas como bitmap | 2 |
| Conversa por agente no painel | módulo nativo | `ConversationItem` com ditado, usando o mesmo `ReplyRouter` | 3 |

Os nomes de arquivo seguem a regra do repositório de nomear pelo conceito de domínio.
Nenhum arquivo novo usa nomes como `helpers` ou `utils`.

## 4. Sessão de carro

### Estados

`inativa`, `ativa`, `encerrando`, de volta a `inativa`.

### Gatilhos de início

O usuário abre o Orca no celular com o Android Auto conectado, detectado pela `CarConnection`.
O usuário liga o interruptor "Modo carro (Car mode)" no app, que continua ligado entre uma abertura e outra do app.
Na fase 1 a sessão só começa com o app já iniciado, porque não há tarefa headless.
A partir da fase 2, o usuário toca no ícone do Orca na tela do carro, e o Android Auto inicia o `OrcaCarAppService`.

### Efeitos do início

O módulo nativo sobe um serviço em primeiro plano com uma notificação fixa, num canal próprio de importância baixa e com o ícone pequeno de notificação do app.
O serviço só é iniciado com o app em primeiro plano.
Se o Android recusar o início, como acontece a partir do Android 12 em segundo plano, a sessão não começa.
O tipo do serviço é `connectedDevice`, com `specialUse` como alternativa se o Android recusar o tipo.
O JS recebe `carSessionActive=true`.
Enquanto a sessão estiver ativa, o supervisor de conexão não aplica o fechamento por segundo plano (`RELAY_BACKGROUND_GRACE_MS` e a política equivalente da conexão direta).
Fica viva a assinatura `notifications.subscribe`, com reposição por `notifications.getMissedSince` ao reconectar.
A fase 1 não usa `worktree.ps`, que entra com o painel na fase 2.
O serviço em primeiro plano mantém o processo vivo, e a partida a frio, sem o app aberto, fica para a fase 2.

### Fim

Quando a `CarConnection` informa que o Android Auto desconectou, há uma tolerância de 60 segundos para cobrir mau contato no cabo.
Depois disso, o serviço para, as conversas do carro são limpas e a política normal de segundo plano volta a valer.

### Limitação conhecida da fase 1

Se o app estiver totalmente fechado e o usuário só plugar o cabo, nada liga a sessão.
O Android não avisa apps comuns sobre a conexão com o carro.
Abrir o app uma vez cobre esse caso, e o ícone no carro resolve a partir da fase 2.
O "Modo carro (Car mode)" sozinho não basta na fase 1, porque a sessão não parte a frio.

## 5. Fluxo de eventos e respostas

### Evento

O desktop publica um `MobileNotificationDispatchEvent`.
O `CarConversationStore` associa o evento a uma conversa estável, identificada pelo `terminalHandle` ou pelo `sessionId` estruturado.
O módulo nativo publica a notificação `MessagingStyle`, e o Android Auto anuncia a mensagem.

### Campos opcionais novos no evento

Todos os campos são opcionais e aditivos, então clientes antigos os ignoram.

| Campo | Conteúdo |
|---|---|
| `promptRef` | `{ kind: 'terminal', terminalHandle, fence, interactivePrompt, lastAssistantMessage }` ou `{ kind: 'structured', sessionId }` |
| `source: 'agent-exited'` | Novo valor de `source` para o agente encerrado, nascido no main como fato `agent-exited` |

A `fence` do terminal é `{ generation, permissionSequence, blockedSince, promptKey }`.
O `promptKey` são os 16 primeiros caracteres hexadecimais do sha256 de `toolName`, `toolInput` e `interactivePrompt` da linha de hook recente, porque o hook mantém o `stateStartedAt` entre prompts bloqueados seguidos.
O `lastAssistantMessage` vai com até 4000 caracteres.
O `promptRef` só é anexado a avisos de bloqueio, e uma falha ao montá-lo nunca suprime a notificação.
O `promptRef` estruturado leva só o `sessionId`, e na fase 1 as sessões estruturadas avisam no carro sem a ação de responder, que fica para a story ST-06b.

O aviso `agent-exited` não vai por push, porque o gateway só aceita as fontes de `MOBILE_PUSH_SOURCES`.
Ele é publicado com `desktopAllowed: false`, então só a sessão de carro, que assina com `includeDesktopSuppressed`, o recebe, e os celulares antigos não.
Ele é anunciado só com o veredito `exited`, ou quando não há veredito de presença e a leitura em primeiro plano respondeu, e nunca com `unverifiable` ou `live`.
No carro ele aparece como uma conversa própria, "Agent exited", separada da conversa do agente.
Um cliente antigo que receba um `source` desconhecido precisa tratá-lo como notificação genérica.
O teste de compatibilidade da story ST-01 cobre esse caso.

### Resposta

1. O Android Auto lê de volta a resposta transcrita e o usuário confirma.
2. A resposta chega ao receptor nativo, que a repassa ao JS, mantido vivo pelo serviço em primeiro plano, porque a fase 1 não tem tarefa headless.
3. O `ReplyRouter` normaliza o texto, conforme a seção 6.
4. Para sessão estruturada, a ST-06b usa `agentSession.respondToApproval` ou `agentSession.respondToQuestion`, com o `expectedRevision` como compare-and-set no host.
5. Para agente de terminal, o envio usa `terminal.replyToAgentPrompt { terminal, fence, text, enter }`, que só escreve no PTY se a `fence` ainda valer.
6. Se o host aceitar, entra na conversa o recibo "✓ Sent: 1 (Yes)".
7. Se o host recusar porque o prompt mudou, nada é escrito e entra a mensagem "The agent already moved on; reply discarded".

Teclas de opção vão com `enter: false`, como as respostas de permissão que o celular já envia.
O método aceita um `client` opcional, com o mesmo esquema do `terminal.send`, e aplica o mesmo bloqueio de entrada por cliente e o mesmo piso de entrada do mobile.
Um terminal bloqueado responde `terminal-locked`.
Se o texto foi escrito mas o Enter foi retido porque o prompt mudou, o host responde `prompt-changed-after-text`.

### Por que a guarda fica no host

Checar no celular e depois enviar deixa uma janela de corrida.
O host de execução é o dono do status, conforme `docs/reference/agent-status-store.md`.
O runtime já mantém uma `permissionSequence` por painel em `src/main/runtime/agent-prompt-submission-verification.ts`, mas só ela não basta.
O bloqueio que vem do hook HTTP não incrementa a `permissionSequence`, e um respawn do painel a zera.
Por isso a guarda é o `TerminalAgentPromptFence`, com `generation`, `permissionSequence`, `blockedSince` e `promptKey`.
"Bloqueado" é decidido pela precedência de status do próprio runtime.
A linha de hook vem do seletor de linhas recentes que já existe, que ignora linhas velhas, restauradas ou anteriores ao respawn.

### Desktop antigo

O celular descobre se o host tem `terminal.replyToAgentPrompt` pela resposta do próprio host.
Um erro de método inexistente marca o host como sem suporte, e essa marca fica guardada por host.
Sem suporte, o carro avisa mas não oferece a ação "Responder".
Um aviso sem `promptRef`, como "pronto" depois de "bloqueado", cai numa conversa própria.
A conversa antiga ainda pode oferecer "Responder", e a guarda do host a recusa com "already moved on".
O agrupamento correto fica para a fase 2, com o `worktree.ps`.
O carro nunca cai para o `terminal.send` sem guarda.

## 6. Normalização da voz

A normalização reaproveita `detectAgentPermission` e `parseApprovalFromStatus` do mobile.
Com um menu de permissão detectado, só seguem as respostas que mapeiam para uma opção: número, "yes" ou "sim", "no" ou "não".
Qualquer outra resposta recebe "Say the option number, or yes or no", e o prompt continua pendente.
"Não" só mapeia para uma opção rotulada como deny ou no, e sem ela nada é enviado.
Sem menu detectado, o texto ditado vai sem mudança, com Enter.
O limite é de 500 caracteres.
Uma entrega repetida pelo Android Auto é descartada por 30 segundos, pela chave `(conversa, sequência, texto)`.
Uma resposta que falhou por causa transitória pode ser tentada de novo na hora.

Para sessões estruturadas, a ST-06b lê as opções do item pendente por `agentSession.history`.
Para agentes de terminal, o menu de permissão é detectado por `detectAgentPermission` e `parseApprovalFromStatus`, que o mobile já usa nas respostas de permissão.
O celular não lê a tela da CLI por conta própria, então a regra não depende de uma transcrição por CLI.

## 7. Painel visual (fase 2)

### Abas

| Aba | Conteúdo |
|---|---|
| Agora | Grade de cartões, um por agente, com anel na cor do estado, ícone do agente e tempo no estado |
| Placar | Rosca com as fatias por estado e o total no centro, mais de 2 a 4 linhas com os mais urgentes |
| Linha do tempo | Uma faixa por agente, no máximo 6, com os últimos 30 minutos pintados a partir do `stateHistory` |

As telas usam `TabTemplate`, `GridTemplate`, `PaneTemplate` e `ListTemplate`.
Esses modelos são de uso geral e valem para a categoria `MESSAGING`.

### Divisão entre JS e Kotlin

O JS monta o `CarSnapshot`, que é só dados.
Cada agente tem vaga, id, tipo, worktree, estado, tempo no estado, resumo de até 60 caracteres e histórico de 30 minutos.
O Kotlin desenha as imagens com `Canvas` e monta as telas.
As imagens não atravessam a ponte entre JS e Kotlin.

### Resumo de uma linha

| Estado | Texto de exemplo | Origem |
|---|---|---|
| bloqueado ou esperando | "Allow command: pnpm test?" | primeira linha do `interactivePrompt` |
| trabalhando | "Editando session.ts" | `toolName` traduzido e o nome do arquivo do `toolInput`, com fallback "Trabalhando" |
| pronto | "Atualizou o README e 2 ADRs" | primeira frase do `lastCompletedAssistantMessage` |
| caiu | "Processo encerrado" | evento `agent-exited` |

### Cores e formas

As cores seguem a barra lateral do desktop, replicadas em `mobile/src/components/AgentSpinner.tsx`.
Trabalhando é amarelo, pronto é verde-esmeralda, bloqueado e caiu são vermelhos, e inativo é cinza.
O estado nunca depende só da cor: ● trabalhando, ! bloqueado, ✓ pronto, × caiu e ○ inativo.
Há duas paletas, escolhidas por `CarContext.isDarkMode`.
O texto dentro das imagens tem contraste de pelo menos 4,5:1.
O desenho usa o tamanho informado pelo host, em densidade 2x.

### Estabilidade e o limite de 5 telas

O Android Auto permite no máximo 5 telas por tarefa e fecha o app quando o limite estoura.
Reenviar a mesma tela com conteúdo atualizado não conta como passo.
O painel usa 6 vagas fixas: um agente fica na mesma vaga enquanto existir, e as vagas vazias aparecem como "livre".
A urgência aparece pela cor e pela aba Placar, sem reordenar a grade.
O redesenho só acontece quando o hash do snapshot muda, no máximo a cada 2 segundos.
Os bitmaps ficam em cache por estado, agente, faixa de minuto e tema.

O primeiro passo da fase 2 é a story ST-08, um teste no DHU com 50 trocas de agentes.
Se o host contar as trocas como telas novas, a alternativa é um `ListTemplate` com as mesmas imagens como ícones de linha.

## 8. Ditado pelo painel (fase 3)

Tocar num cartão abre a conversa do agente como `ConversationItem`, o que exige Car API 7.
O ditado e a confirmação são do próprio Android Auto.
A resposta passa pelo mesmo `ReplyRouter` da fase 1, com as mesmas guardas.
Para um agente que não está bloqueado, o texto vai como instrução nova pelo envio normal do agente.

## 9. Erros

| Situação | O que o carro diz |
|---|---|
| O prompt mudou ou o agente seguiu | "The agent already moved on; reply discarded" |
| Aviso sobre host SSH sem contato | "No contact with the host; can't tell if the agent is alive", com o veredito `unverifiable` |
| Resposta a um host remoto sem contato | "Reply not sent", porque este método ainda não tem o código de recusa `unverifiable`, e nunca se afirma que o agente morreu |
| Aviso de processo encerrado | "Agent exited", só com o veredito `exited` |
| Resposta que não vira opção do menu | "Say the option number, or yes or no", e o prompt continua pendente |
| Terminal bloqueado por outro cliente | "Reply not sent", a partir da recusa `terminal-locked` |
| Desktop sem o método novo | Aviso sem a ação de responder e a mensagem única "Update Orca desktop to reply from the car" |
| Conexão caída por mais de 60 segundos | Uma única mensagem "No connection to the desktop", que some ao reconectar |
| Permissão de notificação negada | A sessão não começa e o app mostra o motivo |

Os textos do carro estão em inglês em `mobile/src/car/car-copy.ts`, porque o mobile não tem i18n.
Respostas não ficam em fila durante uma queda de conexão, porque uma aprovação atrasada é perigosa.
O vocabulário de veredito segue `docs/reference/ssh-execution-boundary.md`, sem sinônimos.

## 10. Segurança e privacidade

O caminho é o Tailscale mais o transporte cifrado de ponta a ponta que já existe em `mobile/src/transport/e2ee.ts`.
Nenhum dado passa por servidor de terceiros.
O Android Auto funciona com o celular bloqueado, então um passageiro pode aprovar algo por voz.
Esse risco foi aceito para uso pessoal e está registrado no ADR.
Os eventos da sessão de carro entram no `connection-log` sem o texto das respostas, só tamanho e resultado.

## 11. Testes

### JS (vitest, no CI)

| Unidade | O que testar |
|---|---|
| `car-agent-summary` | Resumo por estado, tradução de `toolName`, corte em 60 caracteres e fallback |
| `car-reply-normalization` | Com menu detectado, só respostas que mapeiam para opção seguem, "não" só para opção deny ou no, e as demais recebem "Say the option number, or yes or no"; sem menu, texto sem mudança com Enter; limite de 500 caracteres e deduplicação |
| `car-snapshot` | Vagas fixas, vaga "livre", hash estável e histórico de 30 minutos |
| `CarConversationStore` | Conversa estável por agente, histórico da sessão e limpeza no fim |
| `ReplyRouter` | Escolha do método, ausência de "Responder" sem suporte, menu de permissão com resposta inválida, deduplicação com nova tentativa após falha transitória e "Reply not sent" para host sem contato e o aviso `exited` |
| Ciclo da sessão | Transições de estado, tolerância de 60 segundos e exceção ao fechamento por segundo plano |

### Desktop (vitest, `pnpm test`)

`terminal.replyToAgentPrompt` escreve quando a `fence` bate, recusa quando ela mudou (inclusive com `promptKey` diferente e após respawn) e funciona num painel de host SSH.
O método responde `prompt-changed-after-text` e `terminal-locked` nos casos descritos na seção 5.
O aviso `agent-exited` só é publicado com o veredito `exited`, e com `desktopAllowed: false`.
Os campos opcionais novos do evento são ignorados por um cliente antigo.
O método novo está no allowlist do mobile.

### Kotlin (JUnit, local)

O comando é `gradlew :orca-car-messaging:testDebugUnitTest`.
A notificação tem `MessagingStyle` e uma ação de resposta com exatamente um `RemoteInput`, `SEMANTIC_ACTION_REPLY` e `showsUserInterface(false)`.
A ação de marcar como lida existe e também não abre interface.
Os `PendingIntent` são estáveis por conversa.
O renderizador gera bitmaps do tamanho pedido nos dois temas, com contraste de pelo menos 4,5:1.

### Ponta a ponta (manual, com roteiro)

1. No DHU do PC, com `pnpm mock-server` num cenário novo de agente bloqueado, validar notificação, resposta, eco e recibo.
2. No DHU, rodar o teste de estresse da story ST-08 antes de construir o painel.
3. No carro, primeiro parado: agente bloqueado, responder "um", confirmar o eco e conferir no desktop que o agente destravou.
4. No carro, soltar e reconectar o cabo, e derrubar o Tailscale, conferindo as mensagens de erro.

### Dívida registrada

O CI do mobile não roda Gradle, então os testes Kotlin e o DHU ficam fora do CI.

## 12. Ambiente de desenvolvimento no Windows

O desktop compila com Node 24, porque o Node 26 para Windows quebra os addons nativos com o MSVC.
O `mobile/` usa `nodeLinker: hoisted` em `mobile/pnpm-workspace.yaml` neste fork, então um `pnpm install` comum já serve.
Sem esse ajuste, o layout isolado do pnpm gera caminhos acima de 260 caracteres que o ninja do CMake 3.22 não lê.
O DHU é instalado pelo SDK Manager, em "Android Auto Desktop Head Unit Emulator".
No celular, é preciso ativar o modo desenvolvedor do Android Auto, iniciar o servidor da unidade principal e rodar `adb forward tcp:5277 tcp:5277`.

## 13. Referências

[Mensagens por notificação no Android Auto](https://developer.android.com/training/cars/communication/notification-messaging).
[Templated messaging](https://developer.android.com/training/cars/communication/templated-messaging).
[Restrições de templates](https://developer.android.com/training/cars/apps/library/template-restrictions).
[Visão geral dos templates](https://developer.android.com/design/ui/cars/guides/templates/overview).
`docs/reference/remote-wire-compatibility.md`.
`docs/reference/ssh-execution-boundary.md`.
`docs/reference/agent-status-store.md`.
`docs/reference/agent-pty-transcript-capture.md`.
