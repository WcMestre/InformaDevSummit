/* ==========================================================================
   10 · NÚCLEO — escala do palco, navegação, trilha do dia, cronômetro, visão geral.
   Expõe window.SUMMIT. Scripts de layout (js/4x-*.js) escutam o evento 'summit:slide'.
   ========================================================================== */
(function(){
'use strict';

const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const pad = n=>String(n).padStart(2,'0');
const fmt = s=>{const a=Math.abs(Math.round(s));return (s<0?'+':'')+pad(Math.floor(a/60))+':'+pad(a%60)};

/* ---------- armazenamento (localStorage com queda segura p/ memória) ---------- */
const NS='informa-summit-2026:', mem={};
const store={
  get(k,def){try{const v=localStorage.getItem(NS+k);if(v!==null)return JSON.parse(v)}catch(e){} return (k in mem)?mem[k]:def},
  set(k,v){mem[k]=v;try{localStorage.setItem(NS+k,JSON.stringify(v))}catch(e){}},
  del(k){delete mem[k];try{localStorage.removeItem(NS+k)}catch(e){}},
  chaves(prefixo){let r=[];try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(NS+(prefixo||'')))r.push(k.slice(NS.length))}}catch(e){} return r}
};

const stage=$('#stage'), deck=$('#deck');
const slides=$$('.slide',deck);
const tot=slides.length;
let cur=-1, iniciado=false;

/* ---------- escala do palco (1920×1080 → janela) ---------- */
function escalar(){
  const s=Math.min(innerWidth/1920, innerHeight/1080);
  stage.style.setProperty('--s', s);
  SUMMIT.escala=s;
}

/* ---------- blocos do dia (metadados nos slides de abertura de bloco) ---------- */
const blocos=[], blocoPorId={};
slides.forEach((el,i)=>{
  const d=el.dataset, id=d.bloco||'(sem-bloco)';
  let b=blocoPorId[id];
  if(!b){b=blocoPorId[id]={id,nome:'',curto:'',ini:'',min:0,apres:0,def:0,tipo:'',slides:[]};blocos.push(b)}
  if(d.blocoNome)b.nome=d.blocoNome;
  if(d.blocoCurto)b.curto=d.blocoCurto;
  if(d.blocoIni)b.ini=d.blocoIni;
  if(d.blocoMin)b.min=+d.blocoMin;
  if(d.blocoApres)b.apres=+d.blocoApres;   // minutos de apresentação (conteúdo exposto)
  if(d.blocoDef)b.def=+d.blocoDef;         // minutos de definições (dinâmica, registro, decisão)
  if(d.blocoTipo)b.tipo=d.blocoTipo;   // "pausa" | "intocavel"
  b.slides.push(i);
});
blocos.forEach(b=>{b.nome=b.nome||b.id;b.curto=b.curto||b.nome});

const trilha=$('#trilha'), segs=[];
function montarTrilha(){
  trilha.innerHTML='';segs.length=0;
  blocos.forEach(b=>{
    const el=document.createElement('div');
    el.className='trilha-seg'+(b.tipo==='pausa'?' pausa':'')+(b.tipo==='intocavel'?' intocavel':'');
    el.style.flex=(b.min||1)+' 1 0';
    el.innerHTML='<span class="fill"></span><span class="tx"></span>';
    el.querySelector('.tx').textContent=(b.ini?b.ini+' · ':'')+b.curto;
    el.title=b.nome+(b.ini?' · '+b.ini:'')+(b.min?' · '+b.min+' min':'');
    trilha.appendChild(el);segs.push(el);
  });
  /* rótulo em 3 níveis conforme o espaço: "09:00 · Nome" → só "09:00" → oculto */
  requestAnimationFrame(()=>segs.forEach((el,i)=>{
    const b=blocos[i], tx=el.querySelector('.tx'), cabe=()=>tx.scrollWidth<=el.clientWidth-28;
    el.classList.remove('estreito');
    tx.textContent=(b.ini?b.ini+' · ':'')+b.curto;
    if(!cabe()&&b.ini)tx.textContent=b.ini;
    el.classList.toggle('estreito',!cabe());
  }));
}

/* ---------- navegação ---------- */
function ir(n,opt){
  opt=opt||{};
  n=Math.max(0,Math.min(tot-1,n|0));
  const ant=cur; cur=n;
  slides.forEach((s,i)=>s.classList.toggle('active',i===n));
  const el=slides[n], b=blocoPorId[el.dataset.bloco||'(sem-bloco)'];
  stage.dataset.chrome = el.dataset.chrome || (el.dataset.layout==='capa'?'off':'on');
  $('#cur').textContent=pad(n+1);
  $('#blocoNome').textContent=b?(b.curto||b.nome):'';   // rótulo CURTO na moldura: nome longo trunca ao lado do chip CSV
  $('#barra').style.width=((n+1)/tot*100)+'%';
  const bi=blocos.indexOf(b);
  segs.forEach((s,i)=>{
    s.classList.toggle('feito',i<bi); s.classList.toggle('atual',i===bi);
    const f=s.querySelector('.fill');
    if(i===bi&&b){f.style.width=((b.slides.indexOf(n)+1)/b.slides.length*100)+'%'} else f.style.width='';
  });
  if(!opt.silencioso){
    try{history.replaceState(null,'','#/'+(n+1))}catch(e){}
    store.set('pos',n);
    document.dispatchEvent(new CustomEvent('summit:slide',{detail:{indice:n,slide:el,anterior:ant}}));
  }
}
const proximo=()=>ir(cur+1), anterior=()=>ir(cur-1);

/* índice pedido pelo hash (#/5 ou #id-da-tela); null se não houver/for inválido. Hash malformado (#%) usa o texto cru. */
function indiceDoHash(){
  let h=location.hash||'';
  try{h=decodeURIComponent(h)}catch(e){}
  h=h.replace(/^#\/?/,'');
  if(/^\d+$/.test(h))return (+h-1);
  if(h){const i=slides.findIndex(s=>s.id===h);if(i>=0)return i}
  return null;
}
function posInicial(){
  const i=indiceDoHash();if(i!==null)return i;
  const p=store.get('pos',0);return (typeof p==='number'&&p>=0&&p<tot)?p:0;
}
/* mexer no hash da barra de endereço navega (ir() usa replaceState, que não dispara este evento) */
addEventListener('hashchange',()=>{const i=indiceDoHash();if(i!==null&&iniciado&&Math.max(0,Math.min(tot-1,i))!==cur)ir(i)});

/* ---------- cronômetro ---------- */
/* orig/origTela = tempo com que o cronômetro partiu (passo ou tela) e em que tela: o R volta a ele; escondido = Shift+T só esconde, o relógio segue */
const C={vis:false,run:false,total:600,rest:600,t0:0,timer:null,orig:0,origTela:-1,escondido:false};
const restanteAgora=()=>C.run?C.rest-(performance.now()-C.t0)/1000:C.rest;
function renderCron(){
  const box=$('#cron');
  box.hidden=!C.vis; stage.classList.toggle('com-cron',C.vis);   // com-cron: a barra superior cede espaço (esconde o nome do bloco)
  if(!C.vis)return;
  const r=restanteAgora();
  $('#cronTempo').textContent=fmt(r);
  box.classList.toggle('rodando',C.run);
  box.classList.toggle('estourado',r<=0);
  box.classList.toggle('alerta',r>0&&r<=Math.max(120,C.total*.2));
  $('#cronIco').innerHTML='<use href="#i-'+(C.run?'pause':'play')+'"/>';
  $('#cronRot').textContent=r<=0?'além do tempo':(C.run?'em curso':'pausado');
}
function tempoDaTela(){return (+slides[cur].dataset.min||0)*60}
function alternarCron(){
  if(!C.vis&&C.escondido){C.vis=true;C.escondido=false}   // reexibe o que o Shift+T escondeu, sem reiniciar
  else if(!C.vis){definirCron(tempoDaTela()||600);return}
  else if(C.run){C.rest=restanteAgora();C.run=false}
  else{C.t0=performance.now();C.run=true}
  if(!C.timer)C.timer=setInterval(renderCron,250);
  renderCron();
}
function reiniciarCron(){
  if(!C.vis)return alternarCron();
  C.total=C.rest=(C.orig&&C.origTela===cur)?C.orig:(tempoDaTela()||C.total); C.t0=performance.now(); renderCron();
}
function ajustarCron(seg){
  if(!C.vis)return;
  C.rest=restanteAgora()+seg; C.total=Math.max(60,C.total+seg); C.t0=performance.now(); renderCron();
}
function ocultarCron(){C.vis=false;C.run=false;C.escondido=false;renderCron()}
/* Shift+T: só esconde; o tempo continua correndo e o próximo T reexibe no ponto em que está */
function esconderCron(){if(C.vis){C.vis=false;C.escondido=true;renderCron()}}
function pausarCron(){if((C.vis||C.escondido)&&C.run){C.rest=restanteAgora();C.run=false;renderCron()}}
/* define o cronômetro para `seg` segundos e já inicia (usado por passos de dinâmica, pausas etc.) */
function definirCron(seg){
  C.vis=true;C.escondido=false;C.total=C.rest=C.orig=Math.max(0,seg|0);C.origTela=cur;C.t0=performance.now();C.run=true;
  if(!C.timer)C.timer=setInterval(renderCron,250);
  renderCron();
}

/* ---------- relógio real ---------- */
let relogioOn=false, relogioTimer=null;
function pintaRelogio(){$('#relogio').textContent=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
function alternarRelogio(){
  relogioOn=!relogioOn; $('#relogio').hidden=!relogioOn;
  if(relogioOn){pintaRelogio();relogioTimer=setInterval(pintaRelogio,1000)}else clearInterval(relogioTimer);
}

/* ---------- visão geral ---------- */
const visao=$('#visao'); let selOv=0;
const visaoAberta=()=>!visao.hidden;
function abrirVisao(){
  visao.hidden=false; selOv=cur;
  visao.innerHTML='<header class="visao-cab"><h2>Visão geral</h2><div class="sub-v">'+tot+' telas · setas navegam · Enter abre · Esc fecha</div></header><div class="visao-grade"></div>';
  const g=$('.visao-grade',visao);
  slides.forEach((s,i)=>{
    const b=document.createElement('button');b.type='button';b.className='miniatura'+(i===cur?' atual-mini':'')+(i===selOv?' sel':'');
    const m=document.createElement('div');m.className='moldura-mini';
    const c=s.cloneNode(true);
    c.classList.add('active','sem-anim');c.removeAttribute('id');c.setAttribute('inert','');
    $$('[id]',c).forEach(x=>x.removeAttribute('id'));
    $$('[contenteditable]',c).forEach(x=>x.removeAttribute('contenteditable'));
    m.appendChild(c);b.appendChild(m);
    const l=document.createElement('div');l.className='legenda';
    l.innerHTML='<b>'+pad(i+1)+'</b><span></span>';l.lastChild.textContent=(s.dataset.layout||'')+(s.hasAttribute('data-modelo')?' · modelo':'');
    b.appendChild(l);b.addEventListener('click',()=>{fecharVisao();ir(i)});g.appendChild(b);
  });
  requestAnimationFrame(()=>{
    const w=$('.moldura-mini',visao).clientWidth;
    $$('.moldura-mini>.slide',visao).forEach(c=>c.style.transform='scale('+(w/1920)+')');
    const sel=$$('.miniatura',visao)[selOv];if(sel)sel.scrollIntoView({block:'center'});
  });
}
function fecharVisao(){visao.hidden=true;visao.innerHTML=''}
function moverSelVisao(d){
  const itens=$$('.miniatura',visao);if(!itens.length)return;
  itens[selOv].classList.remove('sel');
  selOv=Math.max(0,Math.min(itens.length-1,selOv+d));
  itens[selOv].classList.add('sel');itens[selOv].scrollIntoView({block:'nearest'});
}

/* ---------- ajuda, apagão, tela cheia, ir-para ---------- */
const ajuda=$('#ajuda'), apagao=$('#apagao');
const alternarAjuda=()=>{ajuda.hidden=!ajuda.hidden};
const alternarApagao=()=>{apagao.hidden=!apagao.hidden};
function telaCheia(){
  try{ if(!document.fullscreenElement)document.documentElement.requestFullscreen(); else document.exitFullscreen(); }catch(e){}
}
/* modo G: "Ir para a tela: 14_" fica visível enquanto se digita (Enter vai, Esc cancela) */
let gBuf=null;
const irPara=$('#irPara');
function definirG(v){
  gBuf=v;
  if(!irPara)return;
  irPara.hidden=v===null;
  if(v!==null)$('#irParaN',irPara).textContent=v+'_';
}
function fecharTudo(){
  if(visaoAberta())fecharVisao(); else if(!ajuda.hidden)ajuda.hidden=true; else if(!apagao.hidden)apagao.hidden=true; else definirG(null);
}

/* ---------- teclado ---------- */
const emEdicao=t=>!!(t&&t.closest&&t.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));
/* modo de entrada: o Chrome liga :focus-visible ao primeiro keydown, então ele não distingue "cliquei no botão" de "cheguei nele por Tab".
   Mouse/toque (pointerdown) = 'mouse'; Tab/setas = 'teclado'. Começa em teclado: foco posto por script (ex.: painel de dados) é do botão. */
let modoMouse=false;
['pointerdown','mousedown'].forEach(ev=>document.addEventListener(ev,()=>{modoMouse=true},true));
const SO_MODIFICADOR=['Shift','Control','Alt','Meta','AltGraph','CapsLock'];
document.addEventListener('keydown',e=>{
  const k=e.key||'';
  if(k==='Tab'||k.startsWith('Arrow'))modoMouse=false;
  if(e.ctrlKey||e.metaKey||e.altKey||SO_MODIFICADOR.includes(k))return;
  if(emEdicao(e.target)){ if(k==='Escape')e.target.blur(); return; }
  /* botão/link focado POR TECLADO: Espaço e Enter pertencem a ele. Foco deixado por um clique de mouse não conta:
     solta o botão e o deck segue (senão o Espaço que o facilitador aperta para avançar refaria o clique: +1 mão, passo desmarcado) */
  if((k===' '||k==='Enter')&&e.target&&e.target.closest&&e.target.closest('button,a[href],summary,[role="button"]')){
    if(!modoMouse)return;
    e.target.blur();
    if(k==='Enter')e.preventDefault();
  }
  if(gBuf!==null){
    if(k==='Escape'){definirG(null);e.preventDefault();return}
    if(/^\d$/.test(k)){if(gBuf.length<3)definirG(gBuf+k);e.preventDefault();return}
    if(k==='Enter'){const n=gBuf;definirG(null);if(n)ir(+n-1);e.preventDefault();return}
    definirG(null);
  }
  if(visaoAberta()){
    if(k==='ArrowRight')moverSelVisao(1); else if(k==='ArrowLeft')moverSelVisao(-1);
    else if(k==='ArrowDown')moverSelVisao(4); else if(k==='ArrowUp')moverSelVisao(-4);
    else if(k==='Enter'){fecharVisao();ir(selOv)}
    else if(k==='Escape'||k.toLowerCase()==='o')fecharVisao(); else return;
    e.preventDefault();return;
  }
  const kl=k.toLowerCase();   // atalhos de letra não dependem de Caps Lock; Shift é lido por e.shiftKey
  if(!ajuda.hidden||!apagao.hidden){ if(k==='Escape'||k==='?'||kl==='b'){ if(!ajuda.hidden&&kl!=='b')alternarAjuda(); else if(!apagao.hidden)alternarApagao(); e.preventDefault(); } return; }
  if(['ArrowRight','PageDown',' '].includes(k)){e.preventDefault();proximo()}
  else if(['ArrowLeft','PageUp'].includes(k)){e.preventDefault();anterior()}
  else if(k==='Home'){e.preventDefault();ir(0)}
  else if(k==='End'){e.preventDefault();ir(tot-1)}
  else if(kl==='t'){if(e.shiftKey)esconderCron(); else alternarCron()}
  else if(kl==='f')telaCheia();
  else if(kl==='o')abrirVisao();
  else if(kl==='r')reiniciarCron();
  else if(k==='+'||k==='=')ajustarCron(60);
  else if(k==='-'||k==='_')ajustarCron(-60);
  else if(kl==='h')alternarRelogio();
  else if(kl==='b')alternarApagao();
  else if(kl==='g')definirG('');
  else if(k==='?')alternarAjuda();
  else if(k==='Escape')fecharTudo();
});

/* gestos de toque */
let tx=0;
document.addEventListener('touchstart',e=>{tx=e.touches[0].clientX},{passive:true});
document.addEventListener('touchend',e=>{
  if(emEdicao(e.target)||visaoAberta())return;
  const dx=e.changedTouches[0].clientX-tx; if(Math.abs(dx)>60){dx<0?proximo():anterior()}
},{passive:true});

/* dica de teclas some sozinha; cursor some em tela cheia quando parado */
const dica=$('#dica'); const esconderDica=()=>dica.classList.add('some');
setTimeout(esconderDica,8000); document.addEventListener('keydown',esconderDica,{once:true});
let cursorT=null;
document.addEventListener('mousemove',()=>{
  stage.classList.remove('cursor-oculto'); clearTimeout(cursorT);
  cursorT=setTimeout(()=>{if(document.fullscreenElement)stage.classList.add('cursor-oculto')},3000);
});
addEventListener('resize',escalar);
document.addEventListener('fullscreenchange',()=>setTimeout(escalar,50));

/* ---------- início (chamado por js/99-iniciar.js, depois dos scripts de layout) ---------- */
function iniciar(){
  if(iniciado)return; iniciado=true;
  $('#tot').textContent=pad(tot);
  escalar(); montarTrilha();
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{montarTrilha();ir(cur,{silencioso:true})});
  try{ir(posInicial())}
  finally{document.dispatchEvent(new CustomEvent('summit:pronto',{detail:{total:tot}}))}   // os layouts iniciam mesmo se a posição falhar
}

const SUMMIT=window.SUMMIT={
  slides,blocos,store,ir,proximo,anterior,iniciar,escala:1,
  atual:()=>cur, total:()=>tot,
  cron:{alternar:alternarCron,reiniciar:reiniciarCron,ajustar:ajustarCron,ocultar:ocultarCron,pausar:pausarCron,definir:definirCron,estado:()=>({vis:C.vis,run:C.run,escondido:C.escondido,restante:restanteAgora(),total:C.total})},
  abrirVisao,fecharVisao,
  on:(ev,fn)=>document.addEventListener('summit:'+ev,fn),
  $,$$,pad
};
})();
