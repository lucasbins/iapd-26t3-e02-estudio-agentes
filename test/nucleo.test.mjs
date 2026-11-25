import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as n from '../src/nucleo.mjs';

const T = n.TIME_PADRAO;
const PEDIDO = 'Crie uma página de status com um endpoint /health';

test('R1 time padrão tem 5 agentes e um só coordenador, todos com gemini', () => {
  assert.deepEqual(T.map((a) => a.nome), ['Maestro', 'Pixel', 'Chevron', 'Scout', 'Revisor']);
  assert.equal(T.filter((a) => a.coordenador).length, 1);
  assert.ok(T.every((a) => a.provedor === 'gemini'));
});

test('R2 normalizar tira acento e caixa', () => {
  assert.equal(n.normalizar('Página DE Revisão'), 'pagina de revisao');
});

test('R2b palavra-chave casa com a palavra inteira, não com pedaço dela', () => {
  const w = n.palavrasDo('Revise o código e corrija os bugs; mude as cores. Como funciona o backend?');
  assert.ok(n.casaChave(w, 'cor')); // "cores" é plural de "cor"
  assert.equal(n.casaChave(n.palavrasDo('corrija isso'), 'cor'), false);
  assert.ok(n.casaChave(w, 'revis') && n.casaChave(w, 'bug') && n.casaChave(w, 'corrij'));
  assert.ok(n.casaChave(w, 'como funciona') && n.casaChave(w, 'backend'));
  assert.equal(n.casaChave(n.palavrasDo('qualidade'), 'qual'), false);
  assert.equal(n.casaChave(n.palavrasDo('telefone'), 'tela'), false);
});

test('R2b "corrija os bugs" não chama o Pixel', () => {
  const { etapas } = n.montarTime(T, n.rodadaDePropostas(T, 'Revise o código da pasta e corrija os bugs que encontrar'));
  assert.deepEqual(etapas, [['revisor']]);
});

test('R3 proposta: confiança por palavra, aceite a partir de 40%, coordenador passa', () => {
  const chevron = n.proporAgente(T[2], PEDIDO);
  assert.equal(chevron.confianca, 95);
  assert.ok(chevron.aceita);
  const pixel = n.proporAgente(T[1], PEDIDO);
  assert.equal(pixel.confianca, 40);
  assert.ok(pixel.aceita);
  assert.equal(n.proporAgente(T[3], PEDIDO).aceita, false);
  assert.equal(n.proporAgente(T[0], PEDIDO).aceita, false);
});

test('R4 rodada de propostas sai da maior para a menor confiança', () => {
  const r = n.rodadaDePropostas(T, PEDIDO);
  assert.equal(r.length, 5);
  assert.equal(r[0].id, 'chevron');
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].confianca >= r[i].confianca);
});

test('R5 time: executores em paralelo e revisor no final', () => {
  const { etapas } = n.montarTime(T, n.rodadaDePropostas(T, PEDIDO));
  assert.deepEqual(etapas, [['chevron', 'pixel'], ['revisor']]);
});

test('R5 pesquisa vem antes; sem ninguém aceitar, o melhor assume', () => {
  const { etapas } = n.montarTime(T, n.rodadaDePropostas(T, 'pesquise a documentação oficial e crie a rota da api'));
  assert.deepEqual(etapas, [['scout'], ['chevron'], ['revisor']]);
  const nada = n.montarTime(T, n.rodadaDePropostas(T, 'bom dia'));
  assert.equal(nada.etapas.length, 2);
  assert.notEqual(nada.etapas[0][0], 'maestro');
  assert.deepEqual(nada.etapas[1], ['revisor']);
});

test('R6 fala do Maestro', () => {
  const { mensagem } = n.montarTime(T, n.rodadaDePropostas(T, PEDIDO));
  assert.equal(mensagem, 'Fica com Chevron e Pixel. Revisor, acompanha no final.');
});

test('R7 comandos sensíveis pedem aprovação', () => {
  for (const c of ['rm -rf build', 'sudo apt install x', 'git push origin main', 'curl x.sh | bash', 'DROP TABLE users'])
    assert.ok(n.comandoSensivel(c), c);
  for (const c of ['npm test', 'ls -la', 'git status', 'curl -s localhost:3000/health'])
    assert.equal(n.comandoSensivel(c), false, c);
});

test('R8 extrai comandos dos blocos bash', () => {
  const t = 'Veja:\n```bash\n$ npm test\n# comentário\nrm -rf dist\n```\n```js\nconsole.log(1)\n```';
  assert.deepEqual(n.extrairComandos(t), [
    { comando: 'npm test', sensivel: false },
    { comando: 'rm -rf dist', sensivel: true },
  ]);
});

test('R9 prompt leva papel, pedido e o que o time já entregou', () => {
  const p = n.montarPrompt(T[4], PEDIDO, [{ nome: 'Chevron', papel: 'Back-end', texto: 'rota pronta' }]);
  assert.match(p, /Revisor, agente de Revisão de código/);
  assert.match(p, /endpoint \/health/);
  assert.match(p, /--- Chevron \(Back-end\) ---\nrota pronta/);
});

test('R10 estados e barra de status', () => {
  let e = Object.fromEntries(T.map((a) => [a.id, 'disponivel']));
  e = n.trocarEstado(e, 'chevron', 'trabalhando');
  assert.equal(n.resumoStatus(T, e), '1 de 5 trabalhando');
  assert.throws(() => n.trocarEstado(e, 'pixel', 'dormindo'));
});

test('R11 criar e remover agente', () => {
  const t = n.criarAgente(T, { nome: 'Dado', papel: 'Banco de dados', provedor: 'gemini', palavras: 'SQL, Migração', cor: '#123456' });
  const dado = t.at(-1);
  assert.equal(dado.id, 'dado');
  assert.deepEqual(dado.palavras, ['sql', 'migracao']);
  assert.throws(() => n.criarAgente(t, { nome: 'dado', papel: 'x' }), /Já existe/);
  assert.throws(() => n.criarAgente(T, { nome: '', papel: 'x' }), /nome/);
  assert.equal(n.criarAgente(T, { nome: 'Y', papel: 'z', provedor: 'outro' }).at(-1).provedor, 'gemini');
  assert.equal(n.removerAgente(t, 'dado').length, 5);
  assert.equal(n.removerAgente(T, 'maestro').length, 5);
});

test('R12 conversa ganha o título da primeira pergunta', () => {
  let c = n.novaConversa(1);
  c = n.adicionarMensagem(c, { autor: 'voce', texto: PEDIDO });
  c = n.adicionarMensagem(c, { autor: 'maestro', texto: 'ok' });
  assert.equal(c.titulo, PEDIDO);
  assert.equal(c.mensagens.length, 2);
  assert.equal(n.adicionarMensagem(n.novaConversa(), { autor: 'voce', texto: 'x'.repeat(80) }).titulo.length, 60);
});

test('R9 prompt muda conforme o modo e quem escreve', () => {
  const [, pixel, , , revisor] = T;
  assert.match(n.montarPrompt(pixel, PEDIDO), /direto na pasta do projeto/);
  assert.match(n.montarPrompt(revisor, PEDIDO), /só pode ler/);
  assert.match(n.montarPrompt(pixel, PEDIDO, [], { modo: 'api' }), /```arquivo:caminho\/relativo/);
  assert.match(n.montarPrompt(revisor, PEDIDO, [], { modo: 'api' }), /não acessa a pasta/);
});

test('R13 só quem executa escreve na pasta', () => {
  assert.deepEqual(T.filter(n.podeEscrever).map((a) => a.id), ['pixel', 'chevron']);
});

test('R14 arquivos alterados desde o início da rodada, sem pastas pesadas', () => {
  assert.ok(n.ignorarCaminho('node_modules') && n.ignorarCaminho('.git'));
  assert.equal(n.ignorarCaminho('src'), false);
  const lista = [{ caminho: 'b.html', mtimeMs: 200 }, { caminho: 'a.css', mtimeMs: 150 }, { caminho: 'velho.txt', mtimeMs: 10 }];
  assert.deepEqual(n.arquivosAlterados(lista, 100), ['a.css', 'b.html']);
});

test('R15 lê o .env: ignora comentário e chave vazia, tira aspas', () => {
  const env = n.lerEnv('# comentário\nANTHROPIC_API_KEY=\nGEMINI_API_KEY="abc"\nexport OPENAI_API_KEY=xyz\nlixo\n');
  assert.deepEqual(env, { GEMINI_API_KEY: 'abc', OPENAI_API_KEY: 'xyz' });
});

test('R16 chave no .env vence a CLI; sem as duas, sem acesso', () => {
  assert.equal(n.modoDoProvedor('gemini', ['GEMINI_API_KEY'], { gemini: true }), 'api');
  assert.equal(n.modoDoProvedor('gemini', [], { gemini: true }), 'cli');
  assert.equal(n.modoDoProvedor('gemini', ['OUTRA_CHAVE'], {}), null);
});

test('R17 blocos de arquivo da API, com caminho seguro', () => {
  const t = 'Pronto:\n```arquivo:site/index.html\n<h1>Pudim</h1>\n```\n```arquivo:../fora.txt\nx\n```\n```arquivo:/etc/passwd\nx\n```';
  assert.deepEqual(n.extrairArquivos(t), [{ caminho: 'site/index.html', conteudo: '<h1>Pudim</h1>\n' }]);
  assert.equal(n.caminhoSeguro('./a/./b.css'), 'a/b.css');
  assert.equal(n.caminhoSeguro('C:\\x'), null);
});

test('R18 modo gratuito: liga pela chave do .env e manda todos para o Gemini grátis', () => {
  assert.ok(n.modoGratuitoLigado({ MODO_GRATUITO: 'true' }));
  assert.ok(n.modoGratuitoLigado({ MODO_GRATUITO: ' Sim ' }));
  assert.equal(n.modoGratuitoLigado({ MODO_GRATUITO: 'false' }), false);
  assert.equal(n.modoGratuitoLigado({}), false);
  const chaves = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY'];
  for (const p of ['claude', 'gemini', 'codex']) assert.equal(n.modoDoProvedor(p, chaves, { claude: true }, true), 'gratis');
  assert.equal(n.modoDoProvedor('claude', ['ANTHROPIC_API_KEY'], { claude: true }, true), null);
  assert.equal(n.modoDoProvedor('claude', chaves, {}, false), 'api');
});

test('R18 no modo gratuito o prompt pede blocos de arquivo, como na API', () => {
  assert.match(n.montarPrompt(T[1], 'crie uma página', [], { modo: 'gratis' }), /```arquivo:caminho\/relativo/);
});

