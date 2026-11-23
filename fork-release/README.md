# Atualização do fork

Este processo leva cada nova versão lançada do `stablyai/orca` para o fork, junta as mudanças locais e compila o app do Windows (sem instalador) e o APK do Android.
A decisão está registrada em `docs/adr/0004-atualizacao-do-fork.md`.

## Onde roda

A branch `fork/release` fica na worktree `E:\github\orca-release`, separada das worktrees de desenvolvimento.
Ela só recebe merges e os commits deste processo, nunca desenvolvimento direto.
As features continuam nas suas próprias branches: `main` (Excalidraw e "Open in VS Code"), `test/android-auto-rebase` (modo carro) e `fix/markdown-root-relative-images` (imagens com caminho `/...` no preview de Markdown, base para um PR ao upstream) e `feat/claude-ollama-variants-1.4.267` (modelos do Ollama como variantes do Claude, portada sobre a base upstream 1.4.267).

## Como usar

Num terminal PowerShell 7:

```powershell
pwsh E:\github\orca-release\fork-release\update-fork.ps1
```

O script faz, em ordem:

1. Confere o ambiente: Node 24 (troca pelo fnm se preciso), remove `CI`, procura o JDK 17 e confere `ANDROID_HOME`.
2. Lê a última versão marcada como "Latest" no GitHub do upstream e busca só essa tag.
3. Faz o merge do pai da tag, depois da `main`, do modo carro e da correção de imagens, pulando o que já estiver incluído.
   O merge do upstream usa como base a versão anterior gravada em `dist/fork-release.json`, e não o ancestral comum calculado pelo Git.
   O upstream corta cada versão de uma branch de release própria, com cherry-picks e reverts que não voltam para a `main` deles.
   Com o ancestral comum, esses commits reabrem a cada versão (na `v1.4.245` foram 101 conflitos). Com a versão anterior como base, só conflitam os arquivos que o fork alterou.
4. Roda `pnpm install` na raiz e em `mobile/` (com o layout hoisted) e faz commit dos lockfiles, se mudarem.
5. Compila o desktop com `build:desktop` (que inclui o typecheck) e empacota com `electron-builder --dir`, que gera só a pasta `win-unpacked`, sem instalador e sem publicar.
6. Regenera `mobile/android` com `expo prebuild --clean` e roda `gradlew assembleRelease`.
7. Grava `dist/fork-release.json` com a tag, a versão, o commit e os arquivos gerados.

Quando não há versão nova nem commit novo nas branches, o script avisa e para.
Para compilar de novo assim mesmo, use `-Force`.

Outras opções:

- `-Tag v1.4.238` usa uma versão específica em vez da "Latest".
- `-Branches main,feat/android-auto-spec` troca as branches que entram.
- `-SkipDesktop` ou `-SkipMobile` compila só uma das plataformas.
- `-Channel dev` troca o rótulo da versão para `X.Y.900-dev.Z` (o padrão é `fork`).
- `-FixedOutput` gera sempre em `dist/win-unpacked`, sobrescrevendo o build anterior; feche esse `Orca.exe` antes.
- `-Push` envia a `fork/release` para o `origin` depois dos merges.
- O comando `/atualizar-fork` do Claude Code roda o script com `-Channel dev -FixedOutput -Push`.

## Quando um merge para em conflito

O script lista os arquivos e sai com código 1.
Resolva os arquivos em `E:\github\orca-release`, rode `git add` neles e execute o script de novo.
Ele conclui o merge pendente e segue para o próximo passo.

O `rerere` do Git está ligado no repositório, então cada resolução fica gravada e o mesmo conflito se resolve sozinho na próxima vez.
Os lockfiles (`pnpm-lock.yaml` e `mobile/pnpm-lock.yaml`) são resolvidos automaticamente, mantendo o lado que já tem o upstream mais novo, e o `pnpm install` os regenera depois.

## Versão

O build sai como `1.4.900-fork.<patch do upstream>`, por exemplo `1.4.900-fork.237` para a `v1.4.237`.
O patch 900 fica acima de qualquer `1.4.x` oficial, então o auto-update do Orca não troca este build pelo oficial.
A versão só é gravada no `package.json` durante o build e volta ao valor original no fim, para não gerar conflito com o upstream.
Quando o upstream passar para `1.5.0`, o auto-update passa a oferecer o oficial, e o script gera `1.5.900-fork.0`.

## Arquivos gerados

- `dist/<versão>/win-unpacked/Orca.exe`: o app, para rodar direto sem instalar. Cada versão ganha a própria pasta, porque o Orca.exe aberto trava a pasta dele. Feche o Orca instalado antes, porque a trava de instância única repassa a abertura para ele.
- `dist/orca-mobile-<versão>.apk`: APK de release, assinado com a chave de debug e com o mesmo pacote do app oficial (`com.stably.orca.mobile`). Se o app da Play Store estiver instalado, desinstale-o antes.
- `tmp/fork-release-<data>.log`: o log completo da execução.

## Fora do escopo

- Push para o `origin`: o script nunca publica nada. Para guardar a branch no fork, rode `git push origin fork/release` à mão.
- iOS, que exige macOS com Xcode.
- Disparo automático quando sai versão nova: o script roda à mão.
