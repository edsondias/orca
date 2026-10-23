# ADR-0004: atualização sistemática do fork a cada versão do upstream

- Status: aceito
- Data: 23/10/2026

## Contexto

O fork `edsondias/orca` acumula mudanças próprias em branches separadas: a `main` (Excalidraw e "Open in VS Code") e o modo carro (`test/android-auto-rebase`, ainda em teste).
A cada versão nova do `stablyai/orca`, era preciso refazer à mão o fetch, o merge, a troca para o Node 24 e os builds do Windows e do Android.
Em 23/10/2026 a `main` local estava 3.703 commits atrás do upstream.

O upstream publica versões com tag `vX.Y.Z`, e cada tag é a `main` deles mais um commit que só troca a versão no `package.json`.
A `main` do upstream mantém a versão fixa em `1.4.214`.

## Decisão

1. Uma branch própria, `fork/release`, numa worktree separada (`E:\github\orca-release`), recebe os merges e gera os builds.
   As branches de feature não são alteradas pelo processo.
2. A base é a última versão lançada ("Latest" no GitHub), não a ponta da `main` do upstream, que muda várias vezes por dia.
3. O merge usa o pai da tag, e não a tag, para evitar o conflito da linha `version` do `package.json` a cada release.
4. As fontes entram por merge, nunca por rebase, na ordem upstream, `main` e modo carro, e o `rerere` grava as resoluções de conflito.
5. A versão do build é `X.Y.900-fork.Z`, gravada só durante o build, para o auto-update não trocar o fork pelo oficial.
6. O script `fork-release/update-fork.ps1` é idempotente: rodá-lo de novo depois de um conflito resolvido continua de onde parou.

## Consequências

- O histórico da `fork/release` acumula commits de merge, o que é esperado e preserva cada resolução de conflito.
- Uma feature nova precisa ser acrescentada ao parâmetro `-Branches` (ou ao seu valor padrão no script).
- O draw.io fica de fora até ser aprovado e implementado.
- Quando o upstream mudar o número da versão menor, o auto-update voltará a oferecer o oficial até a próxima execução do script.

## Alternativas descartadas

- Merge direto na `main`: mistura o modo carro, ainda em teste, com o resto, e impede testar cada feature separadamente.
- Rebase das features sobre o upstream: reescreve o histórico e obriga a resolver os mesmos conflitos a cada versão.
- Seguir a ponta da `main` do upstream: código não lançado e possivelmente instável.
