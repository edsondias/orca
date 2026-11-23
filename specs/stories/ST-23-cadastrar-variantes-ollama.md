# ST-23: Cadastrar modelos do Ollama em Settings

Feature: [FT-07](../features/FT-07-variantes-claude-ollama.md).

## História

Como usuário do Orca, quero cadastrar os modelos do Ollama que uso com o Claude Code, para escolhê-los depois sem editar comando nem variável.

## Critérios de aceite

1. A linha do Claude em Settings, Agents mostra a seção "Ollama models".
2. Adicionar exige nome e modelo, e oferece a marca de 1M de contexto.
3. Nome vazio, modelo vazio ou modelo com caractere fora de letras, dígitos e `. _ : / -` não são aceitos.
4. Editar e remover funcionam, e a mudança vale no próximo lançamento sem reiniciar o Orca.
5. A lista aceita no máximo 20 variantes.
6. As variantes persistem depois de fechar e abrir o Orca.
7. Itens inválidos ou com id repetido no arquivo de configurações são descartados na leitura.
8. A seção segue `docs/STYLEGUIDE.md` e passa em `pnpm run check:code-quality:changed`.
