# ST-16: Criar um desenho novo pelo explorador

Feature: [FT-04](../features/FT-04-editor-excalidraw.md).

## História

Como usuário do Orca, quero criar um desenho Excalidraw pelo explorador de arquivos, para começar a desenhar sem copiar um arquivo modelo.

## Critérios de aceite

1. Os menus do explorador que oferecem "New File" também oferecem "New Excalidraw Drawing".
2. O nome é digitado no input inline, como no "New File".
3. Sem o sufixo `.excalidraw` ou `.excalidraw.json`, o sufixo `.excalidraw` é acrescentado.
4. O arquivo é criado vazio, com desfazer e refazer, e abre no modo Visual como cena em branco.
5. A criação funciona em workspace local, SSH e folder workspace.
