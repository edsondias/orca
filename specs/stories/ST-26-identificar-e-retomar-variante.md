# ST-26: Identificar e retomar a sessão de uma variante

Feature: [FT-07](../features/FT-07-variantes-claude-ollama.md).

## História

Como usuário do Orca, quero saber qual aba está em qual modelo e retomar a sessão no mesmo modelo, para não confundir uma sessão do Ollama com uma do Claude normal.

## Critérios de aceite

1. A aba de uma variante mostra o nome cadastrado como prefixo do título da conversa, por exemplo "Kimi K3.1 · Corrigir o login".
2. Antes de a conversa ter título, a aba mostra só o nome da variante.
3. O nome continua na aba depois de fechar e abrir o Orca e depois da retomada.
4. O status na barra lateral e os hooks funcionam como no Claude normal.
5. Dormir e acordar uma sessão de variante mantém o ambiente do Ollama.
6. A restauração a frio de uma sessão de variante mantém o ambiente do Ollama.
7. A retomada usa o ambiente capturado no lançamento, mesmo que a variante tenha sido editada depois.
8. Sem ambiente capturado, a retomada resolve a variante pelo id guardado na aba.
9. Se a variante não puder ser resolvida, a retomada falha com aviso e não abre o Claude normal.
10. O fork de sessão e a continuação em outra aba, a partir de uma aba de variante, seguem na mesma variante.
11. A retomada pelo AI Vault abre no Claude normal, como limitação conhecida.
