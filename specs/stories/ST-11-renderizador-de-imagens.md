# ST-11: `CarImageRenderer`

Feature: [FT-02](../features/FT-02-painel-visual.md).
Camada: mobile, Kotlin.

## História

Como usuário no carro, quero entender o estado da frota num olhar, pela cor e pela forma de cada agente.

## Escopo

Desenhar com `Canvas` o cartão com anel e ícone do agente, a rosca do placar e as faixas da linha do tempo.
Usar as cores de `mobile/src/components/AgentSpinner.tsx` e uma forma por estado.
Criar as paletas de dia e de noite, escolhidas por `CarContext.isDarkMode`.
Desenhar no tamanho informado pelo host, em densidade 2x.
Guardar os bitmaps em cache por estado, agente, faixa de minuto e tema.

## Critérios de aceite

- [ ] Os testes JUnit verificam o tamanho dos bitmaps nos dois temas.
- [ ] Os testes verificam contraste de pelo menos 4,5:1 para o texto dentro das imagens.
- [ ] Nenhum estado depende só da cor para ser identificado.
