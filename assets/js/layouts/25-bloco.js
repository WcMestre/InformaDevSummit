/* ==========================================================================
   LAYOUT bloco — comportamento.
   Lê os metadados do próprio slide (data-bloco-ini / -min / -apres / -def) e preenche os elementos
   [data-campo] da tela: horário de término (início + duração), minutos e largura proporcional das barras
   "Apresentação · Definições". Assim a tela nunca diverge dos metadados que alimentam a trilha do dia.
   Não grava dados (tela sem interação). Funciona mesmo se não existir nenhuma tela "bloco" no deck.
   Expõe window.SUMMIT.bloco = { atualizar, somarMinutos }.
   ========================================================================== */
(function(){
'use strict';

const SUMMIT = window.SUMMIT = window.SUMMIT || {};
const SELETOR = '.slide[data-layout="bloco"]';

/**
 * Soma minutos a um horário "hh:mm" (volta ao dia seguinte após 24h).
 * @param {string} hhmm horário de partida, ex.: "09:30"
 * @param {number} minutos minutos a somar
 * @returns {string|null} "hh:mm" ou null se o horário for inválido
 */
function somarMinutos(hhmm, minutos){
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if(!m) return null;
  const total = ((+m[1]) * 60 + (+m[2]) + (minutos | 0)) % (24 * 60);
  const h = Math.floor(total / 60), min = total % 60;
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

const inteiro = v => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0; };

function campo(slide, nome){ return slide.querySelector('[data-campo="' + nome + '"]'); }
function texto(slide, nome, valor){ const el = campo(slide, nome); if(el && valor != null) el.textContent = valor; }

/** Preenche uma tela "bloco" a partir dos seus data-bloco-*. */
function preencher(slide){
  const d = slide.dataset;
  const min = inteiro(d.blocoMin), apres = inteiro(d.blocoApres), def = inteiro(d.blocoDef);
  const ini = (d.blocoIni || '').trim();
  const fim = somarMinutos(ini, min);

  texto(slide, 'inicio', ini || null);
  texto(slide, 'fim', fim);
  texto(slide, 'duracao', min || null);
  texto(slide, 'apres', apres);
  texto(slide, 'def', def);

  const soma = apres + def || min || 1;
  [['barra-apres', apres], ['barra-def', def]].forEach(([nome, n]) => {
    const el = campo(slide, nome);
    if(el) el.style.width = (n / soma * 100) + '%';
  });
  ['apres', 'def'].forEach(nome => {
    const el = campo(slide, nome), li = el && el.closest('li');
    if(li) li.classList.toggle('bloco-zero', !(nome === 'apres' ? apres : def));
  });
  const barra = slide.querySelector('.bloco-barra');
  if(barra) barra.setAttribute('aria-label', 'Apresentação ' + apres + ' min, definições ' + def + ' min');
}

/** Atualiza todas as telas "bloco" presentes no deck (idempotente). */
function atualizar(){
  document.querySelectorAll(SELETOR).forEach(preencher);
}

SUMMIT.bloco = { atualizar, somarMinutos };

atualizar();
document.addEventListener('summit:pronto', atualizar);
document.addEventListener('summit:slide', atualizar);
})();
