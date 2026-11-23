# ST-24: Escolher uma variante na lista de agentes

Feature: [FT-07](../features/FT-07-variantes-claude-ollama.md).

## História

Como usuário do Orca, quero ver cada modelo do Ollama como entrada própria na lista de agentes, para abrir uma sessão nele com um clique.

## Critérios de aceite

1. O menu "+" e o lançamento rápido da barra de abas mostram cada variante logo depois do Claude.
2. O seletor de agente do compositor de novo workspace mostra as mesmas variantes.
3. Cada entrada mostra o nome cadastrado e o ícone do Claude.
4. A busca do menu encontra a variante pelo nome e pelo modelo.
5. As variantes não aparecem quando o Claude não está detectado ou está desabilitado.
6. O Claude normal continua na lista e abre sem nenhuma variável do Ollama.
7. Automações, ações de IA do controle de versão e a escolha do agente padrão não mostram variantes.
