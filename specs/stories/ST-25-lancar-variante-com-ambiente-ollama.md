# ST-25: Lançar a variante com o ambiente do Ollama

Feature: [FT-07](../features/FT-07-variantes-claude-ollama.md).

## História

Como usuário do Orca, quero que a variante abra o Claude Code falando com o Ollama no modelo cadastrado, para trabalhar com esse modelo sem afetar o Claude normal.

## Critérios de aceite

1. O processo lançado recebe `ANTHROPIC_BASE_URL=http://localhost:11434`, `ANTHROPIC_AUTH_TOKEN=ollama` e `ANTHROPIC_API_KEY` definido e vazio.
2. `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL` e `ANTHROPIC_DEFAULT_SONNET_MODEL` recebem o modelo, com o sufixo `[1m]` quando a marca de 1M está ligada.
3. `ANTHROPIC_DEFAULT_HAIKU_MODEL` recebe o modelo sem o sufixo.
4. O ambiente configurado do Claude continua valendo, e em chave repetida vale a da variante.
5. O comando é o do Claude, com os argumentos e o modo de permissão configurados para o Claude.
6. A variante sempre abre no terminal, mesmo quando o chat nativo é o padrão.
7. Se a variante não existir mais nas configurações, o lançamento falha com aviso e não abre sessão.
8. Em nenhum caminho a variante abre uma sessão no Claude da Anthropic.
9. As variáveis não aparecem em outros terminais nem no Claude normal.
10. O lançamento funciona em worktree do git, em workspace de pasta e em worktree remoto por SSH.
11. O lançamento não passa o `--model` do seletor de modelo do Orca.
12. Em workspace servido por um host pareado, as variantes não aparecem nos seletores.
