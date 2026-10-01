/* ==========================================================================
   42 · LAYOUT proposta — comportamento da "proposta na mesa".
   - Marca a decisão (aceitar · ajustar · recusar) por clique ou teclas 1 · 2 · 3; repetir desmarca.
   - Conta mãos levantadas por ação (− / +) e mostra o total (contra o tamanho da sala, se houver data-sala).
   - Campo "Ajuste acordado" (texto livre); a linha-exemplo em cinza some ao digitar e nunca vai para os dados.
   Persistência: tabela CSV "propostas", UMA linha por tela (chave lógica: proposta = id da <section>).
   Colunas: assunto · proposta · enunciado · decisao · votos_aceitar · votos_ajustar · votos_recusar · ajuste.
   "enunciado" = texto visível da proposta (h2), em 1 linha, para o CSV ser legível sozinho.
   Avisos (discretos, com ícone + texto, nunca bloqueiam): mais mãos do que pessoas (se houver data-sala) e
   decisão marcada que diverge da maioria das mãos.
   A linha nasce na primeira interação; o estado nunca fica no HTML. Expõe window.SUMMIT.propostas.
   Modelo: conteudo/modelos/42-proposta.html
   ========================================================================== */
(function(){
'use strict';

const S=window.SUMMIT;
if(!S||!S.dados)return;

const TABELA='propostas';
const ACOES=['aceitar','ajustar','recusar'];
const ROTULO={aceitar:'Aceitar',ajustar:'Ajustar',recusar:'Recusar'};
const SEL='.slide[data-layout="proposta"]';
const MAX_MAOS=99;
const ATRASO_TEXTO=350;              // ms entre a última tecla e a gravação do ajuste

const telas=S.slides.filter(el=>el.matches(SEL));
const pendentes=new Map();           // id da tela → timer da gravação do ajuste
let tabela=null;

/** Tabela CSV "propostas" (criada na primeira necessidade). */
const tab=()=>tabela||(tabela=S.dados.tabela(TABELA));

/* ---------- leitura ---------- */

/** Linha da tabela que pertence à tela `id` (ou null). */
function linhaDe(id){
  return tab().linhas().find(l=>l.proposta===id)||null;
}

const inteiro=v=>{const n=parseInt(v,10);return n>0?Math.min(n,MAX_MAOS):0};

/** Estado atual de uma tela, lido da tabela: {decisao, votos:{aceitar,ajustar,recusar}, ajuste}. */
function estadoDe(slide){
  const l=linhaDe(slide.id)||{};
  return {
    decisao:ACOES.includes(l.decisao)?l.decisao:'',
    votos:{aceitar:inteiro(l.votos_aceitar),ajustar:inteiro(l.votos_ajustar),recusar:inteiro(l.votos_recusar)},
    ajuste:l.ajuste||''
  };
}

/* ---------- escrita (upsert) ---------- */

/** Texto visível do enunciado da tela, em 1 linha (sem quebras nem espaços repetidos). */
function enunciadoDe(slide){
  const h=slide.querySelector('.proposta-enunciado');
  return h?h.textContent.replace(/\s+/g,' ').trim():'';
}

/** Grava `patch` na linha da tela; cria a linha se ainda não existir. */
function gravar(slide,patch){
  const t=tab(), l=linhaDe(slide.id), base={assunto:slide.dataset.assunto||'',enunciado:enunciadoDe(slide)};
  if(l){t.atualizar(l.id,Object.assign(base,patch));return}
  t.adicionar(Object.assign({proposta:slide.id,enunciado:'',decisao:'',votos_aceitar:'0',votos_ajustar:'0',votos_recusar:'0',ajuste:''},base,patch));
}

/** Marca (ou, se já marcada, desmarca) a decisão da tela. */
function alternarDecisao(slide,acao){
  gravar(slide,{decisao:estadoDe(slide).decisao===acao?'':acao});
}

/** Soma `delta` (+1 | −1) às mãos de uma ação, sem passar de 0 nem de MAX_MAOS. */
function ajustarMaos(slide,acao,delta){
  const atual=estadoDe(slide).votos[acao];
  const novo=Math.max(0,Math.min(MAX_MAOS,atual+delta));
  if(novo!==atual)gravar(slide,{['votos_'+acao]:String(novo)});
}

/* ---------- campo de ajuste ---------- */

const campoDe=slide=>slide.querySelector('.proposta-ajuste-texto');

/* defaultValue espelha o texto no DOM, para a miniatura da visão geral (cópia do slide) também mostrá-lo */
function sincronizarCampo(slide){
  const ta=campoDe(slide);
  if(!ta)return;
  ta.defaultValue=ta.value;
  ta.closest('.proposta-campo').classList.toggle('tem-texto',ta.value.trim()!=='');
}

function gravarAjuste(slide){
  clearTimeout(pendentes.get(slide.id));
  pendentes.delete(slide.id);
  const ta=campoDe(slide);
  if(!ta)return;
  const atual=linhaDe(slide.id);
  if(!atual&&ta.value==='')return;                  // nada digitado e sem linha: não cria
  if(atual&&atual.ajuste===ta.value)return;
  gravar(slide,{ajuste:ta.value});
}

function agendarAjuste(slide){
  clearTimeout(pendentes.get(slide.id));
  pendentes.set(slide.id,setTimeout(()=>gravarAjuste(slide),ATRASO_TEXTO));
}

/** Grava já o que estiver pendente (ao sair do campo, trocar de tela ou fechar a página). */
function gravarPendentes(){
  telas.forEach(s=>{if(pendentes.has(s.id))gravarAjuste(s)});
}

/* ---------- avisos ---------- */

/** Aviso de "mais mãos do que pessoas" (o chip que já vem no HTML da tela). */
const avisoSala=slide=>slide.querySelector('.proposta-aviso:not(.proposta-aviso-maioria)');

/** Aviso de "decisão diverge das mãos": usa o do HTML ou, se a tela não o tiver, cria a partir do aviso da sala. */
function avisoMaioria(slide){
  let a=slide.querySelector('.proposta-aviso-maioria');
  if(a)return a;
  const base=avisoSala(slide);
  if(!base)return null;
  a=base.cloneNode(true);
  a.classList.add('proposta-aviso-maioria');
  a.hidden=true;
  Array.from(a.childNodes).forEach(n=>{if(n.nodeType===3)n.remove()});
  base.after(a);
  return a;
}

/** Ação com mais mãos (sozinha na frente), ou '' se não houver mãos ou houver empate no topo. */
function maioriaDasMaos(votos){
  const max=Math.max(...ACOES.map(k=>votos[k]));
  const topo=ACOES.filter(k=>votos[k]===max);
  return max>0&&topo.length===1?topo[0]:'';
}

/** Mostra/esconde um aviso e troca só o texto (o ícone fica). */
function mostrarAviso(el,ligado,texto){
  if(!el)return;
  el.hidden=!ligado;
  if(!ligado)return;
  let t=Array.from(el.childNodes).filter(n=>n.nodeType===3).pop();
  if(!t)t=el.appendChild(document.createTextNode(''));
  t.nodeValue=texto;
}

/* ---------- desenho ---------- */

/** Reflete na tela o estado que vem da tabela (nunca mexe no campo enquanto alguém digita nele). */
function desenhar(slide){
  const est=estadoDe(slide), q=s=>slide.querySelector(s);
  ACOES.forEach(acao=>{
    const cel=q('.proposta-acao[data-acao="'+acao+'"]');
    if(!cel)return;
    cel.querySelector('.proposta-botao').setAttribute('aria-pressed',String(est.decisao===acao));
    const n=est.votos[acao];
    cel.querySelector('.proposta-maos-n').textContent=n;
    cel.querySelector('.proposta-maos-un').textContent=n===1?'mão':'mãos';
  });

  const estado=q('.proposta-estado');
  if(estado){
    estado.textContent=est.decisao?'Decisão marcada: '+ROTULO[est.decisao]:'Ainda sem decisão';
    estado.classList.toggle('tem-decisao',!!est.decisao);
  }

  const total=ACOES.reduce((a,k)=>a+est.votos[k],0), sala=parseInt(slide.dataset.sala,10)||0;
  const totalN=q('.proposta-total-n'), de=q('.proposta-total-de');
  if(totalN)totalN.textContent=total;
  if(de){de.hidden=!(sala>0);const s=de.querySelector('.proposta-sala');if(s)s.textContent=sala}
  mostrarAviso(avisoSala(slide),sala>0&&total>sala,'Mais mãos do que pessoas na sala');

  /* decisão marcada que perde para outra ação nas mãos: só avisa, nunca muda nem bloqueia a decisão */
  const lider=maioriaDasMaos(est.votos);   // ação com mais mãos (o rótulo do aviso é fixo; as contagens já estão ao lado dos botões)
  mostrarAviso(avisoMaioria(slide),!!(est.decisao&&lider&&lider!==est.decisao),'Decisão contra a maioria das mãos');

  const ta=campoDe(slide);
  if(ta){
    if(document.activeElement!==ta&&ta.value!==est.ajuste&&!pendentes.has(slide.id))ta.value=est.ajuste;
    sincronizarCampo(slide);
  }
}

const desenharTodas=()=>telas.forEach(desenhar);

/* ---------- eventos ---------- */

const noDeck=el=>!!el.closest('#deck');
const emEdicao=t=>!!(t&&t.closest&&t.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));
const sobreposto=()=>S.$$('#visao,#ajuda,#apagao,#dadosPainel').some(el=>!el.hidden);

function iniciar(){
  tab().on(desenharTodas);
  S.on('pronto',desenharTodas);
  S.on('slide',ev=>{
    gravarPendentes();
    desenhar(ev.detail.slide);
  });

  document.addEventListener('click',e=>{
    const b=e.target.closest('.proposta-botao,.proposta-mao');
    const slide=b&&b.closest(SEL);
    if(!slide||!noDeck(slide))return;
    if(b.classList.contains('proposta-botao'))alternarDecisao(slide,b.dataset.acao);
    else ajustarMaos(slide,b.closest('.proposta-acao').dataset.acao,parseInt(b.dataset.mao,10));
    /* clique de MOUSE (detail>0): devolve o foco ao palco, para Espaço/Enter seguirem avançando o deck (no Chrome o botão
       focado pelo mouse passa a casar :focus-visible ao primeiro Espaço). Acionado por TECLADO (detail=0) mantém o foco. */
    if(e.detail>0)b.blur();
  });

  document.addEventListener('input',e=>{
    const ta=e.target.closest('.proposta-ajuste-texto');
    const slide=ta&&ta.closest(SEL);
    if(!slide||!noDeck(slide))return;
    sincronizarCampo(slide);
    agendarAjuste(slide);
  });
  document.addEventListener('focusout',e=>{
    if(e.target.closest&&e.target.closest('.proposta-ajuste-texto'))gravarPendentes();
  });
  addEventListener('pagehide',gravarPendentes);

  /* teclas 1 · 2 · 3 = aceitar · ajustar · recusar (só com a tela ativa e fora de campos editáveis) */
  document.addEventListener('keydown',e=>{
    if(e.defaultPrevented||e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
    const i='123'.indexOf(e.key);
    if(i<0||e.key.length!==1||emEdicao(e.target)||sobreposto())return;
    const slide=S.slides[S.atual()];
    if(!slide||!slide.matches(SEL))return;
    e.preventDefault();
    alternarDecisao(slide,ACOES[i]);
  });
}

if(telas.length)iniciar();

/**
 * API pública.
 * dados() → cópia das linhas da tabela "propostas" (uma por tela já interagida).
 */
S.propostas={
  dados:()=>tab().linhas()
};
})();
