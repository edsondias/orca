# ST-14: Salvar, alternar para o código-fonte e recarregar alterações externas

Feature: [FT-04](../features/FT-04-editor-excalidraw.md).

## História

Como usuário do Orca, quero salvar o desenho com Ctrl+S e ver o JSON quando precisar, para manter o arquivo versionado e compatível com outras ferramentas.

## Critérios de aceite

1. Ctrl+S, ou Cmd+S no macOS, descarrega o rascunho pendente e grava o arquivo pela fila de gravação do editor.
2. O arquivo gravado abre sem perda na extensão do VS Code e no excalidraw.com.
3. Fechar a aba ou salvar logo depois de desenhar não perde o último traço, graças ao flush pendente.
4. O seletor "Source / Visual" troca entre o desenho e o JSON, e uma edição no JSON aparece no desenho.
5. Uma alteração externa sem rascunho pendente recarrega o desenho sem remontar o componente.
6. Uma alteração externa com rascunho pendente mostra o banner de conflito que o editor já tem.
7. O fluxo funciona igual num workspace SSH e num folder workspace.
