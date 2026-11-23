# ADR-0004: Modelos do Ollama como variantes do agente Claude, lançadas por variáveis de ambiente

Data: 22/11/2026.
Status: aceito, implementado em 23/11/2026, validação manual pendente (SSH e Claude real).
Design completo: [specs/orca-claude-ollama-variants-design.md](../../specs/orca-claude-ollama-variants-design.md).

## Contexto

O usuário usa o Claude Code com modelos servidos pelo Ollama e quer cada modelo como entrada própria na lista de agentes do Orca, ao lado do Claude normal.
A lista de agentes do Orca é um tipo fechado, e cada identificador novo exige mudança em cerca de 29 arquivos.
O Orca permite um único comando por agente, então hoje só dá para apontar o Claude para um modelo por vez, e isso tira o Claude normal da lista.
O repositório é um fork que recebe merges frequentes do upstream.

## Decisão

1. Cada modelo do Ollama é uma variante do agente `claude`, cadastrada pelo usuário em Settings, Agents, com nome, modelo e marca de 1M de contexto.
2. A variante não entra no tipo `TuiAgent`. Para status, hooks, título, telemetria e retomada, ela é o Claude.
3. O lançamento usa o comando `claude` com variáveis de ambiente (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY` vazio, `ANTHROPIC_MODEL` e os três modelos padrão), aplicadas só ao processo lançado.
4. A variante sempre abre no terminal, e não no chat nativo estruturado.
5. Uma variante que não pode ser resolvida falha com aviso. Ela nunca cai no Claude da Anthropic.
6. As variantes aparecem no menu da barra de abas e no compositor de novo workspace.
7. O cadastro é manual, sem leitura do `ollama list`.

## Alternativas consideradas

| Alternativa                                    | Por que não                                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Agente fixo "Claude (Ollama)" no catálogo      | Toca cerca de 29 arquivos centrais, conflita com o upstream a cada merge e entrega uma entrada só, não uma por modelo.           |
| Agentes livres definidos pelo usuário          | Exige abrir o tipo fechado de agentes em todo o código, e o Orca não saberia ler o status de um agente desconhecido.             |
| Quick Commands do terminal                     | Já existem, mas digitam o comando num terminal aberto e não aparecem na lista de agentes.                                        |
| Lançar com `ollama launch claude --model X --` | Exige o `--` para repassar argumentos e conflita com o seletor de modelo e esforço do Orca. O usuário preferiu as variáveis.     |
| Descoberta automática pelo `ollama list`       | Polui a lista com modelos que não servem para código e pode não enxergar modelos `:cloud`. O usuário preferiu o cadastro manual. |

## Consequências

1. O Orca não repete as verificações do `ollama launch`. Servidor parado ou modelo inexistente só aparecem como erro na primeira mensagem.
2. O endereço do Ollama é fixo em `http://localhost:11434`. Em worktree remoto por SSH, o Ollama precisa rodar no host remoto.
3. A marca de 1M só informa o Claude Code. Com um modelo de janela menor, a requisição pode falhar por excesso de contexto.
4. Variantes não existem em automações, orquestração, ações de IA do controle de versão, aplicativo móvel nem como agente padrão.
5. A mudança toca poucos arquivos centrais, o que mantém os merges do upstream baratos.
6. A aba de uma variante guarda uma marca persistida com o id e o nome. Retomada, fork e continuação seguem na mesma variante, e falham com aviso quando ela não pode ser resolvida.
7. A retomada pelo AI Vault abre a sessão no Claude normal, porque o histórico do Claude Code não registra o uso do Ollama.
8. Variantes não aparecem em workspace servido por um host pareado.
9. A variante não recebe o `--model` do seletor de modelo do Orca.
10. O caminho de criação completa do compositor não aceita variantes, porque nenhuma tela chega a ele.
