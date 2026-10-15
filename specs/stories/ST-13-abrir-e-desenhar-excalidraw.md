# ST-13: Abrir e desenhar um arquivo Excalidraw

Feature: [FT-04](../features/FT-04-editor-excalidraw.md).

## História

Como usuário do Orca, quero abrir um `.excalidraw` e ver o desenho editável, para desenhar sem sair do Orca.

## Critérios de aceite

1. `*.excalidraw` e `*.excalidraw.json` são reconhecidos como a linguagem `excalidraw`, e `.json` comum continua como JSON.
2. O arquivo abre no modo Visual, com o desenho montado a partir do JSON.
3. Arquivo vazio abre como cena em branco.
4. JSON inválido, ou sem `type: "excalidraw"`, mostra erro com um botão para o modo Source e nunca é gravado pelo viewer.
5. O tema do Excalidraw acompanha o tema do Orca, inclusive quando muda com o arquivo aberto.
6. O pacote só é baixado quando o primeiro desenho é aberto.
7. Desenhar marca a aba como alterada, e mudanças só de seleção, zoom ou rolagem não marcam.
