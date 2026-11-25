# Regras do Estúdio

Origem: texto do post (Fernando Nogueira, LinkedIn) e o print do slide da atividade.

| # | Regra | Entrada → saída | Origem |
|---|---|---|---|
| R1 | Time padrão: Maestro (coordenador, Gemini), Pixel (front-end, Gemini), Chevron (back-end, Gemini), Scout (pesquisa, Gemini), Revisor (revisão, Gemini). Todos os agentes utilizam Gemini. | — | post |
| R2 | Texto é comparado sem acento e sem caixa. | `"Página"` → `"pagina"` | — |
| R2b | Palavra-chave casa com a palavra inteira (ou plural); chaves de 5+ letras são radicais e casam com o começo da palavra. `cor` casa com "cores", não com "corrija". | pedido, chave → `true/false` | bug achado nos testes |
| R3 | Proposta: 10% + 30% por palavra do papel no pedido (máx. 95%); aceita com ≥ 40%. O coordenador sempre passa ("Coordeno, mas não sou eu quem executa isso"). | pedido → `{confianca, aceita, fala}` | print |
| R4 | Rodada de propostas: todos respondem, da maior para a menor confiança. | pedido → lista ordenada | post + print |
| R5 | Maestro monta o time em etapas: pesquisa → execução (paralela) → revisão. Revisor entra sempre que alguém executou. Se ninguém aceitar, o de maior confiança assume. | propostas → `etapas` | post |
| R6 | Fala do Maestro: "Fica com Chevron e Pixel. Revisor, acompanha no final." | etapas → texto | print |
| R7 | Comandos sensíveis pedem aprovação na tela. | comando → `true/false` | post |
| R8 | Comandos sugeridos são lidos dos blocos ```bash da resposta. | texto → `[{comando, sensivel}]` | — |
| R9 | Cada agente recebe papel, personalidade, pedido, o que as etapas anteriores entregaram e como lidar com arquivos (CLI ou API). | → prompt | post |
| R10 | Estados: disponível, pensando, trabalhando, concluído; topo mostra "N de M trabalhando". | | print |
| R11 | Criar agente pelo painel (nome único, papel obrigatório, provedor/visual/cor); o coordenador não pode ser removido. | | post |
| R12 | Conversas separadas; o título é a primeira pergunta (até 60 caracteres). | | post |
| R13 | Só quem executa (não coordenador, pesquisa ou revisão) escreve na pasta do projeto. | agente → `true/false` | post |
| R14 | No fim da rodada, lista os arquivos alterados desde o início, ignorando `node_modules`, `.git`, `dist`… | arquivos → caminhos | post |
| R15 | Lê o `.env`: ignora comentários e chaves vazias, aceita aspas e `export`. | texto → objeto | — |
| R16 | (modo gratuito desligado) Chave no `.env` → API; sem chave e com CLI → CLI; nenhum → sem acesso. | provedor → `api/cli/null` | pedido do time |
| R17 | Pela API, blocos ```` ```arquivo:caminho ```` viram arquivos; caminho absoluto ou com `..` é recusado. | texto → arquivos | — |
| R18 | `MODO_GRATUITO=true` (ou sim, 1, on) no `.env` manda **todos** os agentes para o Gemini grátis com a `GEMINI_API_KEY`; chaves pagas e CLIs são ignoradas. Sem a chave do Gemini, nenhum agente roda. | `.env` → `gratis/null` | pedido do time |
