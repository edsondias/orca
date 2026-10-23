# Editor Excalidraw nativo no Orca

Data: 15/10/2026.
Status: implementado na branch feat/excalidraw-editor (15/10/2026).
Atualizado em 15/10/2026: arquitetura alinhada ao código implementado.
Branch: `feat/excalidraw-editor`, criada a partir da `main`.
ADR: [docs/adr/0002-editor-excalidraw-nativo.md](../docs/adr/0002-editor-excalidraw-nativo.md).
Épico: [specs/epics/EP-02-editor-excalidraw.md](epics/EP-02-editor-excalidraw.md).

## Objetivo

O Orca deve abrir arquivos `.excalidraw` como desenho editável, da mesma forma que a extensão `pomdtr.excalidraw-editor` faz no VS Code.
O usuário desenha, salva com Ctrl+S e o arquivo continua sendo o JSON padrão do Excalidraw, legível pela extensão do VS Code e pelo excalidraw.com.

## O que o usuário pediu

1. Abrir `*.excalidraw` e `*.excalidraw.json` no editor visual.
2. O tema claro ou escuro segue a configuração do Orca.
3. A biblioteca de formas é persistida e é uma só para todos os projetos.
4. Existe uma ação para criar um desenho novo pelo explorador de arquivos.

## Fora do escopo

1. Arquivos `.excalidraw.svg` e `.excalidraw.png` com cena embutida.
2. Fontes embutidas no app para uso offline.
   Sem internet, o Excalidraw usa as fontes do sistema no lugar das fontes próprias.
3. Escolha de idioma da interface do Excalidraw, que fica em inglês como o restante do Orca.
4. Biblioteca por workspace, configuração própria de tema e colaboração em tempo real.

## Suposições

1. O pacote é o `@excalidraw/excalidraw` 0.18.1, que declara `react ^17.0.2 || ^18.2.0 || ^19.0.0` como peer.
   O Orca usa React `^19.2.8`, e a compatibilidade em tempo de execução é conferida na primeira tarefa do plano.
2. O pacote baixa as fontes de uma CDN por padrão.
   O renderer do Orca não define CSP hoje, então o download não é bloqueado, e isso precisa ser conferido num build empacotado.

## Como o Orca escolhe o visualizador hoje

O Orca não tem um registro de visualizadores.
A extensão do arquivo vira uma linguagem na tabela `EXT_TO_LANGUAGE` de `src/renderer/src/lib/language-detect.ts`.
A linguagem vira flags em `src/renderer/src/components/editor/editor-panel-render-model.ts`.
`src/renderer/src/components/editor/EditorEditFileSurface.tsx` escolhe o componente numa cadeia de condicionais, e os componentes pesados ficam em `editor-lazy-views.ts` com `lazyWithRetry`.
O modelo mais próximo é o `IpynbViewer`, que edita um JSON visualmente e devolve o texto pela gravação normal do editor.

## Arquitetura

### Reconhecimento do arquivo

1. `language-detect.ts` passa a mapear `.excalidraw` para a linguagem `excalidraw`.
   O nome `*.excalidraw.json` é reconhecido pelo sufixo composto antes da regra genérica de `.json`.
2. `editor-panel-render-model.ts` ganha a flag `isExcalidraw`.
   Abas somente leitura continuam forçadas a `plaintext`, como acontece hoje.
3. `markdown-preview-controls.ts` dá ao Excalidraw os modos `['source', 'rich']`, com `rich` como padrão.
   `EditorViewToggle.tsx` mostra os rótulos "Source" e "Visual".
   O modo `source` abre o JSON no Monaco, como o "Open Source" da extensão.

### Visualizador

`ExcalidrawViewer` é um componente novo, carregado de forma tardia por `editor-lazy-views.ts`.
Ele recebe as mesmas props que o `IpynbViewer` recebe: `content`, `onContentChange`, `onDirtyStateHint` e `onSave`.
O CSS do pacote é importado dentro do módulo tardio, para não pesar na abertura do app.

A validação do texto fica num módulo puro, `excalidraw-file-parse.ts`, que não importa o pacote nem o React:

1. `parseExcalidrawFile(text)` remove o BOM UTF-8 inicial e devolve a cena crua ou um erro tipado.
   Texto vazio ou só com espaços vira cena em branco.
   JSON inválido, JSON sem `type: "excalidraw"` ou JSON com `elements` que não é lista devolve erro.
2. O `restore` do pacote é chamado no próprio viewer, dentro de um `try/catch`.
   Uma cena que passa pela validação rasa mas que o `restore` rejeita vira a mesma tela de erro, e não derruba o editor.
3. A serialização também fica no viewer.
   Ela usa `serializeAsJSON` com destino `local`, a partir dos argumentos do último `onChange`.
   O viewer nunca lê a cena pela API do Excalidraw na hora de descarregar, porque ao desmontar o pacote pode já ter limpado a cena.

O tema vem de `useDocumentDarkTheme()`, o mesmo hook usado pelo `MermaidViewer`.

### Fluxo de edição

1. Na abertura, o viewer interpreta o `content` e monta o Excalidraw com `initialData`.
2. O `onChange` do Excalidraw dispara a cada mudança, inclusive seleção, zoom e rolagem.
   O viewer só considera mudança de conteúdo quando `getSceneVersion(elements)` muda ou quando o conjunto de `files` muda.
3. Uma mudança de conteúdo chama `onDirtyStateHint(true)` na hora e agenda a serialização com debounce de 400 ms, como o notebook faz.
   Ao fim do debounce, o texto vai para `onContentChange`, que grava o rascunho no store.
4. O hook `useExcalidrawDocumentEditing` registra `registerPendingEditorFlush(fileId, flush)`, para que salvar ou fechar a aba descarregue o rascunho pendente antes.
   O rascunho também é descarregado quando o componente desmonta.
5. Desfazer e refazer ficam com o histórico interno do Excalidraw.
   Uma recarga por alteração externa limpa esse histórico.

### Gravação

O viewer captura Ctrl+S com `installEditorSaveShortcut`, de `editor-shortcuts.ts`.
Esse helper põe um listener nativo de `keydown` em captura no contêiner e usa `editorShortcutMatches('editor.save')`.
O listener fica antes do handler de teclado que o Excalidraw registra no próprio contêiner.
Ele descarrega o rascunho e chama `onSave`.
Daí em diante a gravação segue a fila existente (`editor-save-queue.ts`), que usa `writeRuntimeFile`, funciona em SSH e registra a escrita própria para o watcher ignorar o eco.

### Alteração externa

1. Quando o `content` muda por fora e não há rascunho pendente, o viewer recarrega a cena com `updateScene`, sem remontar o componente.
   A recarga aplica os elementos, os arquivos e as configurações de cena gravadas no arquivo: `viewBackgroundColor`, `gridSize`, `gridStep` e `gridModeEnabled`.
   Depois da recarga, o viewer chama `api.history.clear()`, para que desfazer não volte à cena substituída.
2. O viewer compara o texto recebido com o último texto que ele mesmo produziu, para não recarregar a cena por causa do próprio rascunho.
3. Com rascunho pendente, vale o `ExternalFileChangeBanner` que o editor já mostra.

### Erros

1. Com JSON inválido, o viewer mostra a mensagem de erro e um botão que troca para o modo `source`.
2. Enquanto o arquivo estiver inválido, o viewer não monta o Excalidraw e nunca grava nada, então o arquivo não é sobrescrito.
3. Uma cena que o `restore` rejeita, na abertura ou numa alteração externa, mostra a mesma tela de erro.
4. Falha no carregamento tardio do pacote cai no tratamento que o `lazyWithRetry` já oferece.

### Biblioteca global

1. A biblioteca fica em `excalidraw-library.json`, dentro de `app.getPath('userData')`.
   Perfis separados do Orca (`--user-data-dir`) têm bibliotecas separadas.
2. O main expõe dois canais IPC, um para ler e outro para gravar a lista de itens.
   A gravação usa `writeFileAtomically`, o helper que o main já usa para arquivos de configuração.
3. Arquivo ausente ou corrompido vira biblioteca vazia, e o arquivo corrompido não é apagado até a próxima gravação válida.
   Qualquer outro erro de leitura, como falta de permissão, faz o store lançar a exceção, e o canal IPC de leitura rejeita.
4. O viewer carrega a biblioteca na abertura pelo cliente `excalidraw-library-client.ts` e passa os itens em `initialData.libraryItems`.
   O cliente guarda a versão mais recente conhecida na sessão, que pode estar à frente do disco enquanto uma gravação espera o debounce.
   O `onLibraryChange` grava a lista nova com debounce de 500 ms, compartilhado entre os viewers.
   O eco da biblioteca carregada, que o Excalidraw emite ao abrir um desenho, é ignorado e não cancela uma gravação pendente.
   A gravação pendente é descarregada quando um viewer desmonta.
5. Uma lista vazia só é gravada se a biblioteca já teve itens nesta sessão.
6. Se a leitura rejeita, devolve algo que não é lista, ou devolve itens que falham na validação, o cliente marca a biblioteca como indisponível na sessão.
   Enquanto ela estiver indisponível, nenhuma gravação é feita, e o cliente registra um único aviso no console.
   O resultado vazio da falha não é guardado como versão conhecida, então a próxima abertura tenta ler de novo, e uma leitura bem-sucedida libera as gravações.
   Isso também cobre o cliente web, que não tem o canal da biblioteca.
7. A biblioteca é sempre local à máquina que roda o Orca, mesmo quando o desenho está num host SSH.

### Novo desenho

1. Os menus do explorador que hoje oferecem "New File" ganham o item "New Excalidraw Drawing".
   São o `FileExplorerBackgroundMenu.tsx` e o `file-explorer-row-context-menu.tsx`.
2. O item reutiliza o input inline de `useFileExplorerInlineInput.ts`, com um tipo novo de entrada.
3. Se o nome digitado não terminar em `.excalidraw` ou `.excalidraw.json`, o sufixo `.excalidraw` é acrescentado.
4. O arquivo é criado vazio por `createRuntimePath`, com o mesmo desfazer e refazer do "New File", e abre no modo Visual.
   O conteúdo só passa a ser JSON válido no primeiro salvamento, porque arquivo vazio já abre como cena em branco.

## Compatibilidade

1. Folder workspaces e worktrees seguem o mesmo caminho, porque leitura, gravação e criação passam pelo `runtime-file-client`.
2. Arquivos em SSH são lidos e gravados no host remoto pela fila atual, e só a biblioteca fica local.
3. O pacote roda no renderer e não depende de plataforma, então macOS, Linux e Windows se comportam igual.
4. Nada muda no que cliente e host trocam pela rede, então não há impacto em compatibilidade de versões remotas.

## Testes

1. Unitários de `language-detect` para `.excalidraw`, `.excalidraw.json` e `.json` comum.
2. Unitários de `excalidraw-file-parse` para arquivo vazio, BOM, JSON inválido, `type` errado e `elements` que não é lista.
3. Unitário da regra de nome do novo desenho, com e sem sufixo.
4. Unitário do armazenamento da biblioteca no main, cobrindo arquivo ausente, corrompido, ilegível e gravação, e unitário do cliente cobrindo cache, eco, flush e biblioteca indisponível.
5. Teste de componente do `ExcalidrawViewer` com o pacote simulado, cobrindo rascunho com debounce, filtro de mudanças só de visualização, flush no Ctrl+S, recarga por alteração externa e erro de JSON.
6. Validação visual com o app em background (`ORCA_BACKGROUND_LAUNCH=1`) e screenshot por CDP, abrindo, desenhando, salvando e reabrindo um arquivo.
7. Verificação final com `pnpm tc`, os testes alterados e `pnpm run check:code-quality:changed`.

## Critérios de aceite

1. Abrir um `.excalidraw` mostra o desenho no modo Visual.
2. Desenhar marca a aba como alterada, e Ctrl+S grava um JSON que a extensão do VS Code abre sem perda.
3. O seletor troca entre o desenho e o JSON, e uma edição no JSON aparece no desenho.
4. Trocar o tema do Orca troca o tema do Excalidraw.
5. Um item salvo na biblioteca aparece ao abrir outro desenho, inclusive depois de reiniciar o Orca.
6. "New Excalidraw Drawing" cria `nome.excalidraw` e abre uma cena em branco pronta para desenhar.
7. Um arquivo com JSON inválido mostra erro e não é sobrescrito.
8. O mesmo fluxo funciona com um arquivo num workspace SSH.
