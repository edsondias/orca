# ST-02: método `terminal.replyToAgentPrompt` com guarda no host

Feature: [FT-01](../features/FT-01-notificacoes-no-carro.md).
Camada: desktop.

## História

Como usuário no carro, quero que uma resposta atrasada nunca caia num prompt novo, para não aprovar algo que eu não vi.

## Escopo

Criar o método `terminal.replyToAgentPrompt { terminal, fence, text, enter }` em `src/main/runtime/rpc/methods/`.
A guarda é o `TerminalAgentPromptFence` com `generation`, `permissionSequence`, `blockedSince` e `promptKey`, porque o bloqueio vindo do hook HTTP não incrementa a `permissionSequence` e um respawn a zera.
O `promptKey` são os 16 primeiros caracteres hexadecimais do sha256 de `toolName`, `toolInput` e `interactivePrompt` da linha de hook recente, e "bloqueado" é decidido pela precedência de status do runtime.
Se a `fence` ainda valer, o host escreve o texto no PTY, com Enter só quando `enter` for verdadeiro, e responde `{ delivered: true }`.
Teclas de opção vão com `enter: false`, como as respostas de permissão que o celular já envia.
Se a `fence` não valer, o host não escreve nada e responde `{ delivered: false, reason: 'prompt-changed' }`.
Se o texto foi escrito mas o Enter foi retido porque o prompt mudou, a resposta é `prompt-changed-after-text`.
O método aceita um `client` opcional, com o mesmo esquema do `terminal.send`, e aplica o mesmo bloqueio de entrada por cliente, e um terminal bloqueado responde `terminal-locked`.
O piso de entrada do mobile só é tomado quando o cliente assina aquele terminal, então o carro, que não assina terminais, escreve sem tomar o piso.
Incluir o método no allowlist do mobile em `runtime-rpc-mobile-method-allowlist.ts`.
Reaproveitar a escrita de prompt que já existe em `orca-runtime-write-terminal-agent-prompt.ts` em vez de criar uma nova.

## Critérios de aceite

- [ ] Com a sequência certa, o texto chega ao PTY.
- [ ] Com a `fence` errada, inclusive após respawn ou com outro `promptKey`, nada é escrito e a resposta traz `prompt-changed`.
- [ ] Com o prompt mudando entre a escrita do texto e o Enter, a resposta é `prompt-changed-after-text`.
- [ ] Com o terminal bloqueado por outro cliente, a resposta é `terminal-locked`.
- [ ] Num painel de host SSH, o método funciona, e sem contato com o host o celular mostra "Reply not sent", porque este método ainda não tem o código de recusa `unverifiable`, e nunca se afirma que o agente morreu.
- [ ] O método está no allowlist do mobile.
