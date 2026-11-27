#Requires -Version 7.0
<#
.SYNOPSIS
Atualiza a branch fork/release com a última versão lançada do stablyai/orca,
junta as branches locais e compila o app do Windows (win-unpacked) e o APK do Android.

.DESCRIPTION
Rode sempre a partir da worktree da branch fork/release. Se um merge parar em
conflito, resolva os arquivos listados, faça `git add` e rode o script de novo:
ele conclui o merge pendente e segue dali. Veja fork-release/README.md.
#>
[CmdletBinding()]
param(
  # Tag do upstream; o padrão é a versão marcada como "Latest" no GitHub.
  [string]$Tag,
  [string[]]$Branches = @('main', 'test/android-auto-rebase', 'fix/markdown-root-relative-images', 'feat/claude-ollama-variants-1.4.267'),
  [switch]$SkipDesktop,
  [switch]$SkipMobile,
  # Compila mesmo quando nada novo entrou desde o último build.
  [switch]$Force,
  # Rótulo da versão: X.Y.900-<Channel>.Z.
  [string]$Channel = 'fork',
  # Gera em dist/win-unpacked em vez de dist/<versão>/win-unpacked.
  [switch]$FixedOutput,
  # Envia a fork/release para o origin depois dos merges.
  [switch]$Push
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$ReleaseBranch = 'fork/release'
$UpstreamRepo = 'stablyai/orca'
$Lockfiles = @('pnpm-lock.yaml', 'mobile/pnpm-lock.yaml')
$ManifestPath = Join-Path $Root 'dist/fork-release.json'

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }

function Invoke-Checked {
  param([string]$File, [string[]]$Arguments, [string]$Cwd = $Root)
  Push-Location $Cwd
  try {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File $($Arguments -join ' ') saiu com código $LASTEXITCODE" }
  } finally { Pop-Location }
}

function Get-Git([string[]]$Arguments) {
  $out = & git -C $Root @Arguments
  if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') saiu com código $LASTEXITCODE" }
  return $out
}

function Test-Git([string[]]$Arguments) {
  & git -C $Root @Arguments *> $null
  return $LASTEXITCODE -eq 0
}

function Get-UnmergedFiles { @(Get-Git @('diff', '--name-only', '--diff-filter=U')) | Where-Object { $_ } }

function Stop-OnConflict([string]$Label) {
  $files = Get-UnmergedFiles
  Write-Host "`nConflito ao juntar $Label. Arquivos pendentes:" -ForegroundColor Yellow
  $files | ForEach-Object { Write-Host "  $_" }
  Write-Host "`nResolva, rode 'git add <arquivo>' em $Root e execute o script de novo." -ForegroundColor Yellow
  Write-Host "Para desistir deste merge: git -C `"$Root`" merge --abort"
  exit 1
}

function Use-Node24 {
  if ((& node --version) -like 'v24.*') { return }
  # Why: o perfil do PowerShell só troca de Node ao entrar na pasta; sessões sem ele ficam no Node 26.
  if (-not (Get-Command fnm -ErrorAction SilentlyContinue)) { throw 'Node 24 não está ativo e o fnm não foi encontrado.' }
  & fnm env --shell powershell | Out-String | Invoke-Expression
  & fnm use 24 | Out-Null
  if ((& node --version) -notlike 'v24.*') { throw "Node 24 obrigatório (node-gyp quebra no 26); ativo: $(node --version)" }
}

function Use-Jdk17 {
  # Why: a JVM avisa no stderr que leu JDK_JAVA_OPTIONS e o configure do CMake no Gradle trata o aviso como falha;
  # com TieredStopAtLevel=1 o code cache ainda cai para 48 MB e o build estoura com "Out of space in CodeCache".
  Remove-Item Env:JDK_JAVA_OPTIONS -ErrorAction SilentlyContinue
  if ($env:JAVA_HOME -and (Split-Path -Leaf $env:JAVA_HOME.TrimEnd('\')) -like 'jdk-17*') { return }
  $jdk = Get-ChildItem 'C:\Program Files\Eclipse Adoptium', 'C:\Program Files\Microsoft' -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1
  if (-not $jdk) { throw "JDK 17 não encontrado; o Gradle do React Native não roda no JDK ativo ($env:JAVA_HOME)." }
  $env:JAVA_HOME = $jdk.FullName
  $env:Path = "$($jdk.FullName)\bin;$env:Path"
}

function Use-VsWhere {
  if (Get-Command vswhere -ErrorAction SilentlyContinue) { return }
  # Why: sem o vswhere no PATH o VsDevCmd reporta VSCMD_VER=17.0, que o build nativo do upstream recusa e fica sem cl.exe.
  $installer = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer'
  if (-not (Test-Path (Join-Path $installer 'vswhere.exe'))) { throw 'vswhere.exe não encontrado; instale o Visual Studio Build Tools com o workload de C++.' }
  $env:Path = "$installer;$env:Path"
}

function Get-ForkVersion([string]$UpstreamTag, [string]$Label) {
  if ($UpstreamTag -notmatch '^v?(\d+)\.(\d+)\.(\d+)$') { throw "Tag fora do formato vX.Y.Z: $UpstreamTag" }
  # Why: patch 900 fica acima de qualquer 1.4.x oficial, então o auto-update não troca este build pelo oficial.
  return "$($Matches[1]).$($Matches[2]).900-$Label.$($Matches[3])"
}

function Set-PackageVersion([string]$Version) {
  $path = Join-Path $Root 'package.json'
  $text = [IO.File]::ReadAllText($path)
  $stamped = [regex]::new('"version":\s*"[^"]*"').Replace($text, "`"version`": `"$Version`"", 1)
  [IO.File]::WriteAllText($path, $stamped, [Text.UTF8Encoding]::new($false))
}

# Why: o upstream corta cada versão de uma branch de release própria, então o ancestral comum que o
# Git calcula fica antes da versão já incorporada e reabre os cherry-picks e reverts dela.
function Get-PreviousUpstreamBase {
  if (-not (Test-Path $ManifestPath)) { return $null }
  $previousTag = (Get-Content $ManifestPath -Raw | ConvertFrom-Json).upstreamTag
  if (-not $previousTag -or $previousTag -eq $Tag) { return $null }
  Invoke-Checked git @('fetch', '--no-tags', 'upstream', "+refs/tags/${previousTag}:refs/tags/${previousTag}")
  $base = Get-Git @('rev-parse', "$previousTag^{commit}^")
  if (-not (Test-Git @('merge-base', '--is-ancestor', $base, 'HEAD'))) { return $null }
  Write-Host "Base do merge: $previousTag (versão anterior do upstream)."
  return $base
}

# Merge com base escolhida; deixa MERGE_HEAD e MERGE_MSG para o commit, como um git merge faria.
function Invoke-MergeOnBase([string]$Base, [string]$Ref, [string]$Message) {
  & git -C $Root merge-recursive $Base -- HEAD $Ref
  $exitCode = $LASTEXITCODE
  $gitDir = Get-Git @('rev-parse', '--absolute-git-dir')
  [IO.File]::WriteAllText((Join-Path $gitDir 'MERGE_HEAD'), "$(Get-Git @('rev-parse', $Ref))`n")
  [IO.File]::WriteAllText((Join-Path $gitDir 'MERGE_MSG'), "$Message`n")
  if ($exitCode -eq 0) {
    & git -C $Root commit --no-edit
    $exitCode = $LASTEXITCODE
  } else {
    & git -C $Root rerere | Out-Host
  }
  $global:LASTEXITCODE = $exitCode
}

function Format-Now { (Get-Date).ToUniversalTime().AddHours(-3).ToString('dd/MM/yyyy HH:mm') }

New-Item -ItemType Directory -Force (Join-Path $Root 'tmp') | Out-Null
$log = Join-Path $Root "tmp/fork-release-$(Get-Date -Format 'yyyyMMdd-HHmm').log"
Start-Transcript -Path $log | Out-Null
try {
  Write-Step 'Conferindo o ambiente'
  $current = Get-Git @('branch', '--show-current')
  if ($current -ne $ReleaseBranch) { throw "A worktree $Root está em '$current'; o script só roda na $ReleaseBranch." }
  Remove-Item Env:CI -ErrorAction SilentlyContinue  # com CI=1 o electron-builder tenta publicar
  Use-Node24
  if (-not $SkipDesktop) { Use-VsWhere }
  if (-not $SkipMobile) {
    Use-Jdk17
    if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) { throw 'ANDROID_HOME não está definido.' }
  }
  Write-Host "node $(node --version), pnpm $(pnpm --version)$(if (-not $SkipMobile) { ", JAVA_HOME=$env:JAVA_HOME" })"

  Write-Step 'Descobrindo a versão do upstream'
  if (-not $Tag) { $Tag = (& gh release view -R $UpstreamRepo --json tagName -q .tagName) }
  if (-not $Tag) { throw "Não consegui ler a última versão de $UpstreamRepo pelo gh." }
  Invoke-Checked git @('fetch', '--no-tags', 'upstream', "+refs/tags/${Tag}:refs/tags/${Tag}")
  # Why: o último commit da tag só troca a versão; juntar o pai evita conflito na linha "version" a cada release.
  $upstreamBase = Get-Git @('rev-parse', "$Tag^{commit}^")
  $version = Get-ForkVersion $Tag $Channel
  Write-Host "Upstream $Tag (base $($upstreamBase.Substring(0, 10))), versão do fork $version"

  Write-Step 'Juntando upstream e branches locais'
  # O hook de pre-commit (lint-staged) roda no commit de um merge resolvido e precisa do node_modules.
  if (-not (Test-Path (Join-Path $Root 'node_modules'))) { Invoke-Checked pnpm @('install') }
  if (Test-Git @('rev-parse', '-q', '--verify', 'MERGE_HEAD')) {
    if (Get-UnmergedFiles) { Stop-OnConflict 'o merge pendente' }
    Invoke-Checked git @('commit', '--no-edit')
    Write-Host 'Merge pendente concluído.'
  }
  # Lockfiles ficam de fora: o pnpm install abaixo os regenera e commita.
  $dirty = @(Get-Git @('status', '--porcelain', '--untracked-files=no') | Where-Object { $_ -and $_.Substring(3) -notin $Lockfiles })
  if ($dirty) {
    throw "Há mudanças não commitadas em $Root; faça commit ou descarte antes de rodar."
  }

  $sources = @([pscustomobject]@{ Ref = $upstreamBase; Label = "upstream $Tag"; IsUpstream = $true }) +
    @($Branches | ForEach-Object { [pscustomobject]@{ Ref = $_; Label = $_; IsUpstream = $false } })
  $merged = $false
  foreach ($source in $sources) {
    if (Test-Git @('merge-base', '--is-ancestor', $source.Ref, 'HEAD')) {
      Write-Host "$($source.Label): já incluída."
      continue
    }
    Write-Host "$($source.Label): juntando..."
    $previousBase = if ($source.IsUpstream) { Get-PreviousUpstreamBase }
    if ($previousBase) {
      Invoke-MergeOnBase $previousBase $source.Ref "merge: $($source.Label) into $ReleaseBranch"
    } else {
      & git -C $Root merge --no-ff --no-edit -m "merge: $($source.Label) into $ReleaseBranch" $source.Ref
    }
    if ($LASTEXITCODE -ne 0) {
      # Lockfiles saem do lado que já tem o upstream mais novo; o pnpm install abaixo os regenera.
      $side = if ($source.IsUpstream) { '--theirs' } else { '--ours' }
      foreach ($lockfile in @(Get-UnmergedFiles | Where-Object { $_ -in $Lockfiles })) {
        Invoke-Checked git @('checkout', $side, '--', $lockfile)
        Invoke-Checked git @('add', '--', $lockfile)
      }
      if (Get-UnmergedFiles) { Stop-OnConflict $source.Label }
      Invoke-Checked git @('commit', '--no-edit')
    }
    $merged = $true
  }

  $head = Get-Git @('rev-parse', 'HEAD')
  if (-not $merged -and -not $Force -and (Test-Path $ManifestPath)) {
    $last = Get-Content $ManifestPath -Raw | ConvertFrom-Json
    if ($last.commit -eq $head) {
      Write-Host "`nNada novo: o build de $($last.builtAt) já é deste commit ($Tag). Use -Force para compilar de novo." -ForegroundColor Green
      exit 0
    }
  }

  Write-Step 'Instalando dependências'
  Invoke-Checked pnpm @('install')
  if (-not $SkipMobile) {
    # Why: o layout isolado do pnpm passa de 260 caracteres nos caminhos do CMake/ninja do Android.
    Invoke-Checked pnpm @('install', '--config.node-linker=hoisted') (Join-Path $Root 'mobile')
  }
  if (Get-Git (@('status', '--porcelain', '--') + $Lockfiles)) {
    Invoke-Checked git (@('add', '--') + $Lockfiles)
    Invoke-Checked git @('commit', '-m', "chore(fork): refresh lockfiles for $Tag")
    $head = Get-Git @('rev-parse', 'HEAD')
  }

  if ($Push) {
    Write-Step "Enviando $ReleaseBranch para o origin"
    Invoke-Checked git @('push', 'origin', $ReleaseBranch)
  }

  $artifacts = [ordered]@{}
  if (-not $SkipDesktop) {
    Write-Step "Compilando o desktop $version (typecheck incluso)"
    $outDir = if ($FixedOutput) { 'dist' } else { "dist/$version" }
    $exe = Join-Path $Root "$outDir/win-unpacked/Orca.exe"
    if ($FixedOutput -and (Get-Process -Name Orca -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe })) {
      throw "Feche o $exe antes de compilar; ele trava a pasta win-unpacked."
    }
    Set-PackageVersion $version
    try {
      Invoke-Checked pnpm @('run', 'build:desktop')
      Invoke-Checked pnpm @('run', 'ensure:electron-runtime')
      # --dir gera só o win-unpacked: o build roda direto do Orca.exe, sem instalador.
      # Uma pasta por versão, porque o Orca.exe da versão anterior costuma estar aberto e trava a pasta dele.
      Invoke-Checked pnpm @('exec', 'electron-builder', '--config', 'config/electron-builder.config.cjs', "--config.directories.output=$outDir", '--win', '--dir', '--publish', 'never')
    } finally {
      Invoke-Checked git @('checkout', '--', 'package.json')
    }
    $artifacts.desktop = "$outDir/win-unpacked/Orca.exe"
  }

  if (-not $SkipMobile) {
    Write-Step 'Compilando o APK de release do Android'
    $mobile = Join-Path $Root 'mobile'
    $env:EXPO_NO_GIT_STATUS = '1'  # sem isso o prebuild --clean pede confirmação
    # --clean regenera mobile/android (ignorado pelo git) para os config plugins novos valerem.
    Invoke-Checked pnpm @('exec', 'expo', 'prebuild', '--platform', 'android', '--clean', '--no-install') $mobile
    Invoke-Checked (Join-Path $mobile 'android/gradlew.bat') @('assembleRelease') (Join-Path $mobile 'android')
    $apk = "dist/orca-mobile-$version.apk"
    New-Item -ItemType Directory -Force (Join-Path $Root 'dist') | Out-Null
    Copy-Item (Join-Path $mobile 'android/app/build/outputs/apk/release/app-release.apk') (Join-Path $Root $apk) -Force
    $artifacts.apk = $apk
  }

  Write-Step 'Registrando o build'
  $manifest = [ordered]@{
    upstreamTag = $Tag
    version     = $version
    commit      = $head
    builtAt     = Format-Now
    branches    = [ordered]@{}
    artifacts   = $artifacts
    log         = $log
  }
  foreach ($branch in $Branches) { $manifest.branches[$branch] = Get-Git @('rev-parse', '--short', $branch) }
  New-Item -ItemType Directory -Force (Split-Path $ManifestPath) | Out-Null
  $manifest | ConvertTo-Json -Depth 4 | Set-Content $ManifestPath -Encoding utf8NoBOM
  Write-Host "`nPronto: $version sobre $Tag." -ForegroundColor Green
  $artifacts.GetEnumerator() | ForEach-Object { Write-Host "  $($_.Key): $(Join-Path $Root $_.Value)" }
} catch {
  Write-Host "`nFalhou: $_" -ForegroundColor Red
  exit 2
} finally {
  Stop-Transcript | Out-Null
}
