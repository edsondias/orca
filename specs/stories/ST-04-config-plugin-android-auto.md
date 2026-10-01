# ST-04: config plugin `with-android-auto`

Feature: [FT-01](../features/FT-01-notificacoes-no-carro.md).
Camada: mobile, build.

## História

Como desenvolvedor, quero que o `expo prebuild` gere o manifesto do Android Auto, para que o app seja reconhecido pelo carro sem editar a pasta `android/` à mão.

## Escopo

Criar `mobile/plugins/with-android-auto.js`, no padrão de `android-respect-rotation-lock.js`.
Adicionar a meta-data `com.google.android.gms.car.application` apontando para `@xml/automotive_app_desc`.
Gerar `res/xml/automotive_app_desc.xml` com `<uses name="notification"/>` na fase 1 e `<uses name="template"/>` a partir da fase 2.
Registrar os serviços do módulo e as permissões `FOREGROUND_SERVICE`, o tipo de serviço escolhido e `POST_NOTIFICATIONS`.
Registrar o plugin em `app.json`.

## Critérios de aceite

- [ ] Depois do `expo prebuild`, o `AndroidManifest.xml` contém a meta-data, os serviços e as permissões.
- [ ] O arquivo `automotive_app_desc.xml` existe com o conteúdo da fase.
- [ ] Rodar o prebuild duas vezes não duplica nenhuma entrada.
