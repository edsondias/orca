# Modelos do Ollama como variantes do Claude na lista de agentes

Data: 22/11/2026.
Status: implementado em 23/11/2026, validação manual pendente (SSH e Claude real).
Branch: `feat/claude-ollama-variants`, criada a partir da `feat/drawio-editor`.
ADR: [docs/adr/0004-variantes-claude-ollama.md](../docs/adr/0004-variantes-claude-ollama.md).
Épico: [specs/epics/EP-04-variantes-claude-ollama.md](epics/EP-04-variantes-claude-ollama.md).

## Objetivo

O usuário cadastra modelos do Ollama no Orca, e cada um aparece na lista de agentes como entrada própria, ao lado do Claude normal.
Escolher uma dessas entradas abre o Claude Code falando com o Ollama naquele modelo.
O Claude normal continua disponível e inalterado.

## Por que agora

O usuário usa o Claude Code com modelos servidos pelo Ollama, como `kimi-k3.1-pro:cloud` e `deepseek-v4.1-flash:cloud`.
Hoje o Orca só permite um comando por agente, no campo Command de Settings, Agents.
Trocar de modelo exige editar esse campo, e enquanto ele está preenchido o Claude normal fica indisponível.

## O que o usuário pediu

1. Os modelos do Ollama aparecem como agentes próprios na lista.
2. O cadastro é manual, com nome e modelo, sem descoberta automática pelo `ollama list`.
3. Cada modelo é uma variante do agente Claude, e não um agente novo no catálogo.
4. O lançamento usa variáveis de ambiente, e não o comando `ollama launch`.

## Metas

1. Cadastrar, editar e remover variantes em Settings, Agents.
2. Mostrar cada variante como entrada própria nos seletores de agente do escopo.
3. Lançar a variante como o agente `claude`, com as variáveis de ambiente do Ollama aplicadas só ao processo lançado.
4. Manter status na barra lateral, hooks, reconhecimento de título e retomada de sessão funcionando como no Claude normal.
5. Identificar a aba pelo nome da variante.

## Fora do escopo

1. Descoberta automática de modelos instalados no Ollama.
2. As verificações que o `ollama launch` faz antes de abrir (servidor no ar, modelo disponível, login na nuvem).
3. Variantes de outros agentes, como Codex via Ollama.
4. O chat nativo estruturado para variantes.
5. Variantes em automações, orquestração, ações de IA do controle de versão, aplicativo móvel e na escolha do agente padrão.
6. Argumentos ou modo de permissão próprios por variante. A variante herda os do Claude.
7. Endereço do Ollama configurável. O endereço é `http://localhost:11434`.
8. Variantes em workspace servido por um host pareado.
9. Retomada pelo AI Vault no modelo do Ollama.

## O que tornaria isto um fracasso

1. Uma variante abrir, em qualquer caminho, uma sessão no Claude da Anthropic sem avisar. Isso gasta a conta do usuário com um modelo que ele não escolheu.
2. As variáveis do Ollama vazarem para o Claude normal ou para outros terminais.
3. Os merges do upstream passarem a conflitar com frequência por causa desta mudança.

## Como funciona hoje

A lista de agentes é o tipo fechado `TuiAgent`, em `src/shared/tui-agent.ts`.
Cada identificador novo exige mudança em cerca de 29 arquivos.
O catálogo exibido vem de `getAgentCatalog`, em `src/renderer/src/lib/agent-catalog.tsx`.
O comando, os argumentos e o ambiente de cada agente ficam em `agentCmdOverrides`, `agentDefaultArgs` e `agentDefaultEnv`, em `src/shared/global-settings-types.ts`.
O ambiente do lançamento é resolvido por `resolveTuiAgentLaunchEnv`, em `src/shared/tui-agent-launch-defaults.ts`, chamado em cerca de 18 pontos.
O lançamento em nova aba passa por `launchAgentInNewTab`, em `src/renderer/src/lib/launch-agent-in-new-tab.ts`, que monta o plano de início com `agentEnv` e escolhe entre três rotas: terminal, chat nativo estruturado e host pareado.
A rota estruturada resolve o ambiente no processo principal, a partir das configurações, em `src/main/runtime/orca-runtime-get-structured-agent-session-create-support.ts`.
Um comando personalizado já força a rota de terminal, por `hasExplicitTuiLaunchCommand`, em `src/shared/tui-agent-launch-command-override.ts`.
A retomada de sessão dormente reaproveita o ambiente capturado no lançamento (`launchConfig.agentEnv`), em `src/renderer/src/lib/sleeping-agent-session-launch.ts`.
A rota de host pareado envia o ambiente do plano de início, em `src/renderer/src/lib/launch-agent-web-host-tab.ts`.

## Abordagens consideradas

| Abordagem                                    | O que entrega                                                   | Custo                                                                                               | Decisão                                                                      |
| -------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A. Variantes do Claude                       | Uma entrada por modelo, tratada como `claude` no resto do Orca. | Configuração nova, edição em Settings e a variante levada do seletor ao lançamento.                 | Escolhida pelo usuário.                                                      |
| B. Agente fixo "Claude (Ollama)" no catálogo | Uma entrada só, com o modelo escolhido no lançamento.           | Cerca de 29 arquivos centrais, com conflito provável a cada merge do upstream.                      | Descartada: não dá uma entrada por modelo e pesa no fork.                    |
| C. Agentes livres definidos pelo usuário     | Qualquer CLI vira agente.                                       | Abrir o tipo fechado `TuiAgent` em todo o código, sem leitura de status para agentes desconhecidos. | Descartada: reforma grande demais para o pedido.                             |
| Quick Commands do terminal                   | Um atalho salvo com o comando.                                  | Nenhum código.                                                                                      | Descartada: digita num terminal já aberto e não aparece na lista de agentes. |

Dentro da abordagem A havia duas formas de lançar.

| Forma                                             | Vantagem                                                                                                  | Desvantagem                                                                                 | Decisão                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------- |
| Comando `ollama launch claude --model X --`       | O Ollama verifica servidor, modelo e login.                                                               | Exige o `--` para repassar argumentos e conflita com o seletor de modelo e esforço do Orca. | Descartada.             |
| Variáveis de ambiente com o comando `claude` puro | Sem conflito de argumentos, sem vazamento, com controle do mapeamento de modelos e da janela de contexto. | Perde as verificações do `ollama launch`.                                                   | Escolhida pelo usuário. |

## Design

### Dados

Uma variante tem quatro campos.

| Campo       | Tipo     | Regra                                                                        |
| ----------- | -------- | ---------------------------------------------------------------------------- |
| `id`        | texto    | Gerado pelo Orca, único e estável.                                           |
| `label`     | texto    | Nome exibido, obrigatório, até 40 caracteres.                                |
| `model`     | texto    | Nome do modelo no Ollama, obrigatório, só com letras, dígitos e `. _ : / -`. |
| `context1m` | booleano | Liga o sufixo `[1m]`.                                                        |

As variantes ficam numa lista nova nas configurações globais, opcional, com no máximo 20 itens.
A normalização descarta itens inválidos e ids repetidos, do mesmo modo que as outras listas de configuração.
O nome da chave fica a cargo de quem implementa, por exemplo `claudeOllamaVariants`.

### Ambiente da variante

Uma função pura e compartilhada monta o ambiente a partir da variante.
Com `M` igual a `model` e `M1` igual a `model` mais `[1m]` quando `context1m` está ligado, ou igual a `model` quando está desligado, o resultado é este.

| Variável                         | Valor                    |
| -------------------------------- | ------------------------ |
| `ANTHROPIC_BASE_URL`             | `http://localhost:11434` |
| `ANTHROPIC_AUTH_TOKEN`           | `ollama`                 |
| `ANTHROPIC_API_KEY`              | texto vazio              |
| `ANTHROPIC_MODEL`                | `M1`                     |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`   | `M1`                     |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | `M1`                     |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`  | `M`                      |

O ambiente final é o ambiente configurado do Claude com o ambiente da variante por cima.
Em chave repetida, vale a da variante.
O mapeamento de opus, sonnet e haiku existe para que o seletor de modelo do Orca, que passa `--model`, continue caindo no modelo do Ollama.
`ANTHROPIC_API_KEY` vazio precisa chegar ao processo como variável definida e vazia, para anular uma chave real herdada do sistema.
Quem implementa confirma que o caminho de ambiente do terminal preserva valor vazio e, se não preservar, corrige ou usa a lista de variáveis a remover que o lançamento já tem.

### Cadastro em Settings

A linha do Claude em Settings, Agents ganha uma seção "Ollama models".
A seção lista as variantes e permite adicionar, editar e remover.
Cada item mostra o nome, o modelo e a marca de 1M.

```
Claude                                   [Default] [Docs]
  Command      claude
  Arguments    --dangerously-skip-permissions
  Environment  No default environment
  Ollama models
    Kimi K3.1        kimi-k3.1-pro:cloud          1M   [Edit] [Remove]
    DeepSeek Flash   deepseek-v4.1-flash:cloud    1M   [Edit] [Remove]
    [+ Add model]
```

A seção segue `docs/STYLEGUIDE.md` e usa os componentes de `src/renderer/src/components/ui/`.
Os textos passam pelo mecanismo de tradução existente.

### Seletores

Os seletores do escopo são dois.

1. O menu "+" e o lançamento rápido da barra de abas, que abrem um agente numa aba nova.
2. O seletor de agente do compositor de novo workspace.

Em cada um, as variantes aparecem logo depois do Claude, com o nome cadastrado e o ícone do Claude.
As variantes só aparecem quando o Claude está detectado e habilitado.
A busca do menu encontra a variante pelo nome e pelo modelo.
Os outros seletores, como automações e ações de IA do controle de versão, não mostram variantes.

### Lançamento

A opção escolhida leva o agente `claude` e o id da variante até o lançamento.
O lançamento resolve a variante pelo id nas configurações e aplica o ambiente dela ao plano de início.
Se o id não existir mais, o lançamento falha com aviso e não abre nada.
Uma variante sempre usa a rota de terminal, pelo mesmo mecanismo que um comando personalizado já usa.
O motivo é que a rota estruturada resolve o ambiente no processo principal e abriria o Claude da Anthropic.
Se o campo Command do Claude estiver preenchido, a variante usa esse comando com o ambiente dela por cima.

O lançamento de uma variante não passa a opção de modelo da sessão (`--model`).
O modelo é fixado pela variante, e o catálogo do Orca tem nomes, como `fable`, que o Ollama não conhece.
A opção de esforço segue como no Claude.
O comando `/model` digitado dentro do Claude Code fica fora do controle do Orca.

Em workspace servido por um host pareado, as variantes não aparecem nos seletores.
O motivo é que o lançamento sem prompt envia ao host só o agente, em `src/renderer/src/lib/launch-agent-web-host-tab.ts`, e o host monta o plano com as configurações dele, o que abriria o Claude normal.

### Marca de variante

A aba de uma variante guarda uma marca persistida com o id e o nome da variante.
A marca acompanha a aba no estado salvo e no registro da sessão dormente.
Ela serve para três coisas: mostrar o nome, retomar no mesmo modelo e impedir que a sessão caia no Claude normal.
A forma de guardar a marca fica a cargo de quem implementa, com o menor número possível de arquivos centrais tocados.

### Identidade da aba

A aba mostra o nome da variante como prefixo do título da conversa, por exemplo "Kimi K3.1 · Corrigir o login".
Antes de a conversa ter título, a aba mostra só o nome da variante.
O nome vem da marca de variante, e por isso sobrevive ao reinício do Orca e à retomada.
O rótulo dos Quick Commands (`quickCommandLabel`) não serve sozinho, porque substitui o título da conversa e não é copiado para a aba recriada na retomada.
Status, ícone, telemetria e hooks continuam os do Claude.

### Retomada, fork e continuação

Dormir e acordar, e a restauração a frio, reaproveitam o ambiente capturado no lançamento (`launchConfig.agentEnv`).
Uma sessão de variante retomada continua falando com o Ollama, mesmo que a variante tenha sido editada depois.
Quando o ambiente capturado não existe e a aba tem a marca de variante, o Orca resolve a variante de novo pelo id.
Se a variante não existir mais, a retomada falha com aviso e não abre o Claude normal.
O fork de sessão e a continuação em outra aba, feitos a partir de uma aba de variante, herdam a variante pela mesma regra.
Testes cobrem esses caminhos, porque uma falha aqui cai no fracasso número 1.

A retomada pelo AI Vault é a exceção.
O histórico do Claude Code não registra que a sessão rodou no Ollama, então o Vault abre a sessão no Claude normal.
Isso fica como limitação conhecida.

### SSH e pastas

Num worktree remoto por SSH, `localhost:11434` é o host remoto, e o Ollama precisa estar rodando lá.
O Orca não verifica isso.
Workspaces de pasta se comportam como worktrees do git.

### Compatibilidade

A configuração nova e a marca de variante são opcionais, e versões antigas as ignoram.
Nada muda no que cliente e host pareado trocam, porque as variantes ficam indisponíveis nesse caso.

## Testes

1. A função de ambiente, com e sem 1M.
2. A normalização da lista, com itens inválidos, ids repetidos e excesso de itens.
3. As opções dos dois seletores, com o Claude detectado, não detectado e desabilitado.
4. O lançamento com variante: ambiente aplicado, rota de terminal forçada, sem `--model` da sessão e falha com id inexistente.
5. O lançamento do Claude normal sem nenhuma variável do Ollama.
6. A retomada de uma sessão de variante com o ambiente capturado, e sem ele, pela marca.
7. A retomada com a variante removida, que falha sem abrir o Claude normal.
8. O fork e a continuação a partir de uma aba de variante.
9. Os seletores sem variantes em workspace de host pareado.
10. O título da aba com e sem título de conversa.

A validação segue o `AGENTS.md`: `pnpm tc`, `pnpm test` nos arquivos tocados e `pnpm run check:code-quality:changed`.

## Decisões tomadas pelo Claude, sujeitas a correção

1. O escopo de seletores se limita à barra de abas e ao compositor de novo workspace.
2. O endereço do Ollama é fixo.
3. A variante herda argumentos e modo de permissão do Claude.
4. A variante usa o ícone do Claude.
5. A variante usa sempre o terminal.
6. O limite é de 20 variantes.
7. A aba mostra o nome da variante como prefixo do título da conversa.
8. A variante não passa o `--model` do seletor de modelo do Orca.
9. As variantes ficam indisponíveis em workspace de host pareado.
10. Fork e continuação herdam a variante, e a retomada sem variante resolvível falha com aviso.
11. A retomada pelo AI Vault abre no Claude normal, como limitação conhecida.

## O que fica para quem implementa

1. O nome da chave de configuração e dos módulos novos, seguindo a regra de nomes do `AGENTS.md`.
2. Onde exatamente a variante entra em cada seletor e como o id trafega até o lançamento.
3. Onde a marca de variante é guardada na aba e no registro da sessão.
4. O desenho fino da seção em Settings, dentro do guia de estilo.
