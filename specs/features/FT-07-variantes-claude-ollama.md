# FT-07: Variantes do Claude para modelos do Ollama

Épico: [EP-04](../epics/EP-04-variantes-claude-ollama.md).
Design: [specs/orca-claude-ollama-variants-design.md](../orca-claude-ollama-variants-design.md).

## Descrição

O usuário cadastra variantes do Claude em Settings, Agents, cada uma com nome, modelo do Ollama e marca de 1M de contexto.
Cada variante aparece como entrada própria no menu da barra de abas e no compositor de novo workspace.
Ao ser escolhida, a variante abre o Claude Code no terminal com as variáveis de ambiente do Ollama, e o resto do Orca a trata como o Claude.

## Stories

- [ST-23: Cadastrar modelos do Ollama em Settings](../stories/ST-23-cadastrar-variantes-ollama.md).
- [ST-24: Escolher uma variante na lista de agentes](../stories/ST-24-escolher-variante-na-lista.md).
- [ST-25: Lançar a variante com o ambiente do Ollama](../stories/ST-25-lancar-variante-com-ambiente-ollama.md).
- [ST-26: Identificar e retomar a sessão de uma variante](../stories/ST-26-identificar-e-retomar-variante.md).
