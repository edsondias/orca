# EP-04: Modelos do Ollama como variantes do Claude

Data: 22/11/2026.
Branch: `feat/claude-ollama-variants`.
Status: implementado em 23/11/2026, validação manual pendente (SSH e Claude real).
Design: [specs/orca-claude-ollama-variants-design.md](../orca-claude-ollama-variants-design.md).
ADR: [docs/adr/0004-variantes-claude-ollama.md](../../docs/adr/0004-variantes-claude-ollama.md).

## Objetivo

Cadastrar modelos do Ollama no Orca e abrir cada um como entrada própria na lista de agentes, rodando o Claude Code contra o Ollama, sem tirar o Claude normal da lista.

## Features

- [FT-07: Variantes do Claude para modelos do Ollama](../features/FT-07-variantes-claude-ollama.md).
