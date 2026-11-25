// Processo principal: janela, pasta do projeto, chaves do .env e chamadas às IAs.
// Cada IA usa a sua chave de API do .env (SDK oficial); sem chave, usa a CLI logada na assinatura.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const nucleo = import('./nucleo.mjs');
let janela;
const TEMPO_MAXIMO_MS = 300_000;
const PASTA_PADRAO = path.join(os.homedir(), 'estudio-projetos');
const ARQUIVO_ENV = path.join(app.getAppPath(), '.env');

function criarJanela() {
  janela = new BrowserWindow({
    width: 1440, height: 880, minWidth: 1100, minHeight: 640, backgroundColor: '#121110', title: 'Estúdio',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  janela.setMenuBarVisibility(false);
  janela.loadFile(path.join(__dirname, 'index.html'));
}

Menu.setApplicationMenu(Menu.buildFromTemplate([
  { label: 'Arquivo', submenu: [{ role: 'quit' }] },
  { role: 'editMenu' },
  { label: 'Exibir', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] },
]));

app.whenReady().then(criarJanela);
app.on('window-all-closed', () => app.quit());

// ---------- .env ----------
// Lido a cada chamada: trocar uma chave não exige reiniciar o app.
async function ambiente() {
  const { lerEnv } = await nucleo;
  let doArquivo = {};
  try { doArquivo = lerEnv(fs.readFileSync(ARQUIVO_ENV, 'utf8')); } catch { /* sem .env: usa os logins */ }
  // o codex exec aceita a chave como CODEX_API_KEY
  if (doArquivo.OPENAI_API_KEY && !doArquivo.CODEX_API_KEY) doArquivo.CODEX_API_KEY = doArquivo.OPENAI_API_KEY;
  return { env: { ...process.env, ...doArquivo }, chaves: Object.keys(doArquivo), doArquivo };
}

// ---------- provedores ----------
function existe(cmd) {
  try { execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }); return true; } catch { return false; }
}

// Quem executa escreve na pasta do projeto; pesquisa e revisão só leem.
const COMANDOS = {
  // --skip-trust: em modo -p o gemini recusa pasta "não confiável"; a pasta é a que a pessoa escolheu.
  gemini: (prompt, escrita) => ['gemini', ['--skip-trust', '--approval-mode', escrita ? 'auto_edit' : 'plan', '-o', 'text', '-p', prompt]],
};

const COMO_INSTALAR = {
  gemini: 'npm install -g @google/gemini-cli',
};

// ---------- APIs (SDKs oficiais) ----------
const MODELO_PADRAO = { gemini: 'gemini-3.8-flash' };
// Modo gratuito: Flash-Lite tem a maior cota grátis do Gemini (troque com GEMINI_MODELO_GRATUITO).
const MODELO_GRATUITO = 'gemini-3.5-flash-lite';
const VAR_MODELO = { gemini: 'GEMINI_MODEL' };

const API = {
  async gemini(prompt, chave, modelo) {
    const { GoogleGenAI } = await import('@google/genai');
    const r = await new GoogleGenAI({ apiKey: chave }).models.generateContent({ model: modelo, contents: prompt });
    return r.text ?? '';
  },
};

async function chamarApi(provedor, prompt, env, modeloForcado) {
  const { CHAVE_DO_PROVEDOR } = await nucleo;
  const modelo = modeloForcado || env[VAR_MODELO[provedor]] || MODELO_PADRAO[provedor];
  try {
    const saida = (await API[provedor](prompt, env[CHAVE_DO_PROVEDOR[provedor]], modelo)).trim();
    return { ok: Boolean(saida), saida, erro: saida ? '' : 'resposta vazia', modelo };
  } catch (e) {
    const limite = (e.status ?? e.code) === 429 || /RESOURCE_EXHAUSTED|quota/i.test(String(e.message));
    return {
      ok: false, saida: '', modelo,
      erro: limite
        ? `${modelo}: limite de uso atingido (por minuto ou por dia). Espere um pouco ou tente amanhã — no modo gratuito o Google libera a cota de novo à meia-noite do Pacífico.`
        : `${modelo}: ${e.message}`,
    };
  }
}

// Grava na pasta os blocos ```arquivo:caminho devolvidos pela API.
async function gravarArquivos(texto, raiz) {
  const { extrairArquivos } = await nucleo;
  const gravados = [];
  for (const { caminho, conteudo } of extrairArquivos(texto)) {
    const destino = path.join(raiz, caminho);
    await fs.promises.mkdir(path.dirname(destino), { recursive: true });
    await fs.promises.writeFile(destino, conteudo, 'utf8');
    gravados.push(caminho);
  }
  return gravados;
}

async function modos() {
  const { modoDoProvedor, modoGratuitoLigado } = await nucleo;
  const { chaves, doArquivo, env } = await ambiente();
  const gratuito = modoGratuitoLigado(doArquivo);
  const clis = gratuito ? {} : Object.fromEntries(Object.keys(COMANDOS).map((p) => [p, existe(p)]));
  return {
    chaves, gratuito,
    modeloGratuito: env.GEMINI_MODELO_GRATUITO || MODELO_GRATUITO,
    modos: Object.fromEntries(Object.keys(COMANDOS).map((p) => [p, modoDoProvedor(p, chaves, clis, gratuito)])),
  };
}

ipcMain.handle('provedores', () => modos());

function rodar(cmd, args, cwd, env, tempo = TEMPO_MAXIMO_MS) {
  return new Promise((resolve) => {
    const filho = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let saida = ''; let erro = '';
    const timer = setTimeout(() => { filho.kill('SIGTERM'); erro += '\n(tempo esgotado)'; }, tempo);
    filho.stdout.on('data', (d) => { saida += d; });
    filho.stderr.on('data', (d) => { erro += d; });
    filho.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, saida, erro: e.message }); });
    filho.on('close', (codigo) => { clearTimeout(timer); resolve({ ok: codigo === 0, codigo, saida: saida.trim(), erro: erro.trim() }); });
  });
}

function pastaDoProjeto(pasta) {
  const p = pasta || PASTA_PADRAO;
  fs.mkdirSync(p, { recursive: true });
  return p;
}

ipcMain.handle('executar-agente', async (_ev, { provedor, prompt, pasta, escrita }) => {
  if (!COMANDOS[provedor]) return { ok: false, erro: `Provedor desconhecido: ${provedor}` };
  const { CHAVE_DO_PROVEDOR } = await nucleo;
  const estado = await modos();
  const modo = estado.modos[provedor];
  const raiz = pastaDoProjeto(pasta);
  const { env } = await ambiente();
  if (modo === 'gratis') {
    // todo agente vira Gemini grátis, com a chave GEMINI_API_KEY
    const r = await chamarApi('gemini', String(prompt), env, estado.modeloGratuito);
    if (r.ok && escrita) r.gravados = await gravarArquivos(r.saida, raiz);
    return { ...r, modo };
  }
  if (modo === 'api') {
    const r = await chamarApi(provedor, String(prompt), env);
    if (r.ok && escrita) r.gravados = await gravarArquivos(r.saida, raiz);
    return { ...r, modo };
  }
  if (modo === 'cli') {
    const [cmd, args] = COMANDOS[provedor](String(prompt), Boolean(escrita));
    return { ...(await rodar(cmd, args, raiz, env)), modo };
  }
  if (estado.gratuito) {
    return { ok: false, erro: 'O modo gratuito está ligado (MODO_GRATUITO=true), mas falta a GEMINI_API_KEY no .env. '
      + 'Crie uma chave grátis em https://aistudio.google.com/app/apikey (sem ativar faturamento).' };
  }
  return { ok: false, erro: `Sem acesso ao ${provedor}: coloque ${CHAVE_DO_PROVEDOR[provedor]} no .env `
    + `ou instale e faça login na CLI (${COMO_INSTALAR[provedor]}).` };
});

// Só roda depois que a pessoa clicou em Executar/Aprovar na tela.
ipcMain.handle('executar-comando', async (_ev, { comando, pasta }) =>
  rodar('bash', ['-lc', String(comando)], pastaDoProjeto(pasta), (await ambiente()).env, 60_000));

ipcMain.handle('pasta-padrao', () => PASTA_PADRAO);

ipcMain.handle('escolher-pasta', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(janela, {
    title: 'Pasta do projeto', properties: ['openDirectory', 'createDirectory'],
  });
  return canceled || !filePaths.length ? null : filePaths[0];
});

// ---------- arquivos alterados na rodada ----------
async function listarArquivos(raiz, ignorar, profundidade = 5) {
  const lista = [];
  async function andar(dir, nivel) {
    if (nivel > profundidade || lista.length > 5000) return;
    let itens = [];
    try { itens = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const it of itens) {
      if (ignorar(it.name)) continue;
      const completo = path.join(dir, it.name);
      if (it.isDirectory()) await andar(completo, nivel + 1);
      else if (it.isFile()) {
        const { mtimeMs } = await fs.promises.stat(completo);
        lista.push({ caminho: path.relative(raiz, completo), mtimeMs });
      }
    }
  }
  await andar(raiz, 0);
  return lista;
}

ipcMain.handle('arquivos-alterados', async (_ev, { pasta, desde }) => {
  const { ignorarCaminho, arquivosAlterados } = await nucleo;
  const raiz = pastaDoProjeto(pasta);
  return arquivosAlterados(await listarArquivos(raiz, ignorarCaminho), Number(desde)).slice(0, 50);
});

// Abre um arquivo (ou a pasta, com caminho vazio) no programa padrão do sistema.
ipcMain.handle('abrir', async (_ev, { pasta, caminho }) => {
  const raiz = path.resolve(pastaDoProjeto(pasta));
  const alvo = path.resolve(raiz, String(caminho || '.'));
  if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) return 'Fora da pasta do projeto';
  return shell.openPath(alvo);
});
