# ST-02: método `terminal.replyToAgentPrompt` com guarda no host

Feature: [FT-01](../features/FT-01-notificacoes-no-carro.md).
Camada: desktop.

## História

Como usuário no carro, quero que uma resposta atrasada nunca caia num prompt novo, para não aprovar algo que eu não vi.

## Escopo

Criar o método `terminal.replyToAgentPrompt { terminalHandle, expectedPermissionSequence, text }` em `src/main/runtime/rpc/methods/`.
O host compara a `permissionSequence` atual do painel com a esperada, usando o que já existe em `agent-prompt-submission-verification.ts`.
Se forem iguais, o host escreve o texto e o Enter no PTY e responde `{ delivered: true }`.
Se forem diferentes, o host não escreve nada e responde `{ delivered: false, reason: 'prompt-changed' }`.
Incluir o método no allowlist do mobile em `runtime-rpc-mobile-method-allowlist.ts`.
Reaproveitar a escrita de prompt que já existe em `orca-runtime-write-terminal-agent-prompt.ts` em vez de criar uma nova.

## Critérios de aceite

- [ ] Com a sequência certa, o texto chega ao PTY.
- [ ] Com a sequência errada, nada é escrito e a resposta traz `prompt-changed`.
- [ ] Num painel de host SSH, o método funciona, e sem contato com o host a resposta usa o veredito `unverifiable`.
- [ ] O método está no allowlist do mobile.
