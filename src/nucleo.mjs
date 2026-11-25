// Núcleo do Estúdio: todas as regras. Funções puras, sem DOM, Electron nem rede.

// ---------- R1: o time padrão ----------
// Cada agente tem papel, provedor (qual IA está por trás) e as palavras que o fazem
// querer pegar uma tarefa na rodada de propostas.
export const TIME_PADRAO = Object.freeze([
  {
    id: 'maestro', nome: 'Maestro', papel: 'Coordenador', provedor: 'gemini', forma: 'bloco', cor: '#e2795b',
    coordenador: true, palavras: [],
    personalidade: 'Calmo e direto. Divide o trabalho e não executa tarefas sozinho.',
  },
  {
    id: 'pixel', nome: 'Pixel', papel: 'Front-end', provedor: 'gemini', forma: 'bloco', cor: '#e7b866',
    palavras: ['tela', 'pagina', 'visual', 'css', 'html', 'botao', 'layout', 'interface', 'front', 'bonit',
      'componente', 'design', 'cor', 'formulario', 'acessivel', 'responsiv', 'dashboard'],
    personalidade: 'Detalhista com o visual e com acessibilidade. Fala com entusiasmo.',
  },
  {
    id: 'chevron', nome: 'Chevron', papel: 'Back-end', provedor: 'gemini', forma: 'bloco', cor: '#e88a5c',
    palavras: ['endpoint', 'api', 'rota', 'servidor', 'banco', 'health', 'back', 'backend', 'status', 'dados', 'sql',
      'autentica', 'json', 'login', 'cache', 'fila', 'webhook'],
    personalidade: 'Pragmático, um pouco ranzinza, obcecado por código que aguenta produção.',
  },
  {
    id: 'scout', nome: 'Scout', papel: 'Pesquisa', provedor: 'gemini', forma: 'estrela', cor: '#9a7cf0',
    palavras: ['pesquis', 'documentacao', 'referencia', 'compar', 'qual', 'quais', 'melhor', 'biblioteca', 'oficial',
      'como funciona', 'pesquisar', 'alternativa', 'padrao'],
    personalidade: 'Curioso. Sempre cita a fonte oficial.',
  },
  {
    id: 'revisor', nome: 'Revisor', papel: 'Revisão de código', provedor: 'gemini', forma: 'nuvem', cor: '#3f7bf2',
    palavras: ['revis', 'bug', 'teste', 'testa', 'review', 'erro', 'seguranca', 'corrig', 'corrij', 'falha', 'vulnerab'],
    personalidade: 'Cético e cuidadoso. Procura o bug que ninguém viu.',
  },
]);

export const PROVEDORES = Object.freeze(['gemini']);
export const FORMAS = Object.freeze(['bloco', 'estrela', 'nuvem']);
export const ESTADOS = Object.freeze(['disponivel', 'pensando', 'trabalhando', 'concluido']);

// ---------- R2: texto normalizado ----------
export function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ---------- R2b: palavra-chave casa com palavra inteira, não com pedaço ----------
// Chave com 5+ letras é radical e casa com o começo da palavra ("revis" → "revise", "revisão").
// Chave curta precisa da palavra inteira ou do plural ("cor" → "cor", "cores"; nunca "corrija").
// Chave com várias palavras ("como funciona") precisa delas em sequência.
export function palavrasDo(texto) {
  return normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean);
}

function casaPalavra(palavra, chave, ultima) {
  if (palavra === chave || palavra === chave + 's' || palavra === chave + 'es') return true;
  return ultima && chave.length >= 5 && palavra.startsWith(chave);
}

export function casaChave(palavras, chave) {
  const partes = palavrasDo(chave);
  if (!partes.length) return false;
  for (let i = 0; i + partes.length <= palavras.length; i++) {
    if (partes.every((c, j) => casaPalavra(palavras[i + j], c, j === partes.length - 1))) return true;
  }
  return false;
}

// ---------- R3: proposta de um agente ----------
// Confiança: 10% de base + 30% por palavra do papel encontrada no pedido (máx. 95%).
// Aceita a partir de 40%. O coordenador nunca executa: só monta o time.
export const LIMIAR_ACEITE = 40;

export function proporAgente(agente, pedido) {
  const texto = normalizar(pedido);
  if (agente.coordenador) {
    return { id: agente.id, confianca: 15, aceita: false, fala: 'Coordeno, mas não sou eu quem executa isso.' };
  }
  const palavras = palavrasDo(texto);
  const acertos = agente.palavras.filter((p) => casaChave(palavras, p));
  const confianca = Math.min(95, 10 + acertos.length * 30);
  const aceita = confianca >= LIMIAR_ACEITE;
  return { id: agente.id, confianca, aceita, acertos, fala: falaDaProposta(agente, aceita) };
}

const FALAS = {
  pixel: ['Tela é comigo. Deixa bonito e acessível.', 'Nada de tela aqui, passo.'],
  chevron: ['Hmm. Isso aqui precisa de um endpoint decente.', 'Sem back-end nisso. Passo.'],
  scout: ['Vou atrás da referência oficial.', 'Se precisar de referência, estou aqui.'],
  revisor: ['Quero revisar isso de perto.', 'Nada para revisar ainda.'],
};

function falaDaProposta(agente, aceita) {
  const f = FALAS[agente.id];
  if (f) return aceita ? f[0] : f[1];
  return aceita ? `${agente.papel} é comigo.` : `Não é a minha área (${agente.papel}). Passo.`;
}

// ---------- R4: rodada de propostas ----------
// Todos os agentes respondem; a lista sai da maior confiança para a menor.
export function rodadaDePropostas(agentes, pedido) {
  return agentes.map((a) => proporAgente(a, pedido)).sort((x, y) => y.confianca - x.confianca);
}

// ---------- R5: o coordenador monta o time ----------
// Etapas em sequência; agentes na mesma etapa trabalham em paralelo.
//   1. pesquisa (Scout), se aceitou
//   2. quem executa (todos os que aceitaram, exceto pesquisa e revisão)
//   3. revisão (Revisor) sempre no final quando alguém mexeu em código
// Se ninguém aceitou, o de maior confiança que não é coordenador assume.
export function montarTime(agentes, propostas) {
  const porId = new Map(agentes.map((a) => [a.id, a]));
  const aceitos = propostas.filter((p) => p.aceita).map((p) => porId.get(p.id)).filter(Boolean);
  if (!aceitos.length) {
    const melhor = propostas.map((p) => porId.get(p.id)).find((a) => a && !a.coordenador);
    if (melhor) aceitos.push(melhor);
  }
  const ehPesquisa = (a) => a.papel === 'Pesquisa';
  const ehRevisao = (a) => a.papel === 'Revisão de código';
  const pesquisa = aceitos.filter(ehPesquisa);
  const execucao = aceitos.filter((a) => !ehPesquisa(a) && !ehRevisao(a));
  let revisao = aceitos.filter(ehRevisao);
  if (execucao.length && !revisao.length) revisao = agentes.filter(ehRevisao).slice(0, 1);
  const etapas = [pesquisa, execucao, revisao].filter((e) => e.length).map((e) => e.map((a) => a.id));
  return { etapas, mensagem: mensagemDoMaestro(etapas, porId) };
}

// ---------- R6: a fala do coordenador ----------
export function mensagemDoMaestro(etapas, porId) {
  const nome = (id) => porId.get(id)?.nome ?? id;
  const lista = (ids) => ids.map(nome).join(ids.length > 2 ? ', ' : ' e ').replace(/, ([^,]+)$/, ' e $1');
  if (!etapas.length) return 'Ninguém do time cobre isso. Reformula o pedido?';
  const partes = [];
  const revisor = etapas.length > 1 ? etapas[etapas.length - 1] : null;
  const ehRevisao = revisor && revisor.every((id) => porId.get(id)?.papel === 'Revisão de código');
  const meio = ehRevisao ? etapas.slice(0, -1) : etapas;
  meio.forEach((ids, i) => partes.push(i === 0 ? `Fica com ${lista(ids)}.` : `Depois, ${lista(ids)}.`));
  if (ehRevisao) partes.push(`${lista(revisor)}, acompanha no final.`);
  return partes.join(' ');
}

// ---------- R7: comando sensível pede aprovação ----------
const PADROES_SENSIVEIS = [
  /\brm\s+-[a-z]*[rf]/i, /\bsudo\b/i, /\bgit\s+push\b/i, /\bgit\s+reset\s+--hard\b/i, /\bnpm\s+publish\b/i,
  /\bchmod\s+(-R\s+)?777\b/i, /\b(curl|wget)\b[^|]*\|\s*(sh|bash)\b/i, /\bdrop\s+(table|database)\b/i,
  /\bmkfs\b/i, /\bdd\s+if=/i, /\bshutdown\b|\breboot\b/i, /:\(\)\s*\{/, /\bdocker\s+system\s+prune\b/i,
];

export function comandoSensivel(comando) {
  return PADROES_SENSIVEIS.some((r) => r.test(String(comando)));
}

// ---------- R8: comandos sugeridos numa resposta ----------
// Pega as linhas dos blocos ```bash / ```sh / ```shell e marca as sensíveis.
export function extrairComandos(texto) {
  const comandos = [];
  const bloco = /```(?:bash|sh|shell|console)\n([\s\S]*?)```/g;
  let m;
  while ((m = bloco.exec(String(texto)))) {
    for (const linha of m[1].split('\n')) {
      const cmd = linha.replace(/^\$\s*/, '').trim();
      if (cmd && !cmd.startsWith('#')) comandos.push({ comando: cmd, sensivel: comandoSensivel(cmd) });
    }
  }
  return comandos;
}

// ---------- R9: prompt de cada agente ----------
// O agente recebe o papel, a personalidade, o pedido e o que as etapas anteriores entregaram.
export function montarPrompt(agente, pedido, anteriores = [], { modo = 'cli' } = {}) {
  const contexto = anteriores.length
    ? '\n\nO que o time já entregou:\n' + anteriores.map((r) => `--- ${r.nome} (${r.papel}) ---\n${r.texto}`).join('\n\n')
    : '';
  const escreve = podeEscrever(agente);
  const pasta = modo === 'api' || modo === 'gratis'
    ? (escreve
      ? 'Para criar ou editar arquivos, devolva cada arquivo COMPLETO num bloco que começa com ```arquivo:caminho/relativo '
        + '(ex.: ```arquivo:index.html) e termina com ```. O Estúdio grava esses blocos na pasta do projeto.'
      : 'Você não acessa a pasta do projeto: trabalhe com o que o time entregou abaixo.')
    : (escreve
      ? 'Você trabalha direto na pasta do projeto (o diretório atual). Crie ou edite os arquivos que a sua parte precisa '
        + 'usando caminhos relativos ao diretório atual, sem pedir confirmação. No fim, liste os arquivos que criou ou alterou.'
      : 'Você só pode ler a pasta do projeto (o diretório atual). Abra e leia os arquivos que o time criou antes de responder.');
  return [
    `Você é ${agente.nome}, agente de ${agente.papel} num time de IAs chamado Estúdio.`,
    `Personalidade: ${agente.personalidade || 'objetiva.'}`,
    pasta,
    'Responda em português do Brasil. Fora dos arquivos, seja curto (até 15 linhas) e fale só da sua parte.',
    'Se sugerir comandos de terminal, coloque-os num bloco ```bash.',
    `\nPedido do usuário: ${pedido}${contexto}`,
  ].join('\n');
}

// ---------- R10: estados e barra de status ----------
export function trocarEstado(estados, id, novo) {
  if (!ESTADOS.includes(novo)) throw new Error(`Estado inválido: ${novo}`);
  return { ...estados, [id]: novo };
}

export function resumoStatus(agentes, estados) {
  const n = agentes.filter((a) => ['pensando', 'trabalhando'].includes(estados[a.id])).length;
  return `${n} de ${agentes.length} trabalhando`;
}

// ---------- R11: criar agente pelo painel ----------
export function criarAgente(agentes, dados) {
  const nome = String(dados.nome ?? '').trim();
  const papel = String(dados.papel ?? '').trim();
  if (!nome) throw new Error('O agente precisa de um nome.');
  if (!papel) throw new Error('O agente precisa de um papel.');
  const id = normalizar(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id || agentes.some((a) => a.id === id)) throw new Error(`Já existe um agente chamado ${nome}.`);
  const provedor = PROVEDORES.includes(dados.provedor) ? dados.provedor : 'gemini';
  const forma = FORMAS.includes(dados.forma) ? dados.forma : 'bloco';
  const cor = /^#[0-9a-f]{6}$/i.test(dados.cor ?? '') ? dados.cor : '#7aa2f7';
  const palavras = String(dados.palavras ?? '').split(',').map((p) => normalizar(p).trim()).filter(Boolean);
  return [...agentes, { id, nome, papel, provedor, forma, cor, palavras, personalidade: String(dados.personalidade ?? '').trim() }];
}

export function removerAgente(agentes, id) {
  const alvo = agentes.find((a) => a.id === id);
  if (!alvo || alvo.coordenador) return agentes;
  return agentes.filter((a) => a.id !== id);
}

// ---------- R12: conversas separadas, com histórico ----------
export function novaConversa(agora = Date.now()) {
  return { id: `c${agora}`, titulo: 'Nova conversa', criadaEm: agora, mensagens: [] };
}

export function adicionarMensagem(conversa, msg) {
  const titulo = conversa.mensagens.length === 0 && msg.autor === 'voce'
    ? encurtar(String(msg.texto), 60) : conversa.titulo;
  return { ...conversa, titulo, mensagens: [...conversa.mensagens, { ...msg, em: msg.em ?? Date.now() }] };
}

function encurtar(texto, max) {
  return texto.length > max ? texto.slice(0, max - 1) + '…' : texto;
}

// ---------- R13: quem pode escrever na pasta do projeto ----------
// Quem executa (front, back, agentes criados) edita os arquivos direto na pasta.
// Coordenador, pesquisa e revisão só leem.
export function podeEscrever(agente) {
  return !agente.coordenador && agente.papel !== 'Pesquisa' && agente.papel !== 'Revisão de código';
}

// ---------- R14: arquivos que a rodada criou ou alterou ----------
const IGNORAR = new Set(['node_modules', '.git', 'dist', 'build', '.cache', '.next', '__pycache__', '.venv']);

export function ignorarCaminho(nome) {
  return IGNORAR.has(nome);
}

export function arquivosAlterados(arquivos, desde) {
  return arquivos.filter((a) => a.mtimeMs >= desde).map((a) => a.caminho).sort();
}

// ---------- R15: chaves do arquivo .env ----------
// Só as chaves com valor entram; vazio = a CLI usa o login da assinatura.
export function lerEnv(texto) {
  const env = {};
  for (const linha of String(texto ?? '').split(/\r?\n/)) {
    const m = linha.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || linha.trim().startsWith('#')) continue;
    const valor = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (valor) env[m[1]] = valor;
  }
  return env;
}

// ---------- R16: cada IA usa a sua chave de API; sem chave, a CLI logada ----------
export const CHAVE_DO_PROVEDOR = Object.freeze({ claude: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY', codex: 'OPENAI_API_KEY' });

// No modo gratuito (R18) todos os agentes vão para o Gemini grátis e nada pago é usado.
export function modoDoProvedor(provedor, chaves, clis, gratuito = false) {
  if (gratuito) return chaves.includes(CHAVE_DO_PROVEDOR.gemini) ? 'gratis' : null;
  if (chaves.includes(CHAVE_DO_PROVEDOR[provedor])) return 'api';
  if (clis[provedor]) return 'cli';
  return null;
}

// ---------- R18: chave que liga o modo gratuito ----------
// MODO_GRATUITO=true (ou sim, 1, on) no .env. Qualquer outro valor, ou ausente, deixa desligado.
export function modoGratuitoLigado(env) {
  return ['true', 'sim', '1', 'on', 'yes'].includes(String(env?.MODO_GRATUITO ?? '').trim().toLowerCase());
}

// ---------- R17: arquivos devolvidos pela API ----------
// Blocos ```arquivo:caminho viram arquivos na pasta. Caminho absoluto ou com ".." é recusado.
export function caminhoSeguro(caminho) {
  const c = String(caminho).trim().replace(/\\/g, '/');
  if (!c || c.startsWith('/') || /^[a-z]:/i.test(c)) return null;
  const partes = c.split('/').filter((p) => p && p !== '.');
  if (!partes.length || partes.includes('..')) return null;
  return partes.join('/');
}

export function extrairArquivos(texto) {
  const arquivos = [];
  const bloco = /```arquivo:([^\n`]+)\n([\s\S]*?)\n?```/g;
  let m;
  while ((m = bloco.exec(String(texto)))) {
    const caminho = caminhoSeguro(m[1]);
    if (caminho) arquivos.push({ caminho, conteudo: m[2].endsWith('\n') ? m[2] : m[2] + '\n' });
  }
  return arquivos;
}
