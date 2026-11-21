# ADR-0002: Editor Excalidraw nativo como componente React do renderer

Data: 15/10/2026.
Status: substituído em 20/11/2026 pelo plugin oficial `stablyai.orca-excalidraw`.

O upstream lançou na v1.4.245 um sistema de plugins com editores próprios, e o plugin oficial do Excalidraw atende ao uso do fork.
O editor nativo foi revertido na `main` para reduzir os conflitos a cada atualização do upstream.
Design completo: [specs/orca-excalidraw-design.md](../../specs/orca-excalidraw-design.md).

## Contexto

O usuário quer abrir e desenhar arquivos `.excalidraw` dentro do Orca, como faz no VS Code com a extensão `pomdtr.excalidraw-editor`.
O Orca já tem visualizadores especiais carregados de forma tardia, e o `IpynbViewer` edita um arquivo JSON visualmente e devolve o texto pela gravação normal do editor.
Essa gravação já trata arquivos locais e SSH, Ctrl+S, rascunhos e alteração externa.

## Decisão

1. O Excalidraw entra como o componente React do pacote `@excalidraw/excalidraw`, dentro de um `ExcalidrawViewer` carregado de forma tardia no renderer.
2. O viewer segue o contrato do `IpynbViewer` (`content`, `onContentChange`, `onDirtyStateHint`, `onSave` e o flush pendente), e toda leitura e gravação passa pela fila de gravação existente.
3. O escopo inicial cobre só `*.excalidraw` e `*.excalidraw.json`.
4. O tema segue o Orca pelo `useDocumentDarkTheme()`.
5. A biblioteca de formas é global, guardada pelo main num arquivo em `userData` com gravação atômica.
6. Um desenho novo nasce como arquivo vazio, e o viewer trata arquivo vazio como cena em branco.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Excalidraw isolado em iframe ou webview, como na extensão do VS Code | Exige um protocolo de mensagens próprio para carregar, salvar, marcar alteração, atalhos e tema, além de um segundo build. A extensão só faz assim porque o VS Code obriga o uso de webview. |
| Abrir o excalidraw.com no navegador embutido | Não lê nem grava o arquivo do disco. |
| Incluir `.excalidraw.svg` e `.excalidraw.png` já na primeira entrega | O PNG é binário e a fila de gravação do editor só grava texto hoje. O SVG exige reexportar a imagem a cada salvamento. |
| Biblioteca num arquivo do workspace | Sujaria os repositórios. O usuário preferiu uma biblioteca única para todos os projetos. |
| Biblioteca no `localStorage` do renderer | O renderer não usa `localStorage` para estado persistente, e o arquivo em `userData` sobrevive a limpeza de cache e acompanha o perfil do Orca. |
| Gravar um JSON de cena vazia ao criar o desenho | Exigiria um caminho de criação com conteúdo inicial. Com arquivo vazio tratado como cena em branco, o fluxo atual de "New File" basta. |

## Consequências

1. O pacote ocupa alguns MB, baixados só quando o primeiro `.excalidraw` é aberto.
2. O Excalidraw passa a rodar no mesmo React do Orca, então uma atualização maior do React precisa conferir a compatibilidade do pacote.
3. As fontes vêm de uma CDN, e sem internet o desenho usa fontes do sistema.
   Embutir as fontes fica para uma entrega futura.
4. O arquivo gravado é o JSON padrão do Excalidraw, compatível com a extensão do VS Code e com o excalidraw.com.
