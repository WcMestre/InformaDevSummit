/* ==========================================================================
   LAYOUT cronograma — gera a agenda do dia a partir de SUMMIT.blocos.
   Nada é digitado: horários (ini + min), divisão apresentação/definições, pausas e
   blocos intocáveis vêm dos data-bloco-* das telas, então a agenda nunca diverge do deck.
   Até 9 blocos: uma coluna (amplo/medio). Com 10 ou mais: DUAS COLUNAS (manhã | tarde) — a pausa mais longa
   (>= 30 min, o almoço) vira uma faixa vertical entre as colunas; sem ela, o dia é cortado ao meio.
   Reexecuta em 'summit:pronto' e 'summit:slide' e só toca no DOM quando algo mudou.
   Desliga com data-origem="manual" no <section>. Expõe window.SUMMIT.cronograma.
   ========================================================================== */
(function(){
'use strict';

const S = window.SUMMIT;
if(!S) return;

const LAYOUT = 'cronograma';
const DIA = 24 * 60;
const MAX_UNICA = 9;        // acima disso a agenda vira duas colunas
const MAX_COLUNA = 7;       // linhas por coluna que ainda cabem na área útil
const PAUSA_LONGA = 30;     // minutos: a pausa mais longa a partir daqui vira a faixa central
const SVG_NS = 'http://www.w3.org/2000/svg';
const assinaturas = new WeakMap();   // tela -> assinatura da última geração (evita refazer o DOM à toa)

/* ---------- utilidades de tempo ---------- */
const dois = n => String(n).padStart(2, '0');

/** "09:15" -> 555 (minutos desde 00:00); NaN se inválido. */
function lerHora(txt){
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(txt || '');
  if(!m || +m[1] > 23 || +m[2] > 59) return NaN;
  return (+m[1]) * 60 + (+m[2]);
}
/** 555 -> "09:15" (volta ao dia seguinte se passar de 24h). */
function formatarHora(min){
  const t = ((min % DIA) + DIA) % DIA;
  return dois(Math.floor(t / 60)) + ':' + dois(t % 60);
}
/** 165 -> "2h45" · 180 -> "3h" · 45 -> "45 min". */
function formatarDuracao(min){
  const h = Math.floor(min / 60), m = min % 60;
  if(!h) return m + ' min';
  return h + 'h' + (m ? dois(m) : '');
}

/* ---------- construção de nós (sempre textContent; nunca innerHTML) ---------- */
function el(tag, classe, texto){
  const e = document.createElement(tag);
  if(classe) e.className = classe;
  if(texto != null) e.textContent = texto;
  return e;
}
function icone(nome){
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  const uso = document.createElementNS(SVG_NS, 'use');
  uso.setAttribute('href', '#i-' + nome);
  svg.appendChild(uso);
  return svg;
}

/* ---------- modelo de dados: blocos -> linhas da agenda ---------- */
/** Variante da pausa ("cafe" | "almoco"): data-variante de qualquer tela do bloco; senão, deduzida do nome. */
function varianteDoBloco(b){
  for(const i of b.slides){
    const v = S.slides[i] && S.slides[i].dataset.variante;
    if(v) return v;
  }
  return /almo[cç]o/i.test(b.nome) ? 'almoco' : 'cafe';
}

/**
 * Converte SUMMIT.blocos em linhas ordenadas da agenda.
 * @returns {{linhas:Array, efetivos:number, pausas:number, avisos:number}}
 */
function calcular(){
  const linhas = [];
  let cursor = null, efetivos = 0, pausas = 0, avisos = 0;
  (S.blocos || []).forEach(b => {
    if(!(b.min > 0)) return;
    let ini = lerHora(b.ini), aviso = '';
    if(Number.isNaN(ini)) ini = cursor;
    else if(cursor !== null && ini !== cursor){ aviso = ini > cursor ? 'lacuna' : 'sobreposicao'; avisos++; }
    const fim = ini === null ? null : ini + b.min;
    const tipo = b.tipo === 'pausa' ? 'pausa' : (b.tipo === 'intocavel' ? 'intocavel' : 'assunto');
    if(tipo === 'pausa') pausas += b.min; else efetivos += b.min;
    linhas.push({
      nome: b.nome, tipo, aviso, ini, fim, min: b.min,
      apres: b.apres || 0, def: b.def || 0,
      variante: tipo === 'pausa' ? varianteDoBloco(b) : ''
    });
    if(fim !== null) cursor = fim;
  });
  return { linhas, efetivos, pausas, avisos };
}

/* ---------- renderização ---------- */
function rotuloPar(tipo, nome, min){
  const par = el('span', 'cronograma-par');
  par.appendChild(el('span', 'cronograma-ponto cronograma-ponto--' + tipo));
  par.appendChild(document.createTextNode(nome + ' '));
  par.appendChild(el('b', null, min + ' min'));
  return par;
}

/** Texto dentro do segmento (só aparece em duas colunas): forma + minutos. aria-hidden: os rótulos sr-only dizem o mesmo. */
function textoSegmento(tipo, min){
  const tx = el('span', 'cronograma-seg-tx');
  tx.setAttribute('aria-hidden', 'true');
  tx.appendChild(el('span', 'cronograma-ponto cronograma-ponto--' + tipo));
  tx.appendChild(document.createTextNode(String(min)));
  return tx;
}

/** colunas: os rótulos por extenso viram texto só para leitor de tela (a barra já mostra os minutos). */
function montarDivisao(l, colunas, faixa){
  const div = el('div', 'cronograma-divisao' + (faixa ? ' sr-only' : ''));
  if(l.tipo === 'pausa'){
    const barra = el('span', 'cronograma-barra cronograma-barra--pausa');
    barra.setAttribute('aria-hidden', 'true');
    barra.appendChild(el('span', 'cronograma-seg-tx cronograma-seg-tx--pausa', 'Pausa'));
    div.appendChild(barra);
    const rot = el('span', 'cronograma-rotulos' + (colunas ? ' sr-only' : ''));
    rot.appendChild(el('span', 'cronograma-par', 'Pausa: fora das horas efetivas'));
    div.appendChild(rot);
    return div;
  }
  if(!l.apres && !l.def) return div;
  const barra = el('span', 'cronograma-barra');
  barra.setAttribute('aria-hidden', 'true');
  const rot = el('span', 'cronograma-rotulos' + (colunas ? ' sr-only' : ''));
  [['apres', 'Apresentação', l.apres], ['def', 'Definições', l.def]].forEach(([tipo, nome, min]) => {
    if(!min) return;
    const seg = el('i', 'cronograma-seg cronograma-seg--' + tipo);
    seg.style.flexGrow = String(min);
    seg.appendChild(textoSegmento(tipo, min));
    barra.appendChild(seg);
    rot.appendChild(rotuloPar(tipo, nome, min));
  });
  div.appendChild(barra);
  div.appendChild(rot);
  return div;
}

function montarLinha(l, colunas, faixa){
  const li = el('li', 'cronograma-linha');
  li.dataset.tipo = l.tipo;
  if(l.aviso) li.dataset.aviso = l.aviso;

  const hora = el('span', 'cronograma-hora');
  if(l.aviso){
    const a = icone('alerta');
    a.classList.add('cronograma-aviso-ico');
    hora.appendChild(a);
    hora.appendChild(el('span', 'sr-only', l.aviso === 'lacuna' ? 'Há uma lacuna antes deste bloco. ' : 'Este bloco sobrepõe o anterior. '));
  }
  hora.appendChild(el('span', 'cronograma-ini', l.ini === null ? '--:--' : formatarHora(l.ini)));
  hora.appendChild(el('span', 'cronograma-ate', '–'));
  hora.appendChild(el('span', 'cronograma-fim', l.fim === null ? '--:--' : formatarHora(l.fim)));
  li.appendChild(hora);

  const nome = el('span', 'cronograma-nome');
  if(l.tipo === 'pausa') nome.appendChild(icone(l.variante === 'almoco' ? 'talher' : 'cafe'));
  else if(l.tipo === 'intocavel') nome.appendChild(icone('cadeado'));
  nome.appendChild(el('span', 'cronograma-titulo', l.nome));
  if(l.tipo === 'intocavel') nome.appendChild(el('span', 'cronograma-selo' + (colunas ? ' sr-only' : ''), 'Intocável'));
  li.appendChild(nome);

  li.appendChild(montarDivisao(l, colunas, faixa));

  const min = el('span', 'cronograma-min');
  min.appendChild(el('b', null, String(l.min)));
  min.appendChild(document.createTextNode(' min'));
  li.appendChild(min);
  return li;
}

function itemLegenda(forma, texto){
  const it = el('span', 'cronograma-leg');
  it.appendChild(forma);
  it.appendChild(document.createTextNode(texto));
  return it;
}

/** Aviso de horários que não encadeiam. Em colunas ele vai para o cabeçalho (à direita do título), para não roubar altura das linhas. */
function montarAlerta(avisos){
  const av = el('p', 'cronograma-alerta');
  av.appendChild(icone('alerta'));
  av.appendChild(document.createTextNode(avisos === 1 ? 'Um bloco não começa quando o anterior termina: confira os horários.'
    : avisos + ' blocos não começam quando o anterior termina: confira os horários.'));
  return av;
}

function montarTotal(dados, colunas){
  const { linhas, efetivos, pausas, avisos } = dados;
  const nos = [];

  const ef = el('p', 'cronograma-efetivas');
  ef.appendChild(icone('relogio'));
  ef.appendChild(el('span', 'num', formatarDuracao(efetivos)));
  const tx = el('span', 'cronograma-efetivas-tx', 'de trabalho efetivo');
  if(pausas) tx.appendChild(el('small', null, 'sem ' + pausas + ' min de pausa'));
  ef.appendChild(tx);
  nos.push(ef);

  const leg = el('p', 'cronograma-legenda');
  if(linhas.some(l => l.apres)) leg.appendChild(itemLegenda(el('span', 'cronograma-ponto cronograma-ponto--apres'), 'Apresentação'));
  if(linhas.some(l => l.def)) leg.appendChild(itemLegenda(el('span', 'cronograma-ponto cronograma-ponto--def'), 'Definições'));
  if(linhas.some(l => l.tipo === 'pausa')) leg.appendChild(itemLegenda(el('span', 'cronograma-ponto cronograma-ponto--pausa'), 'Pausa'));
  if(linhas.some(l => l.tipo === 'intocavel')) leg.appendChild(itemLegenda(icone('cadeado'), 'Intocável'));
  if(colunas && linhas.some(l => l.apres || l.def)) leg.appendChild(el('span', 'cronograma-leg cronograma-leg--nota', 'Números em minutos'));
  if(leg.childNodes.length) nos.push(leg);

  const primeira = linhas.find(l => l.ini !== null), ultima = [...linhas].reverse().find(l => l.fim !== null);
  if(primeira && ultima){
    const dia = el('p', 'cronograma-dia');
    dia.appendChild(el('span', 'cronograma-dia-rot', 'Dia'));
    dia.appendChild(document.createTextNode(formatarHora(primeira.ini) + ' – ' + formatarHora(ultima.fim)));
    nos.push(dia);
  }

  if(avisos && !colunas) nos.push(montarAlerta(avisos));
  return nos;
}

function densidade(n){ return n <= 6 ? 'amplo' : (n <= 9 ? 'medio' : 'colunas'); }

/* ---------- duas colunas (10 blocos ou mais) ---------- */
/** Corta o dia: a pausa mais longa (>= PAUSA_LONGA) vira faixa central, se sobrar 1 a MAX_COLUNA linhas de cada lado; senão, ao meio. */
function dividir(linhas){
  const n = linhas.length;
  let idx = -1, maior = 0;
  linhas.forEach((l, i) => { if(l.tipo === 'pausa' && l.min >= PAUSA_LONGA && l.min > maior){ maior = l.min; idx = i; } });
  if(idx > 0 && idx < n - 1 && idx <= MAX_COLUNA && n - idx - 1 <= MAX_COLUNA)
    return { esq: linhas.slice(0, idx), faixa: linhas[idx], dir: linhas.slice(idx + 1) };
  const m = Math.ceil(n / 2);
  return { esq: linhas.slice(0, m), faixa: null, dir: linhas.slice(m) };
}

function periodo(min){
  const h = Math.floor((min % DIA) / 60);
  return h < 12 ? 'Manhã' : (h < 18 ? 'Tarde' : 'Noite');
}

function montarGrupo(linhas, nome){
  const li = el('li', 'cronograma-grupo');
  const cab = el('p', 'cronograma-grupo-cab');
  cab.appendChild(el('span', 'cronograma-grupo-nome', nome));
  const ini = linhas.find(l => l.ini !== null), fim = [...linhas].reverse().find(l => l.fim !== null);
  if(ini && fim) cab.appendChild(el('span', 'cronograma-grupo-faixa', formatarHora(ini.ini) + ' – ' + formatarHora(fim.fim)));
  const ef = linhas.reduce((a, l) => a + (l.tipo === 'pausa' ? 0 : l.min), 0);
  cab.appendChild(el('span', 'cronograma-grupo-ef', formatarDuracao(ef) + ' efetivos'));
  li.appendChild(cab);
  const ol = el('ol', 'cronograma-grupo-lista');
  linhas.forEach(l => ol.appendChild(montarLinha(l, true)));
  li.appendChild(ol);
  return li;
}

function montarColunas(lista, linhas){
  const { esq, faixa, dir } = dividir(linhas);
  const a = esq.find(l => l.ini !== null), b = dir.find(l => l.ini !== null);
  let nomeA = a ? periodo(a.ini) : 'Parte 1', nomeB = b ? periodo(b.ini) : 'Parte 2';
  if(nomeA === nomeB){ nomeA = 'Parte 1'; nomeB = 'Parte 2'; }
  lista.dataset.faixa = faixa ? 'sim' : 'nao';
  lista.dataset.cheio = Math.max(esq.length, dir.length) >= MAX_COLUNA ? 'sim' : 'nao';   // 7 linhas por coluna: linhas mais baixas
  lista.appendChild(montarGrupo(esq, nomeA));
  if(faixa){
    const f = montarLinha(faixa, true, true);
    f.dataset.faixa = 'central';
    lista.appendChild(f);
  }
  lista.appendChild(montarGrupo(dir, nomeB));
}

/** Gera (ou atualiza) a agenda de UMA tela de cronograma. Ignora telas com data-origem="manual". */
function gerar(tela){
  if(tela.dataset.origem === 'manual') return;
  const lista = tela.querySelector('.cronograma-lista');
  const total = tela.querySelector('.cronograma-total');
  if(!lista) return;

  const dados = calcular();
  const assin = JSON.stringify(dados);
  if(assinaturas.get(tela) === assin) return;
  assinaturas.set(tela, assin);

  const dens = densidade(dados.linhas.length);
  tela.dataset.densidade = dens;
  tela.dataset.linhas = String(dados.linhas.length);

  lista.replaceChildren();
  delete lista.dataset.faixa;
  delete lista.dataset.cheio;
  if(total) total.replaceChildren();
  const cab = tela.querySelector('.cab');
  if(cab) cab.querySelectorAll('.cronograma-alerta').forEach(n => n.remove());
  if(!dados.linhas.length){
    lista.appendChild(el('li', 'cronograma-vazio', 'Nenhum bloco com duração foi registrado no deck (data-bloco-min).'));
    return;
  }
  const colunas = dens === 'colunas';
  if(colunas) montarColunas(lista, dados.linhas);
  else dados.linhas.forEach(l => lista.appendChild(montarLinha(l)));
  if(total) montarTotal(dados, colunas).forEach(n => total.appendChild(n));
  if(colunas && dados.avisos && cab) cab.appendChild(montarAlerta(dados.avisos));
}

/** Gera a agenda em todas as telas de cronograma do deck (as reais; clones da visão geral herdam o DOM pronto). */
function gerarTodas(){
  (S.slides || []).forEach(t => { if(t.dataset.layout === LAYOUT) gerar(t); });
}

S.cronograma = { gerar: gerarTodas, calcular };
S.on('pronto', gerarTodas);
S.on('slide', gerarTodas);
})();
