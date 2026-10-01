/* ==========================================================================
   LAYOUT pausa — contagem regressiva até o horário de volta (data-volta="HH:MM").
   Conta apenas com a tela ativa, pelo relógio real (ou por SUMMIT.agoraFn, substituível em testes).
   Ao zerar mostra "Hora de voltar" e permanece assim. Expõe window.SUMMIT.pausa e SUMMIT.agoraFn.
   ========================================================================== */
(function(){
'use strict';

const S = window.SUMMIT;
if(!S) return;

const LAYOUT = 'pausa';
const PASSO_MS = 250;        // granularidade do tique; o texto só é reescrito quando muda
const FINAL_S = 60;          // último minuto: data-estado="final"
let timer = null, ativa = null;

/**
 * Relógio do deck. Padrão: hora real. Testes podem substituí-lo por uma função que devolva Date ou milissegundos.
 * @returns {Date}
 */
if(typeof S.agoraFn !== 'function') S.agoraFn = () => new Date();
const agora = () => {
  const v = S.agoraFn();
  return v instanceof Date ? v : new Date(v);
};

const dois = n => String(n).padStart(2, '0');

/** "11:15" -> {h, m}; null se inválido. */
function lerHora(txt){
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(txt || '');
  if(!m || +m[1] > 23 || +m[2] > 59) return null;
  return { h: +m[1], m: +m[2] };
}

/** Horário de volta da tela: data-volta, ou (início + duração) do bloco. */
function horaDeVolta(tela){
  const direto = lerHora(tela.dataset.volta);
  if(direto) return direto;
  const b = (S.blocos || []).find(x => x.id === tela.dataset.bloco);
  const ini = b && lerHora(b.ini);
  if(!ini || !b.min) return null;
  const tot = (ini.h * 60 + ini.m + b.min) % (24 * 60);
  return { h: Math.floor(tot / 60), m: tot % 60 };
}

/** 870 -> "14:30" · 4470 -> "1:14:30". */
function formatar(seg){
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  return h ? h + ':' + dois(m) + ':' + dois(s) : dois(m) + ':' + dois(s);
}

/** Segundos que faltam até {h,m} no dia de `ref` (negativo se já passou). */
function segundosAte(alvo, ref){
  const t = new Date(ref);
  t.setHours(alvo.h, alvo.m, 0, 0);
  return Math.ceil((t - ref) / 1000);
}

function escrever(no, texto){
  if(no && no.textContent !== texto) no.textContent = texto;
}

/** Atualiza horário grande, contagem e estado de UMA tela de pausa. */
function pintar(tela){
  const alvo = horaDeVolta(tela);
  if(!alvo) return;
  escrever(tela.querySelector('.pausa-hora'), dois(alvo.h) + ':' + dois(alvo.m));

  const falta = segundosAte(alvo, agora());
  const estado = falta <= 0 ? 'acabou' : (falta <= FINAL_S ? 'final' : 'contando');
  escrever(tela.querySelector('.pausa-tempo'), falta <= 0 ? 'Hora de voltar' : formatar(falta));
  if(tela.dataset.estado !== estado){
    tela.dataset.estado = estado;
    if(estado === 'acabou') escrever(tela.querySelector('[data-pausa-status]'), 'Hora de voltar');
  }
}

function parar(){
  if(timer !== null) clearInterval(timer);
  timer = null;
  ativa = null;
}

function iniciar(tela){
  parar();
  ativa = tela;
  pintar(tela);
  timer = setInterval(() => pintar(tela), PASSO_MS);
}

/** Liga a contagem se a tela aberta for uma pausa; senão, limpa o intervalo. Pinta todas as pausas uma vez (miniaturas da visão geral). */
function sincronizar(){
  const todas = (S.slides || []).filter(t => t.dataset.layout === LAYOUT);
  todas.forEach(pintar);
  const atual = (S.slides || [])[S.atual()];
  if(atual && atual.dataset.layout === LAYOUT){
    if(ativa !== atual) iniciar(atual);
  } else {
    parar();
  }
}

S.pausa = { sincronizar, formatar, parar };
S.on('pronto', sincronizar);
S.on('slide', sincronizar);
})();
