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
O texto das mensagens segue o idioma do app.

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
worktree.ps                                    ├─ CarConversationStore (JS)
                                               ├─ CarSnapshot (JS) ──► CarImageRenderer (Kotlin)
                                               ├─ orca-car-messaging (Kotlin) ─────────────────► Android Auto
terminal.replyToAgentPrompt ◄─────────────     └─ ReplyRouter (JS)
agentSession.respondToApproval ◄──────────
```

| Unidade | Onde | Responsabilidade | Fase |
|---|---|---|---|
| Campos opcionais no `MobileNotificationDispatchEvent` | `src/main/runtime/runtime-mobile-notification-controller.ts` | Dizer qual prompt a resposta destrava e distinguir o agente encerrado | 1 |
| `terminal.replyToAgentPrompt` | `src/main/runtime/rpc/methods/` | Escrever a resposta no PTY só se a `permissionSequence` ainda for a esperada | 1 |
| Sessão de carro | `mobile/src/car/` e o módulo nativo | Manter vivas as assinaturas enquanto o Android Auto estiver conectado | 1 |
| `orca-car-messaging` | `mobile/modules/orca-car-messaging/` | Notificação `MessagingStyle`, ações de responder e marcar como lida, receptor da resposta | 1 |
| `CarConversationStore` | `mobile/src/car/` | Mapear cada agente para uma conversa estável e guardar o histórico da sessão | 1 |
| `ReplyRouter` | `mobile/src/car/` | Normalizar a resposta, escolher o método de envio e publicar o recibo | 1 |
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
O usuário liga o interruptor "Modo carro" no app, que continua ligado mesmo com o app fechado.
A partir da fase 2, o usuário toca no ícone do Orca na tela do carro, e o Android Auto inicia o `OrcaCarAppService`.

### Efeitos do início

O módulo nativo sobe um serviço em primeiro plano com a notificação fixa "Orca no carro".
O tipo do serviço é `connectedDevice`, com `specialUse` como alternativa se o Android recusar.
O JS recebe `carSessionActive=true`.
Enquanto a sessão estiver ativa, o supervisor de conexão não aplica o fechamento por segundo plano (`RELAY_BACKGROUND_GRACE_MS` e a política equivalente da conexão direta).
Ficam vivas a assinatura `notifications.subscribe`, com reposição por `notifications.getMissedSince` ao reconectar, e a consulta `worktree.ps` no ritmo que o app já usa.

### Fim

Quando a `CarConnection` informa que o Android Auto desconectou, há uma tolerância de 60 segundos para cobrir mau contato no cabo.
Depois disso, o serviço para, as conversas do carro são limpas e a política normal de segundo plano volta a valer.

### Limitação conhecida da fase 1

Se o app estiver totalmente fechado e o usuário só plugar o cabo, nada liga a sessão.
O Android não avisa apps comuns sobre a conexão com o carro.
O "Modo carro" e abrir o app uma vez cobrem esse caso, e o ícone no carro resolve a partir da fase 2.

## 5. Fluxo de eventos e respostas

### Evento

O desktop publica um `MobileNotificationDispatchEvent`.
O `CarConversationStore` associa o evento a uma conversa estável, identificada pelo `terminalHandle` ou pelo `sessionId` estruturado.
O módulo nativo publica a notificação `MessagingStyle`, e o Android Auto anuncia a mensagem.

### Campos opcionais novos no evento

Todos os campos são opcionais e aditivos, então clientes antigos os ignoram.

| Campo | Conteúdo |
|---|---|
| `promptRef` | `{ kind: 'terminal', terminalHandle, permissionSequence }` ou `{ kind: 'structured', sessionId, itemId, expectedRevision, options }` |
| `source: 'agent-exited'` | Novo valor de `source` para o agente encerrado, emitido só com o veredito `exited` |

Um cliente antigo que receba um `source` desconhecido precisa tratá-lo como notificação genérica.
O teste de compatibilidade da story ST-01 cobre esse caso.

### Resposta

1. O Android Auto lê de volta a resposta transcrita e o usuário confirma.
2. A resposta chega ao receptor nativo, que a repassa ao JS se ele estiver vivo, ou sobe uma tarefa headless.
3. O `ReplyRouter` normaliza o texto, conforme a seção 6.
4. Para sessão estruturada, o envio usa `agentSession.respondToApproval` ou `agentSession.respondToQuestion`, com o `expectedRevision` como compare-and-set no host.
5. Para agente de terminal, o envio usa `terminal.replyToAgentPrompt`, que só escreve no PTY se a `permissionSequence` ainda for a esperada.
6. Se o host aceitar, entra na conversa o recibo "✓ Enviado: 1 (Yes)".
7. Se o host recusar porque o prompt mudou, nada é escrito e entra a mensagem "O agente já seguiu; resposta descartada".

### Por que a guarda fica no host

Checar no celular e depois enviar deixa uma janela de corrida.
O host de execução é o dono do status, conforme `docs/reference/agent-status-store.md`.
O runtime já mantém uma `permissionSequence` por painel em `src/main/runtime/agent-prompt-submission-verification.ts`.

### Desktop antigo

O celular descobre se o host tem `terminal.replyToAgentPrompt` pela resposta do próprio host.
Um erro de método inexistente marca o host como sem suporte, e essa marca fica guardada por host.
Sem suporte, o carro avisa mas não oferece a ação "Responder".
O carro nunca cai para o `terminal.send` sem guarda.

## 6. Normalização da voz

"um", "dois", "três", "sim" e "não" viram o número ou a opção somente quando o prompt tem opções numeradas e a frase inteira é só aquela palavra.
Em qualquer outro caso, vai o texto ditado sem mudança.
O limite é de 500 caracteres.
Uma entrega repetida pelo Android Auto é descartada por 30 segundos, pela chave `(conversa, sequência, texto)`.

Para sessões estruturadas, as opções vêm prontas no `promptRef.options`.
Para agentes de terminal, detectar opções numeradas significa ler o que a CLI pinta na tela.
Pela regra do repositório, essa leitura precisa ser escrita contra transcrições capturadas com `docs/reference/agent-pty-transcript-capture.md`, uma por CLI suportada.
Enquanto não houver transcrição de uma CLI, a normalização fica desligada para ela e o texto vai sem mudança.

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
| O prompt mudou ou o agente seguiu | "O agente já seguiu; resposta descartada" |
| Host SSH sem contato | "Sem contato com o host; não sei se o agente está vivo", com o veredito `unverifiable` |
| Processo encerrado | "Agente encerrado", só com o veredito `exited` |
| Desktop sem o método novo | Aviso sem a ação de responder e a mensagem única "Atualize o Orca desktop para responder pelo carro" |
| Conexão caída por mais de 60 segundos | Uma única mensagem "Sem conexão com o desktop", que some ao reconectar |
| Permissão de notificação negada | A sessão não começa e o app mostra o motivo |

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
| `car-reply-normalization` | Conversão de palavras em números só com opções numeradas, limite de 500 caracteres e deduplicação |
| `car-snapshot` | Vagas fixas, vaga "livre", hash estável e histórico de 30 minutos |
| `CarConversationStore` | Conversa estável por agente, histórico da sessão e limpeza no fim |
| `ReplyRouter` | Escolha do método, ausência de "Responder" sem suporte e mensagens de `unverifiable` e `exited` |
| Ciclo da sessão | Transições de estado, tolerância de 60 segundos e exceção ao fechamento por segundo plano |

### Desktop (vitest, `pnpm test`)

`terminal.replyToAgentPrompt` escreve quando a `permissionSequence` bate, recusa quando ela mudou e funciona num painel de host SSH.
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
O `mobile/` precisa ser instalado com `pnpm install --config.node-linker=hoisted`.
Sem isso, o layout isolado do pnpm gera caminhos acima de 260 caracteres que o ninja do CMake 3.22 não lê.
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
