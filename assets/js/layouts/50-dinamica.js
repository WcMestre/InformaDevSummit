/* ==========================================================================
   50 · LAYOUT dinamica — comportamento da tela de condução de atividade.
   - Resumo ao vivo: barra proporcional dos passos e total "Σ soma de alvo min" (OK com check | ERRO com alerta).
   - Passos clicáveis (ou teclas 1–9): iniciam o cronômetro do núcleo e marcam "em curso"; o anterior vira "feito".
     Clicar/teclar no passo JÁ em curso só pausa/retoma o cronômetro (nunca desmarca); Shift conclui/desmarca; "Desfazer" volta a última mudança.
   - Reload: passo "em curso" volta como "em curso (pausado)" com o tempo do passo; o 1º clique/tecla retoma.
   - Persistência: tabela CSV 'progresso' (slide · passo · estado) pela camada SUMMIT.dados. Uma linha por passo com estado.
   Só existe estado quando há tela data-layout="dinamica" no deck; sem ela, este arquivo não faz nada.
   Único global: window.SUMMIT.dinamica.
   ========================================================================== */
(function(){
'use strict';
const S=window.SUMMIT;
if(!S)return;

const SEL_TELA='.slide[data-layout="dinamica"]';
const NS_SVG='http://www.w3.org/2000/svg';
const FORMATO=/chip--(individual|subgrupos|plenaria)/;
const SOBREPOSTOS=['#visao','#ajuda','#apagao','#dadosPainel'];   // painéis do núcleo que retêm o teclado

const JANELA_REPETIDO=600;   // ms: clique/tecla repetido no mesmo passo nessa janela (duplo clique, tecla presa) conta como um só

let tabela=null;   // tabela 'progresso' (criada só se houver tela de dinâmica)
let ultimo={chave:'',t:0};      // última ação por passo (para ignorar repetição)
const tratadas=new Set();       // telas cujo "em curso" já foi tratado nesta sessão (restauração do cronômetro pausado)
const desfazeres=new Map();     // id da tela -> instantâneo (estados + cronômetro) anterior à última mudança de passo

/* ---------- utilidades ---------- */
const telas=()=>S.$$(SEL_TELA);
const passosDe=tela=>S.$$('.passo',tela);

function minutos(el){
  const n=parseInt(el.dataset.min,10);
  return Number.isFinite(n)&&n>0?n:0;
}

function formatoDe(passo){
  const chip=passo.querySelector('.chip');
  const m=chip&&FORMATO.exec(chip.className);
  return m?m[1]:'';
}

function emEdicao(alvo){
  return !!(alvo&&alvo.closest&&alvo.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));
}

/** Ícone do sprite (ou do próprio SVG do modelo) criado por DOM, sem innerHTML. */
function icone(nome,cheio){
  const svg=document.createElementNS(NS_SVG,'svg');
  svg.setAttribute('class','ico'+(cheio?' ico--cheio':''));
  svg.setAttribute('aria-hidden','true');
  const uso=document.createElementNS(NS_SVG,'use');
  uso.setAttribute('href','#i-'+nome);
  svg.appendChild(uso);
  return svg;
}

/** Símbolo de somatório desenhado em SVG (a fonte do deck é só latin e não traz o glifo Σ). */
function sigma(){
  const svg=document.createElementNS(NS_SVG,'svg');
  svg.setAttribute('class','ico');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');
  const p=document.createElementNS(NS_SVG,'path');
  p.setAttribute('d','M18 4.5H6.5l6 7.5-6 7.5H18');
  svg.appendChild(p);
  return svg;
}

function el(tag,classe,texto){
  const n=document.createElement(tag);
  if(classe)n.className=classe;
  if(texto!=null)n.textContent=texto;
  return n;
}

/* ---------- resumo: tempos, barra proporcional e total ---------- */
function pluralMin(n,singular,plural){return (n===1?singular:plural)+' '+n+' min'}

/** Recalcula a barra e o total a partir dos data-min (fonte da verdade). Chamada no início e a cada mudança de data-min. */
function montarResumo(tela){
  const passos=passosDe(tela);
  const alvo=parseInt(tela.dataset.min,10)||0;
  const soma=passos.reduce((a,p)=>a+minutos(p),0);
  const dif=alvo-soma;

  passos.forEach(p=>{
    const t=p.querySelector('.passo-tempo');
    const txt=minutos(p)+' min';
    if(t&&t.textContent!==txt)t.textContent=txt;
  });

  const barra=tela.querySelector('.dinamica-barra');
  if(barra){
    barra.textContent='';
    barra.dataset.conta=dif===0?'ok':'erro';
    passos.forEach((p,i)=>{
      const f=formatoDe(p);
      const seg=el('span','dinamica-seg'+(f?' dinamica-seg--'+f:''),String(i+1));
      seg.style.flexGrow=String(minutos(p)||1);
      seg.dataset.passo=String(i+1);
      barra.appendChild(seg);
    });
    if(dif>0){
      const falta=el('span','dinamica-seg dinamica-seg--falta');
      falta.style.flexGrow=String(dif);
      barra.appendChild(falta);
    }
  }

  const total=tela.querySelector('.dinamica-total');
  if(total){
    total.textContent='';
    total.dataset.conta=dif===0?'ok':'erro';
    if(total.parentElement)total.parentElement.dataset.conta=total.dataset.conta;
    total.appendChild(el('span','sr-only','Soma dos passos: '));
    if(dif!==0){
      const aviso=el('span','dinamica-aviso');
      aviso.appendChild(icone('alerta'));
      aviso.appendChild(el('span',null,'a conta não fecha: '+(dif>0?pluralMin(dif,'falta','faltam'):pluralMin(-dif,'sobra','sobram'))));
      total.appendChild(aviso);
      total.appendChild(el('span','sr-only',', '));
    }
    total.appendChild(sigma());
    total.appendChild(el('span','dinamica-total-conta',soma+' de '+alvo+' min'));
    if(dif===0){
      const ok=el('span','dinamica-total-ok');
      ok.appendChild(icone('check'));
      total.appendChild(ok);
    }
  }
  pintarBarra(tela);
}

/* ---------- estado dos passos (CSV 'progresso') ---------- */
function linhasDe(slideId){
  return tabela?tabela.linhas().filter(l=>l.slide===slideId):[];
}

function estadosDe(slideId){
  const mapa={};
  linhasDe(slideId).forEach(l=>{if(l.estado==='feito'||l.estado==='em-curso')mapa[parseInt(l.passo,10)]=l.estado});
  return mapa;
}

function pintarBarra(tela){
  const mapa=estadosDe(tela.id);
  S.$$('.dinamica-seg[data-passo]',tela).forEach(seg=>{
    const e=mapa[parseInt(seg.dataset.passo,10)];
    if(e)seg.dataset.estado=e;else delete seg.dataset.estado;
  });
}

/** Cronômetro parado (pausado, oculto ou restaurado após reload)? Então o passo "em curso" aparece como pausado. */
const cronParado=()=>!S.cron.estado().run;

/** Reflete no DOM o estado gravado: data-estado, ícone no círculo, aria-current e texto para leitores de tela. */
function pintar(tela){
  restaurarCron(tela);
  const mapa=estadosDe(tela.id);
  const parado=cronParado();
  passosDe(tela).forEach((p,i)=>{
    const e=mapa[i+1]||'';
    const pausa=e==='em-curso'&&parado;
    if(e)p.dataset.estado=e;else delete p.dataset.estado;
    if(pausa)p.dataset.pausa='1';else delete p.dataset.pausa;

    const botao=p.querySelector('.passo-ac');
    if(botao){
      if(e==='em-curso')botao.setAttribute('aria-current','step');else botao.removeAttribute('aria-current');
      let leitor=botao.querySelector('.passo-leitor');
      if(!leitor){leitor=el('span','sr-only passo-leitor');botao.appendChild(leitor)}
      leitor.textContent=e==='em-curso'?(pausa?' (em curso, pausado)':' (em curso)'):(e==='feito'?' (feito)':'');
      let rotulo=botao.querySelector('.passo-pausa');
      if(pausa&&!rotulo){rotulo=el('span','passo-pausa','pausado');rotulo.setAttribute('aria-hidden','true');botao.appendChild(rotulo)}
      else if(!pausa&&rotulo)rotulo.remove();
    }

    const num=p.querySelector('.passo-num');
    if(num){
      num.textContent='';
      if(e==='feito')num.appendChild(icone('check'));
      else if(e==='em-curso')num.appendChild(icone('play',!pausa));   // pausado: play vazado = "toque para retomar"
    }
  });
  pintarBarra(tela);
  atualizarDesfazer(tela);
}

const pintarTodas=()=>telas().forEach(pintar);

/** Após reload o cronômetro do núcleo nasce oculto: um "em curso" gravado volta como pausado, com o tempo do passo (uma vez por tela). */
function restaurarCron(tela){
  if(!tabela||tratadas.has(tela.id)||S.slides[S.atual()]!==tela)return;
  const mapa=estadosDe(tela.id);
  const n=Object.keys(mapa).map(Number).find(k=>mapa[k]==='em-curso');
  if(!n)return;
  tratadas.add(tela.id);
  const passo=passosDe(tela)[n-1];
  if(!passo||S.cron.estado().vis)return;   // outro cronômetro já está na tela: não o sobrescreve
  S.cron.definir(minutos(passo)*60);
  S.cron.pausar();
}

/** Com a tela aberta, o cronômetro pode ser pausado/retomado pelas teclas do núcleo: mantém o rótulo "pausado" em dia. */
function sincronizarPausa(){
  const tela=S.slides[S.atual()];
  if(!tela||!tela.matches(SEL_TELA))return;
  const em=S.$('.passo[data-estado="em-curso"]',tela);
  if(em&&!!em.dataset.pausa!==cronParado())pintar(tela);
}

/** Grava (ou remove, com estado vazio) o estado de um passo, exatamente como pedido. */
function gravar(tela,n,estado){
  if(!tabela)return;
  const existente=linhasDe(tela.id).find(l=>parseInt(l.passo,10)===n);
  if(!estado){if(existente)tabela.remover(existente.id)}
  else if(existente){if(existente.estado!==estado)tabela.atualizar(existente.id,{estado})}
  else tabela.adicionar({slide:tela.id,passo:n,estado});
}

/** Define o estado de um passo; só um passo fica "em curso" por tela (o anterior vira "feito"). */
function definir(tela,n,estado){
  if(estado==='em-curso'){
    linhasDe(tela.id).forEach(l=>{if(l.estado==='em-curso'&&parseInt(l.passo,10)!==n)tabela.atualizar(l.id,{estado:'feito'})});
  }
  gravar(tela,n,estado);
}

/* ---------- desfazer (um nível por tela) ---------- */
function guardarDesfazer(tela){
  desfazeres.set(tela.id,{mapa:Object.assign({},estadosDe(tela.id)),cron:S.cron.estado()});
}

function atualizarDesfazer(tela){
  const b=tela.querySelector('.dinamica-desfazer');
  if(b)b.hidden=!desfazeres.has(tela.id);
}

/** Volta os passos e o cronômetro ao que eram antes da última mudança de passo. */
function desfazer(alvo){
  const tela=typeof alvo==='string'?document.getElementById(alvo):alvo;
  const snap=tela&&desfazeres.get(tela.id);
  if(!snap||!tabela)return;
  desfazeres.delete(tela.id);
  tratadas.add(tela.id);
  passosDe(tela).forEach((p,i)=>gravar(tela,i+1,snap.mapa[i+1]||''));
  if(snap.cron.vis){
    S.cron.definir(snap.cron.restante);
    if(!snap.cron.run)S.cron.pausar();
  }else S.cron.ocultar();
  pintar(tela);
  const foco=S.$('.passo[data-estado="em-curso"] .passo-ac',tela)||S.$('.passo-ac',tela);
  if(foco)foco.focus();   // o botão "Desfazer" some: o foco não pode se perder
}

/**
 * Aciona o passo n (1..N) de uma tela de dinâmica.
 * Passo parado ou feito: inicia (cronômetro no tempo do passo + "em curso"); o que estava em curso vira "feito".
 * Passo JÁ em curso: só pausa/retoma o cronômetro (clique errado ou duplo clique nunca desmarca nem esconde o tempo).
 * Com `concluir` (Shift): marca "feito" e pausa o tempo; repetir em passo "feito" desmarca (ação explícita). "Desfazer" volta tudo.
 * @param {string|Element} alvo id da tela (ou o próprio <section>)
 * @param {number} n índice do passo, a partir de 1
 * @param {boolean} [concluir]
 */
function alternar(alvo,n,concluir){
  const tela=typeof alvo==='string'?document.getElementById(alvo):alvo;
  if(!tela||!tabela)return;
  const passo=passosDe(tela)[n-1];
  if(!passo)return;
  const atual=estadosDe(tela.id)[n]||'';
  tratadas.add(tela.id);
  if(concluir){
    guardarDesfazer(tela);
    if(atual==='em-curso'&&S.cron.estado().run)S.cron.pausar();   // passo concluído: pausa o tempo
    gravar(tela,n,atual==='feito'?'':'feito');
  }else if(atual==='em-curso'){
    if(S.cron.estado().vis)S.cron.alternar();           // pausa / retoma
    else S.cron.definir(minutos(passo)*60);              // cronômetro foi ocultado: recomeça no tempo do passo
  }else{
    guardarDesfazer(tela);
    definir(tela,n,'em-curso');
    S.cron.definir(minutos(passo)*60);
  }
  pintar(tela);
}

/** Ignora o mesmo passo acionado de novo dentro de JANELA_REPETIDO (duplo clique, Enter/tecla repetidos). */
function repetido(tela,n){
  const agora=performance.now(), chave=tela.id+'#'+n;
  const rep=ultimo.chave===chave&&agora-ultimo.t<JANELA_REPETIDO;
  ultimo={chave,t:agora};
  return rep;
}

/* ---------- entradas: clique e teclado ---------- */
document.addEventListener('click',e=>{
  const alvo=e.target.closest?e.target:null;
  const des=alvo&&alvo.closest(SEL_TELA+' .dinamica-desfazer');
  if(des){desfazer(des.closest(SEL_TELA));return}
  const botao=alvo&&alvo.closest(SEL_TELA+' .passo-ac');
  if(!botao)return;
  const tela=botao.closest(SEL_TELA), n=passosDe(tela).indexOf(botao.closest('.passo'))+1;
  if(repetido(tela,n))return;
  alternar(tela,n,e.shiftKey);
});

document.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;
  const m=/^(?:Digit|Numpad)([1-9])$/.exec(e.code||'');
  if(!m||emEdicao(e.target))return;
  if(SOBREPOSTOS.some(sel=>{const p=S.$(sel);return p&&!p.hidden}))return;
  const tela=S.slides[S.atual()];
  if(!tela||!tela.matches(SEL_TELA))return;
  const n=parseInt(m[1],10);
  if(n>passosDe(tela).length)return;
  e.preventDefault();
  if(e.repeat||repetido(tela,n))return;
  alternar(tela,n,e.shiftKey);
});

/* ---------- ajuste de densidade: texto grande quando cabe, degraus até o piso quando não cabe ---------- */
/** Algum nome/detalhe de passo não cabe na linha do passo? */
function passosEstouram(tela){
  const k=S.escala||1;
  return passosDe(tela).some(p=>{
    const ac=S.$('.passo-ac',p), tx=S.$('.passo-txt',p);
    return !!(ac&&tx)&&tx.getBoundingClientRect().height>ac.getBoundingClientRect().height-2*k;
  });
}

/** A condução (abrir · se travar · fechar) transborda o card? */
function conducaoEstoura(tela){
  const et=S.$('.dinamica-etapas',tela);
  return !!et&&et.scrollHeight>et.clientHeight+1;
}

/**
 * O CSS já traz o tamanho cheio (passo 30px, apoio 26px); se o texto do conteúdo não couber, desce em degraus de 1px até o piso
 * (passo 28px, apoio 24px) via data-ajuste-*; ainda sem caber nos passos, o 3º degrau omite o detalhe (opcional). Abaixo do piso não
 * mexe na fonte: a auditoria acusa e o texto deve ser cortado.
 * Só mede tela aberta (display:none não tem geometria).
 */
function ajustarTexto(tela){
  if(!tela||!tela.classList.contains('active'))return;
  delete tela.dataset.ajustePasso;
  delete tela.dataset.ajusteApoio;
  for(let n=1;n<=3&&passosEstouram(tela);n++)tela.dataset.ajustePasso=String(n);
  for(let n=1;n<=2&&conducaoEstoura(tela);n++)tela.dataset.ajusteApoio=String(n);
}

/* ---------- ciclo de vida ---------- */
function sincronizarDica(tela){
  const n=tela.querySelector('.dinamica-dica-n');
  const qtd=passosDe(tela).length;
  if(n&&qtd)n.textContent=qtd>1?'1–'+qtd:'1';
}

function montarDesfazer(tela){
  const topo=tela.querySelector('.dinamica-cab-topo');   // linha do kicker: a linha dos passos já é estreita
  if(!topo||topo.querySelector('.dinamica-desfazer'))return;
  const b=el('button','dinamica-desfazer','Desfazer');
  b.type='button';
  b.hidden=true;
  b.setAttribute('aria-label','Desfazer a última mudança de passo');
  topo.insertBefore(b,topo.querySelector('.dinamica-dica'));
}

function iniciar(){
  const lista=telas();
  if(!lista.length)return;                       // a tela não existe neste deck: nada a fazer
  try{tabela=S.dados.tabela('progresso')}catch(e){tabela=null}   // esperado falhar se a camada de dados/esquema faltar
  if(tabela)tabela.on(origem=>{                  // 'local' | 'arquivo' | 'servidor': só repinta, o foco não se perde
    if(origem&&origem!=='local')desfazeres.clear();   // a base mudou por fora: o instantâneo ficou velho
    pintarTodas();
  });
  const obs=new MutationObserver(muts=>{
    new Set(muts.map(m=>m.target.closest&&m.target.closest(SEL_TELA)).filter(Boolean)).forEach(t=>{montarResumo(t);sincronizarDica(t)});
  });
  lista.forEach(tela=>{
    montarResumo(tela);
    montarDesfazer(tela);
    sincronizarDica(tela);
    pintar(tela);
    obs.observe(tela,{subtree:true,attributes:true,attributeFilter:['data-min']});
  });
  setInterval(sincronizarPausa,400);
  ajustarTexto(S.slides[S.atual()]);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{const t=S.slides[S.atual()];if(t&&t.matches(SEL_TELA))ajustarTexto(t)});
}

S.on('pronto',iniciar);
S.on('slide',e=>{const t=e.detail&&e.detail.slide;if(t&&t.matches(SEL_TELA)){ajustarTexto(t);pintar(t)}});

S.dinamica={alternar,desfazer,estado:id=>estadosDe(id)};
})();
