/* ==========================================================================
   90 · AUDITORIA — SUMMIT.auditar() confere cada tela contra a régua do projeto.
   Uso: abrir o HTML com ?auditar  (resultado no console)  ou, por script, await page.evaluate(()=>SUMMIT.auditar())
   Tipos de problema:
     fora-da-area   elemento fora da área útil do palco (margens seguras)
     recortado      contêiner com overflow oculto cortando conteúdo
     texto-pequeno  texto renderizado abaixo de 20px
     contraste      razão de contraste abaixo de 4.5:1 (3:1 para texto grande)
     marcador       sobrou marcador [[...]] no texto
   Itens em [data-decor] são ignorados.
   ========================================================================== */
(function(){
'use strict';
const S=window.SUMMIT;
const SAFE={x:112,t:128,b:112}, TOL=3, MIN_PX=20, BG_PIOR=[6,58,82]; // fundo mais claro do gradiente (#063a52)

const parse=c=>{const m=c.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}};
const comp=(f,b)=>({r:f.r*f.a+b.r*(1-f.a),g:f.g*f.a+b.g*(1-f.a),b:f.b*f.a+b.b*(1-f.a),a:1});
const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b)};
const razao=(a,b)=>{const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)};

function fundoEfetivo(el){
  const cadeia=[];
  for(let e=el;e&&e.nodeType===1;e=e.parentElement){const c=parse(getComputedStyle(e).backgroundColor);if(c&&c.a>0)cadeia.push(c)}
  let base={r:BG_PIOR[0],g:BG_PIOR[1],b:BG_PIOR[2],a:1};
  for(let i=cadeia.length-1;i>=0;i--)base=comp(cadeia[i],base);
  return base;
}
const ignorado=el=>!!el.closest('[data-decor],.sr-only,svg');
/* [data-rolagem] = contêiner com rolagem interna intencional: ele e o que está dentro não contam como "fora da área"/"recortado" */
const emRolagem=el=>!!el.closest('[data-rolagem]');
const visivel=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0};
const temTextoDireto=el=>Array.from(el.childNodes).some(n=>n.nodeType===3&&n.nodeValue.trim().length);

S.auditar=function(){
  const stage=S.$('#stage'); stage.classList.add('sem-anim');
  const original=S.atual(), k=S.escala||1, sr=stage.getBoundingClientRect();
  const rel=r=>({l:(r.left-sr.left)/k,r:(r.right-sr.left)/k,t:(r.top-sr.top)/k,b:(r.bottom-sr.top)/k});
  const relatorio=[];

  S.slides.forEach((slide,i)=>{
    S.ir(i,{silencioso:true});
    /* alguns layouts só ajustam o texto quando a tela abre ('summit:slide'); a auditoria precisa medir a tela já ajustada */
    try{document.dispatchEvent(new CustomEvent('summit:slide',{detail:{indice:i,slide:slide,anterior:i-1,auditoria:true}}))}catch(e){}
    const prob=[], vistos=new Set();
    const add=(tipo,detalhe,el)=>{
      const ch=tipo+'|'+detalhe; if(vistos.has(ch))return; vistos.add(ch);
      prob.push({tipo,detalhe,no:el?(el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\s+/).join('.'):'')):''});
    };

    const els=Array.from(slide.querySelectorAll('*')).filter(e=>!ignorado(e)&&visivel(e));
    els.forEach(el=>{
      const cs=getComputedStyle(el);
      // 1) área útil
      if(!el.closest('[data-sangra]')&&!emRolagem(el)){
        const r=rel(el.getBoundingClientRect());
        const fora=[];
        if(r.l<SAFE.x-TOL)fora.push('esquerda '+Math.round(SAFE.x-r.l)+'px');
        if(r.r>1920-SAFE.x+TOL)fora.push('direita '+Math.round(r.r-(1920-SAFE.x))+'px');
        if(r.t<SAFE.t-TOL)fora.push('topo '+Math.round(SAFE.t-r.t)+'px');
        if(r.b>1080-SAFE.b+TOL)fora.push('base '+Math.round(r.b-(1080-SAFE.b))+'px');
        if(fora.length)add('fora-da-area',fora.join(', '),el);
      }
      // 2) recorte por overflow
      if(/(hidden|clip|auto|scroll)/.test(cs.overflowX+cs.overflowY)&&!emRolagem(el)){
        if(el.scrollHeight>el.clientHeight+TOL||el.scrollWidth>el.clientWidth+TOL)
          add('recortado','conteúdo '+el.scrollWidth+'×'+el.scrollHeight+' em caixa '+el.clientWidth+'×'+el.clientHeight,el);
      }
      // 3) texto pequeno e 4) contraste (só nós com texto direto)
      if(temTextoDireto(el)){
        const fs=parseFloat(cs.fontSize);
        const amostra=Array.from(el.childNodes).filter(n=>n.nodeType===3).map(n=>n.nodeValue.trim()).join(' ').slice(0,40);
        if(fs<MIN_PX-.01)add('texto-pequeno',fs.toFixed(1)+'px · "'+amostra+'"',el);
        if(/\[\[.*\]\]/.test(amostra))add('marcador','"'+amostra+'"',el);
        const fg=parse(cs.color);
        if(fg){
          const op=parseFloat(cs.opacity)||1;
          const bg=fundoEfetivo(el), fgc=comp({...fg,a:fg.a*op},bg);
          const grande=fs>=24||(fs>=18.66&&parseInt(cs.fontWeight)>=700);
          const min=grande?3:4.5, rz=razao(fgc,bg);
          if(rz<min)add('contraste',rz.toFixed(2)+':1 (mín '+min+') · "'+amostra+'"',el);
        }
      }
    });
    if(slide.scrollHeight>slide.clientHeight+TOL)add('recortado','slide rola: '+slide.scrollHeight+' > '+slide.clientHeight,slide);
    if(slide.scrollWidth>slide.clientWidth+TOL)add('recortado','slide rola na horizontal',slide);

    relatorio.push({indice:i+1,id:slide.id||'',layout:slide.dataset.layout||'',modelo:slide.hasAttribute('data-modelo'),problemas:prob});
  });

  stage.classList.remove('sem-anim');
  S.ir(original,{silencioso:true});
  const comProblema=relatorio.filter(r=>r.problemas.length);
  const resumo={telas:relatorio.length,comProblema:comProblema.length,problemas:comProblema.reduce((a,r)=>a+r.problemas.length,0),modelos:relatorio.filter(r=>r.modelo).length};
  if(typeof console!=='undefined'){
    console.log('[auditoria] '+JSON.stringify(resumo));
    comProblema.forEach(r=>console.warn('[auditoria] tela '+r.indice+' ('+r.layout+' · '+r.id+')',r.problemas));
  }
  return {resumo,relatorio};
};

if(/[?&]auditar\b/.test(location.search))S.on('pronto',()=>setTimeout(()=>{window.__auditoria=S.auditar()},300));
})();
