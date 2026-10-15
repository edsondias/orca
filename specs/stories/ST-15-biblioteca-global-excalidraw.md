# ST-15: Biblioteca de formas global

Feature: [FT-04](../features/FT-04-editor-excalidraw.md).

## História

Como usuário do Orca, quero que as formas que salvo na biblioteca do Excalidraw apareçam em qualquer desenho, para reaproveitá-las entre projetos.

## Critérios de aceite

1. A biblioteca fica em `excalidraw-library.json`, dentro da pasta de dados do usuário do Orca.
2. O main lê e grava a biblioteca por dois canais IPC, e a gravação é atômica.
3. Arquivo ausente ou corrompido abre como biblioteca vazia, sem travar o desenho.
4. Um item salvo num desenho aparece ao abrir outro, inclusive depois de reiniciar o Orca.
5. Desenhos em workspaces SSH usam a mesma biblioteca local.
