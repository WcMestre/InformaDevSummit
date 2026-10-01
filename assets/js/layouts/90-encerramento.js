/* ==========================================================================
   90 · LAYOUT encerramento (variante "resumo") — resumo (manhã 11:55 e dia 16:55) lido ao vivo dos CSV.
   Só leitura: nada aqui grava. Relê as tabelas da camada de dados (SUMMIT.dados) e mostra
     · Decisões      — propostas (tabela "propostas", coluna proposta = id da tela de layout "proposta"). Sem data-proposta: TODAS as propostas de
                       blocos ANTERIORES a esta tela, na ordem do deck (descoberta automática em SUMMIT.slides; rótulo = nome do bloco da proposta).
                       1 proposta = card "<Bloco> · proposta" (veredito grande, mãos, ajuste); 2 ou mais = lista compacta, uma linha por proposta
                       (Aceita · Ajustada · Recusada · Sem decisão, sempre ícone + rótulo; "Ajuste" só se a decisão é ajustar; mãos rotuladas).
                       Com data-proposta (retrocompatível) lê só aquela proposta, no card único.
     · Compromissos  — linhas de "decisoes" dos assuntos de blocos ANTERIORES a esta tela, agrupadas por assunto, com Responsável e Prazo (D+N sobre data-referencia); assunto que não casa com nenhum bloco continua aparecendo
     · Sugestões     — total de anotações e as 3 mais votadas (tabela "anotacoes"; empate pela ordem de registro; sem votos, as 3 primeiras).
                       data-assunto-sugestoes="<assunto>" lê um assunto só (rótulo "Sugestões da <bloco>", ex.: "Sugestões da Pipeline" na manhã);
                       data-assunto-sugestoes="todos" (valor especial) agrega as anotações de TODOS os assuntos de blocos ANTERIORES a esta tela
                       (rótulo "Dúvidas e sugestões do dia"; cada item leva o rótulo curto do assunto de origem)
     · Brainstorming — só números agregados (tabela "brainstorming"); nunca participante nem nada por pessoa
     · Antes de sair — 3 conferências com estado ao vivo (compromissos completos · todas as propostas com decisão registrada · CSV gravado ou baixado)
   Quando atualiza: ao abrir a tela (summit:slide), ao concluir o carregamento (summit:pronto), em tabela.on() de cada
   tabela lida e em SUMMIT.dados.aoMudar() (estado da pasta/CSV). Cada região guarda uma "assinatura" do que mostra e só
   mexe no DOM quando ela muda. Todo texto digitado entra por textContent; nenhum innerHTML com dado.
   Texto longo: ajuste, sugestões e (na tabela) ação e responsável são encurtados aqui na última PALAVRA inteira que cabe + "…"
   (encaixar; só uma palavra maior que a linha é cortada por caractere), para não sobrar recorte na tela.
   Compromissos: o assunto com pendência (grupo incompleto) vem antes do completo (empate: ordem do deck) e, dentro de cada assunto, o que
   falta (sem responsável ou prazo) vem primeiro. Lista longa (mais de LINHAS_UMA_COLUNA linhas, grupos incluídos): DUAS COLUNAS de assuntos
   lado a lado (data-comp-colunas na tela; responsável e prazo empilhados), balanceadas por altura, para caber sem rolar. Acima do que cabe:
   densidade "compacta", rolagem interna (a região é focável: ↓ ↑ PageDown PageUp Home End rolam; Esc solta o foco) e o indicador "+N abaixo".
   Ligação com o quadro: SUMMIT.quadro.analisarPrazo() (D+N); sem ele, cálculo próprio igual.
   Modelo/anatomia: conteudo/modelos/90-encerramento.html · tela real: conteudo/slides/60-fechamento-encerramento.html
   ========================================================================== */
(function(){
'use strict';
const S=window.SUMMIT;
if(!S||!S.dados)return;
const SEL='.slide[data-layout="encerramento"][data-variante="resumo"]';
const telas=S.slides.filter(el=>el.matches(SEL));
if(!telas.length)return;

const $=S.$, $$=S.$$;
const SVG='http://www.w3.org/2000/svg';
const ACOES=['aceitar','ajustar','recusar'];
const VEREDITO={
  aceitar:{rot:'Aceita',ico:'check'},
  ajustar:{rot:'Ajustada',ico:'ajustar'},
  recusar:{rot:'Recusada',ico:'x'}
};
const ROT_MAOS={aceitar:'Aceitar',ajustar:'Ajustar',recusar:'Recusar'};
const ROT_TIPO={sugestao:'',duvida:'Dúvida',risco:'Risco'};
const TOP_SUGESTOES=3;
const MAX_AJUSTE=240;          // teto de caracteres lidos do ajuste antes de encaixar na tela
const MAX_TEXTO=300;
const LINHAS_UMA_COLUNA=6;     // compromissos + assuntos acima disso: dois blocos de assuntos lado a lado (a tela da manhã, com 6, fica em uma coluna)

/* ---------- utilidades ---------- */
const texto=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
const inteiro=v=>{const n=parseInt(v,10);return n>0?n:0};
const plural=(n,um,varios)=>n===1?um:varios;
const semAcento=s=>texto(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const maiuscula=t=>t?t.charAt(0).toUpperCase()+t.slice(1):t;
const pad2=n=>String(n).padStart(2,'0');

function criar(tag,classe,txt){
  const e=document.createElement(tag);
  if(classe)e.className=classe;
  if(txt!=null)e.textContent=txt;
  return e;
}
function icone(nome){
  const s=document.createElementNS(SVG,'svg'),u=document.createElementNS(SVG,'use');
  s.setAttribute('class','ico');s.setAttribute('aria-hidden','true');s.setAttribute('focusable','false');
  u.setAttribute('href','#i-'+nome);s.appendChild(u);
  return s;
}
function trocarIcone(svg,nome){
  const u=svg&&svg.querySelector('use');
  if(u&&u.getAttribute('href')!=='#i-'+nome)u.setAttribute('href','#i-'+nome);
}
function tabelaDe(nome){try{return S.dados.tabela(nome)}catch(e){console.error('[encerramento] '+e.message);return null}}
const linhasDe=t=>t?t.linhas():[];

/* ---------- datas (UTC, como o quadro) ---------- */
/** AAAA-MM-DD ou dd/mm/aaaa → ISO válido (2000–2099) ou ''. */
function paraIso(v){
  v=texto(v);
  if(!v)return '';
  let a,m,d,r;
  if((r=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v))){a=+r[1];m=+r[2];d=+r[3]}
  else if((r=/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(v))){d=+r[1];m=+r[2];a=+r[3]}
  else return '';
  const t=new Date(Date.UTC(a,m-1,d));
  if(a<2000||a>2099||t.getUTCFullYear()!==a||t.getUTCMonth()!==m-1||t.getUTCDate()!==d)return '';
  return a+'-'+pad2(m)+'-'+pad2(d);
}
/** Dias entre a referência e o prazo (D+N). Usa a análise do quadro quando disponível. */
function diasApos(iso,ref){
  if(!iso||!ref)return null;
  const q=S.quadro&&S.quadro.analisarPrazo;
  if(q){const an=q(iso,ref);return an?an.dias:null}
  const p=s=>{const x=s.split('-');return Date.UTC(+x[0],+x[1]-1,+x[2])};
  return Math.round((p(iso)-p(ref))/86400000);
}
const dataBr=iso=>iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
const rotuloDias=n=>'D'+(n<0?'-':'+')+Math.abs(n);

/* ---------- assuntos: rótulo legível e ordem do deck ---------- */
/* casa o 'assunto' do CSV (ex.: "operacao-inovacao") com o bloco do deck, ignorando acento, caixa e hífen/sublinhado */
const chaveAssunto=v=>semAcento(v).replace(/[-_]+/g,' ').trim();
function blocoDoAssunto(chave){
  const k=chaveAssunto(chave);
  return S.blocos.find(b=>b.id===chave||chaveAssunto(b.nome)===k||chaveAssunto(b.curto)===k)||null;
}
/* escopo: esta tela só confere assuntos de blocos ANTERIORES ao seu (o Fechamento da manhã não cobra os compromissos da tarde) */
function indiceDoMeuBloco(secao){
  const b=S.blocos.find(x=>x.id===secao.dataset.bloco);
  return b?S.blocos.indexOf(b):Infinity;
}
function rotuloAssunto(chave){
  const b=blocoDoAssunto(chave);
  if(b&&b.nome)return b.nome;
  return chave?maiuscula(texto(chave)):'Sem assunto';
}
const ordemAssunto=chave=>{const b=blocoDoAssunto(chave);return b?S.blocos.indexOf(b):1000};
/* propostas: telas de layout "proposta" do deck, na ordem das telas; o rótulo é o nome do bloco em que a proposta vive */
const indiceDoBloco=id=>{const i=S.blocos.findIndex(b=>b.id===id);return i<0?Infinity:i};
function rotuloDaProposta(el){
  const b=S.blocos.find(x=>x.id===el.dataset.bloco);
  if(b&&b.nome)return b.nome;
  return rotuloAssunto(el.dataset.assunto||el.dataset.bloco||'');
}

/* ---------- encaixar texto: encurta com "…" até caber (sem recorte na tela) ---------- */
/** Põe `full` em `el` e, se passar de `linhas` linha(s), corta na última PALAVRA inteira que cabe + "…".
 *  Só quando nem a primeira palavra cabe (palavra maior que a linha) corta por caractere. Oculto (sem medida): só põe o texto. */
function encaixar(el,full,linhas){
  el.textContent=full;
  if(!el.clientWidth)return;
  const cabe=linhas>1?()=>el.scrollHeight<=el.clientHeight+1:()=>el.scrollWidth<=el.clientWidth+1;
  if(cabe())return;
  const pal=full.split(' '), ate=n=>pal.slice(0,n).join(' ').replace(/[\s,;:.\-–—]+$/,'')+'…';
  let lo=0,hi=pal.length-1;                       // maior nº de palavras (1..n-1) que cabe com a reticência
  while(lo<hi){
    const meio=Math.ceil((lo+hi)/2);
    el.textContent=ate(meio);
    if(cabe())lo=meio;else hi=meio-1;
  }
  if(lo>0){el.textContent=ate(lo);return}
  lo=0;hi=full.length;                            // último recurso: uma palavra só já passa da linha
  while(lo<hi){
    const meio=Math.ceil((lo+hi)/2);
    el.textContent=full.slice(0,meio).trimEnd()+'…';
    if(cabe())lo=meio;else hi=meio-1;
  }
  el.textContent=lo>0?full.slice(0,lo).trimEnd()+'…':'…';
}

/* ==========================================================================
   Uma tela "resumo"
   ========================================================================== */
function criarResumo(secao){
  const idProposta=secao.dataset.proposta||'';     // opcional: com ele, só esta proposta; sem ele, todas as dos blocos anteriores
  const assuntoSugRaw=secao.dataset.assuntoSugestoes||'pipeline';
  const assuntoSug=semAcento(assuntoSugRaw);
  const sugTodos=assuntoSug==='todos';                // valor especial: todas as anotações dos assuntos de blocos anteriores a esta tela
  const referencia=paraIso(secao.dataset.referencia||'');
  const q=(sel)=>$(sel,secao);
  const campo=(raiz,nome)=>$('[data-campo="'+nome+'"]',raiz);

  const tabs={
    propostas:tabelaDe('propostas'),decisoes:tabelaDe('decisoes'),
    anotacoes:tabelaDe('anotacoes'),brainstorming:tabelaDe('brainstorming')
  };

  /* referências de DOM */
  const cVersao=q('.encerramento-versao'), cBrain=q('.encerramento-brain'), cSug=q('.encerramento-sug'),
        cComp=q('.encerramento-comp'), cAntes=q('.encerramento-antes'), colEsq=q('.encerramento-esq');
  if(!cVersao||!cBrain||!cSug||!cComp||!cAntes||!colEsq){console.error('[encerramento] estrutura incompleta em '+(secao.id||'tela'));return null}
  const unica=campo(cVersao,'unica'), listaProps=campo(cVersao,'props'), rotDecisao=campo(cVersao,'decisao-rotulo'),
        totalDecisao=campo(cVersao,'decisao-total'), rotSug=campo(cSug,'sug-rotulo');
  const rolagem=campo(cComp,'tabela'), tbl=campo(cComp,'tab'), tbody=campo(cComp,'linhas'),
        vazioComp=campo(cComp,'comp-vazio'), contador=campo(cComp,'contador'),
        mais=$('[data-acao="rolar"]',cComp), maisTxt=campo(cComp,'mais');
  /* duas colunas (lista longa): uma segunda tabela, irmã da primeira e com o mesmo cabeçalho; só aparece com data-comp-colunas */
  const tbl2=tbl.cloneNode(true);
  tbl2.removeAttribute('data-campo');tbl2.hidden=true;tbl2.classList.add('encerramento-tab--2');
  const tbody2=tbl2.querySelector('tbody');
  tbody2.removeAttribute('data-campo');tbody2.replaceChildren();
  const cap2=tbl2.querySelector('caption');
  if(cap2)cap2.textContent=cap2.textContent+' (continuação, segunda coluna)';   // leitor de tela: as duas tabelas são uma lista só, lida em ordem
  tbl.classList.add('encerramento-tab--1');
  tbl.after(tbl2);
  rolagem.setAttribute('data-rolagem','');
  /* a região da tabela é focável (rola pelo teclado, sem depender de mouse); o HTML já declara, aqui só garante */
  if(!rolagem.hasAttribute('tabindex'))rolagem.tabIndex=0;
  if(!rolagem.hasAttribute('role'))rolagem.setAttribute('role','region');
  if(!rolagem.hasAttribute('aria-label'))rolagem.setAttribute('aria-label','Compromissos');

  const cache={};          // região → assinatura do que está na tela
  const ajustesVersao=[], itensSug=[], itensTab=[], itensProps=[];   // {el, full, linhas}: textos encaixados, refeitos quando a tela aparece ou muda de tamanho
  let renderizando=false, medindo=false;

  /* medidas (densidade, "+N", encaixe do texto) valem também com a tela oculta: ela é exibida SEM pintar (visibility:hidden) só durante a
     medida, na mesma largura do palco. Assim o dado que chega com outra tela aberta, ou a auditoria, já encontram tudo encaixado. */
  function medirOculta(fn){
    if(secao.clientWidth>0)return fn();
    secao.setAttribute('data-medindo','');
    try{return fn()}finally{secao.removeAttribute('data-medindo')}
  }
  function registrar(lista,el,full,linhas){lista.push({el,full,linhas});encaixar(el,full,linhas)}

  /* ---------- leitura (modelos puros, sem DOM) ---------- */
  const limiteBloco=indiceDoMeuBloco(secao);
  /* as propostas desta tela: a de data-proposta (retrocompatível) ou todas as dos blocos ANTERIORES, na ordem do deck */
  function telasDeProposta(){
    const todas=S.slides.filter(el=>el.dataset.layout==='proposta');
    if(idProposta)return todas.filter(el=>el.id===idProposta);
    return todas.filter(el=>indiceDoBloco(el.dataset.bloco)<limiteBloco);
  }
  function lerDecisoes(){
    const linhas=linhasDe(tabs.propostas);
    const itens=telasDeProposta().map(el=>{
      const l=linhas.find(x=>x.proposta===el.id)||{};
      const decisao=ACOES.includes(l.decisao)?l.decisao:'';
      return {
        rotulo:rotuloDaProposta(el),
        decisao,
        maos:{aceitar:inteiro(l.votos_aceitar),ajustar:inteiro(l.votos_ajustar),recusar:inteiro(l.votos_recusar)},
        ajuste:decisao==='ajustar'?texto(l.ajuste).slice(0,MAX_AJUSTE):''   // o texto do ajuste só vale quando a decisão é "ajustar"
      };
    });
    return {
      modo:itens.length===0?'nenhum':itens.length===1?'unico':'lista',
      itens,total:itens.length,decididas:itens.filter(x=>x.decisao).length
    };
  }
  function lerCompromissos(){
    const itens=linhasDe(tabs.decisoes).map(l=>{
      const prazoBruto=texto(l.prazo), iso=paraIso(prazoBruto), resp=texto(l.responsavel);
      const d=iso?diasApos(iso,referencia):null;
      return {
        assunto:texto(l.assunto).toLowerCase(),
        item:texto(l.item).slice(0,MAX_TEXTO), resp:resp.slice(0,MAX_TEXTO),
        prazo:iso?dataBr(iso):'', dias:d==null?'':rotuloDias(d), prazoInvalido:!!prazoBruto&&!iso,
        completo:!!resp&&!!iso
      };
    }).filter(c=>c.item||c.resp||c.prazo||c.prazoInvalido)
      .filter(c=>!blocoDoAssunto(c.assunto)||ordemAssunto(c.assunto)<limiteBloco);   // assunto sem bloco conhecido continua aparecendo (melhor ver do que esconder pendência); com bloco, só os anteriores a esta tela
    const grupos=[], porChave=new Map();
    itens.forEach(c=>{
      let g=porChave.get(c.assunto);
      if(!g){g={chave:c.assunto,rotulo:rotuloAssunto(c.assunto),ordem:ordemAssunto(c.assunto),pos:porChave.size,itens:[]};porChave.set(c.assunto,g);grupos.push(g)}
      g.itens.push(c);
    });
    /* dentro de cada assunto, o que falta (sem responsável ou sem prazo) vem primeiro; a ordem relativa de cada metade é a do CSV */
    grupos.forEach(g=>{
      const pend=g.itens.filter(c=>!c.completo), prontos=g.itens.filter(c=>c.completo);
      g.completos=prontos.length;
      g.itens=pend.concat(prontos);
    });
    /* entre os assuntos, o incompleto vem antes do completo (a pendência aparece primeiro, em cima e à esquerda); empate = ordem do deck */
    grupos.sort((a,b)=>(a.completos===a.itens.length)-(b.completos===b.itens.length)||a.ordem-b.ordem||a.pos-b.pos);
    return {grupos,total:itens.length,completos:itens.filter(c=>c.completo).length,colunas:itens.length+grupos.length>LINHAS_UMA_COLUNA};
  }
  /* rótulo do card: vem do modo. Um assunto só = "Sugestões da <nome do bloco>"; "todos" = "Dúvidas e sugestões do dia" */
  const tituloSug=sugTodos?'Dúvidas e sugestões do dia':'Sugestões da '+rotuloAssunto(assuntoSugRaw);
  /* rótulo curto do assunto de origem (data-bloco-curto); assunto sem bloco no deck mostra o próprio nome */
  function rotuloCurto(chave){
    const b=blocoDoAssunto(texto(chave).toLowerCase());
    return b?(b.curto||b.nome):maiuscula(texto(chave));
  }
  /* "todos": só anotações de assuntos de blocos ANTERIORES a esta tela (assunto sem bloco conhecido entra: melhor ver do que esconder) */
  function assuntoNoEscopo(chave){
    const b=blocoDoAssunto(texto(chave).toLowerCase());
    return !b||S.blocos.indexOf(b)<limiteBloco;
  }
  function lerSugestoes(){
    const todas=linhasDe(tabs.anotacoes)
      .filter(l=>texto(l.texto)&&(sugTodos?assuntoNoEscopo(l.assunto):semAcento(l.assunto)===assuntoSug))
      .map((l,i)=>({texto:texto(l.texto).slice(0,MAX_TEXTO),tipo:l.tipo,votos:inteiro(l.votos),i,assunto:sugTodos?rotuloCurto(l.assunto):''}));
    const top=todas.slice().sort((a,b)=>b.votos-a.votos||a.i-b.i).slice(0,TOP_SUGESTOES);
    return {total:todas.length,temVotos:todas.some(x=>x.votos>0),top:top.map(x=>({texto:x.texto,tipo:x.tipo,votos:x.votos,assunto:x.assunto}))};
  }
  function lerBrainstorming(){
    const ls=linhasDe(tabs.brainstorming).filter(l=>texto(l.texto)&&(l.tipo==='bom'||l.tipo==='melhorar'));
    const bom=ls.filter(l=>l.tipo==='bom').length, mel=ls.length-bom;
    return {total:ls.length,bom,melhorar:mel,crit3:ls.filter(l=>l.tipo==='melhorar'&&inteiro(l.criticidade)===3).length};
  }
  /* "Dados gravados em CSV": ok com pasta conectada e nada por gravar, ou, SEM pasta, quando nada está pendente
     (nenhuma tabela suja/salvando/em conflito/falha = tudo já exportado com Baixar CSV). Sujo sem pasta mantém o alerta. */
  function lerCsv(){
    let st=null;
    try{st=S.dados.estado()}catch(e){}
    const dica='Tecle D: conectar pasta ou Baixar CSV';
    if(!st)return {estado:'pendente',ico:'alerta',rot:dica};
    const ts=st.tabelas||[];
    if(ts.some(t=>t.conflito))return {estado:'pendente',ico:'alerta',rot:'Conflito no CSV · tecle D'};
    if(ts.some(t=>t.falhou))return {estado:'pendente',ico:'alerta',rot:'Falha ao gravar · tecle D'};
    const pendente=ts.some(t=>t.sujo||t.salvando);
    if(!st.conectada){
      if(pendente)return {estado:'pendente',ico:'alerta',rot:st.suportado?dica:'Tecle D: Baixar CSV'};
      return {estado:'ok',ico:'check',rot:'CSV baixado'};
    }
    if(!st.permissao)return {estado:'pendente',ico:'alerta',rot:'Reconectar a pasta · tecle D'};
    if(pendente)return {estado:'pendente',ico:'relogio',rot:'Gravando…'};
    return {estado:'ok',ico:'check',rot:'Gravado em '+(st.pasta||'pasta')+'/'};
  }

  /* ---------- pintura: só mexe no DOM quando a assinatura muda ---------- */
  const mudou=(chave,modelo)=>{const a=JSON.stringify(modelo);if(cache[chave]===a)return false;cache[chave]=a;return true};

  /* uma proposta: veredito grande, mãos, ajuste e dica (o aspecto do resumo da manhã) */
  const textoMaos=maos=>'Mãos: '+ACOES.map(k=>ROT_MAOS[k]+' '+maos[k]).join(' · ');
  const somaMaos=maos=>ACOES.reduce((a,k)=>a+maos[k],0);
  function pintarUnica(it){
    cVersao.dataset.estado=it.decisao||'vazio';
    const v=VEREDITO[it.decisao]||{rot:'Sem decisão',ico:'relogio'};
    trocarIcone(unica.querySelector('.encerramento-selo .ico'),v.ico);
    campo(unica,'veredito').textContent=v.rot;
    const maos=campo(unica,'maos'), soma=somaMaos(it.maos);
    maos.hidden=soma===0;
    maos.textContent=soma?textoMaos(it.maos):'';
    const aj=campo(unica,'ajuste');
    aj.hidden=!it.ajuste;
    aj.replaceChildren();
    if(it.ajuste){
      aj.appendChild(criar('span','encerramento-ajuste-rot','Ajuste'));
      aj.appendChild(document.createTextNode(' '));      // leitor de tela: "Ajuste" e o texto não colam
      const t=criar('span','encerramento-ajuste-txt');
      aj.appendChild(t);
      registrar(ajustesVersao,t,it.ajuste,2);
    }
    campo(unica,'dica').hidden=!!it.decisao;
  }
  /* várias propostas: lista compacta, uma linha por proposta (ícone + rótulo sempre; mãos e ajuste em linhas de apoio) */
  function pintarLista(m){
    listaProps.replaceChildren();
    m.itens.forEach(it=>{
      const v=VEREDITO[it.decisao]||{rot:'Sem decisão',ico:'relogio'};
      const li=criar('li','encerramento-prop');
      li.dataset.estado=it.decisao||'vazio';
      const selo=criar('span','encerramento-selo');
      selo.appendChild(icone(v.ico));
      li.appendChild(selo);
      li.appendChild(criar('span','encerramento-prop-nome',it.rotulo));
      li.appendChild(criar('span','encerramento-prop-veredito',v.rot));
      if(somaMaos(it.maos))li.appendChild(criar('span','encerramento-prop-maos',textoMaos(it.maos)));
      if(it.ajuste){
        const aj=criar('span','encerramento-prop-ajuste');
        aj.appendChild(criar('span','encerramento-ajuste-rot','Ajuste'));
        aj.appendChild(document.createTextNode(' '));
        const t=criar('span','encerramento-prop-ajuste-txt');
        aj.appendChild(t);
        li.appendChild(aj);
        itensProps.push({el:t,full:it.ajuste,linhas:1});
      }
      listaProps.appendChild(li);
    });
  }
  function pintarDecisoes(m){
    if(!mudou('decisoes',m))return;
    cVersao.hidden=m.modo==='nenhum';
    cVersao.dataset.modo=m.modo;
    colEsq.dataset.modo=m.modo;
    ajustesVersao.length=0;
    itensProps.length=0;
    unica.hidden=m.modo!=='unico';
    listaProps.hidden=m.modo!=='lista';
    totalDecisao.hidden=m.modo!=='lista';
    if(m.modo==='unico'){
      rotDecisao.textContent=m.itens[0].rotulo+' · proposta';
      cVersao.setAttribute('aria-label',m.itens[0].rotulo+': decisão da proposta');
      pintarUnica(m.itens[0]);
    }else if(m.modo==='lista'){
      const ok=m.decididas===m.total;
      rotDecisao.textContent='Propostas · decisões';
      cVersao.setAttribute('aria-label','Decisões das propostas');
      cVersao.dataset.estado=ok?'completo':'pendente';
      totalDecisao.dataset.estado=ok?'ok':'pendente';
      trocarIcone(totalDecisao.querySelector('.ico'),ok?'check':'alerta');
      $('span',totalDecisao).textContent=m.decididas+' de '+m.total+' com decisão';
      pintarLista(m);
    }
    itensProps.forEach(a=>encaixar(a.el,a.full,a.linhas));
  }
  /* densidade da coluna esquerda com várias propostas: começa com tudo (3 sugestões, mãos e ajuste de cada proposta) e, até caber, desce
     de degrau: menos sugestões (3 → 2 → 1), depois sem as linhas de mãos, por fim sem as de ajuste. Uma proposta só: nada muda. */
  const DEGRAUS_ESQ=[['',3],['',2],['',1],['sem-maos',3],['sem-maos',2],['sem-maos',1],['minima',1]];
  /* "Dúvidas e sugestões do dia" (todos): as 3 mais votadas valem mais que as mãos de cada proposta, então as mãos saem primeiro */
  const DEGRAUS_TODOS=[['',3],['sem-maos',3],['sem-maos',2],['minima',2],['minima',1]];
  function ajustarDensidadeEsq(){
    if(!colEsq.clientHeight)return;
    const lista=cVersao.dataset.modo==='lista';
    /* o card das sugestões ocupa o que sobra da coluna (1fr): seu conteúdo passar da própria altura = a coluna não cabe. Não usa o
       scrollHeight da coluna: o transform da entrada escalonada (.anim) o inflaria em 18 px enquanto a tela anima. */
    const cabe=()=>cSug.scrollHeight<=cSug.clientHeight+1;
    const degraus=sugTodos?DEGRAUS_TODOS:DEGRAUS_ESQ;
    for(let i=0;i<degraus.length;i++){
      const d=degraus[i][0], n=degraus[i][1];
      if(d)cVersao.setAttribute('data-densidade',d);else cVersao.removeAttribute('data-densidade');
      if(n<3)cSug.setAttribute('data-itens',String(n));else cSug.removeAttribute('data-itens');
      if(!lista||cabe())return;
    }
  }

  function pintarBrainstorming(m){
    if(!mudou('brain',m))return;
    campo(cBrain,'total').textContent=m.total;
    campo(cBrain,'total-rot').textContent=plural(m.total,'apontamento','apontamentos');
    campo(cBrain,'bom').textContent=m.bom;
    campo(cBrain,'melhorar').textContent=m.melhorar;
    const c=campo(cBrain,'crit');
    c.dataset.estado=m.crit3?'atencao':'neutro';
    $('span',c).textContent=m.crit3
      ?m.crit3+' '+plural(m.crit3,'melhoria com criticidade 3','melhorias com criticidade 3')
      :'Nenhuma melhoria com criticidade 3';
  }

  function pintarSugestoes(m){
    if(!mudou('sug',m))return;
    rotSug.textContent=tituloSug;
    cSug.setAttribute('aria-label',sugTodos?'Dúvidas e sugestões do dia: anotações da sala':tituloSug+': sugestões da sala');
    campo(cSug,'sug-total').textContent=m.total+' '+plural(m.total,'anotação','anotações');
    const lista=campo(cSug,'sug-lista'), vazio=campo(cSug,'sug-vazio');
    vazio.hidden=m.total>0;
    lista.hidden=m.total===0;
    lista.replaceChildren();
    lista.toggleAttribute('data-rotulado',sugTodos);
    itensSug.length=0;
    m.top.forEach((s,i)=>{
      const li=criar('li','encerramento-sug-item');
      li.appendChild(criar('span','encerramento-sug-n',String(i+1)));
      const t=criar('span','encerramento-sug-txt');
      li.appendChild(t);
      const tipo=ROT_TIPO[s.tipo];
      if(sugTodos){
        /* "todos": a linha de baixo diz de onde veio (assunto) e o tipo; o voto fica à direita da linha do texto */
        const meta=criar('span','encerramento-sug-meta');
        meta.appendChild(criar('span','encerramento-sug-assunto',s.assunto));
        if(tipo){meta.appendChild(document.createTextNode(' '));meta.appendChild(criar('span','encerramento-sug-tipo',tipo))}
        li.appendChild(meta);
      }else if(tipo)li.appendChild(criar('span','encerramento-sug-tipo',tipo));
      li.appendChild(criar('span','encerramento-sug-votos'+(s.votos?'':' encerramento-sug-votos--zero'),s.votos+' '+plural(s.votos,'voto','votos')));
      lista.appendChild(li);
      registrar(itensSug,t,s.texto,1);
    });
  }

  /* compromissos */
  function trGrupo(g){
    const tr=criar('tr','encerramento-grupo'), th=criar('th');
    th.scope='rowgroup';th.colSpan=3;
    const dentro=criar('div','encerramento-grupo-in');
    dentro.appendChild(criar('span','encerramento-grupo-nome',g.rotulo));
    dentro.appendChild(criar('span','encerramento-grupo-n',g.completos+' de '+g.itens.length+' '+plural(g.itens.length,'completo','completos')));
    th.appendChild(dentro);
    tr.appendChild(th);
    return tr;
  }
  function falta(rot){
    const s=criar('span','encerramento-falta');
    s.appendChild(icone('alerta'));
    s.appendChild(criar('span','',rot));
    return s;
  }
  function trLinha(c,colunas){
    const tr=criar('tr','encerramento-linha');
    tr.dataset.completo=c.completo?'sim':'nao';
    const tdA=criar('td','encerramento-acao'), tdR=criar('td','encerramento-resp'), tdP=criar('td','encerramento-prazo');
    const a=criar('span','encerramento-acao-txt'+(c.item?'':' encerramento-semacao'),c.item||'Ação não descrita');
    /* uma coluna: ação em até 2 linhas, responsável em 1; duas colunas (célula mais estreita): ação em até 3 e responsável em até 2 */
    if(c.item){a.title=c.item;itensTab.push({el:a,full:c.item,linhas:colunas?3:2})}
    tdA.appendChild(a);
    if(c.resp){const r=criar('span','encerramento-resp-txt',c.resp);r.title=c.resp;tdR.appendChild(r);itensTab.push({el:r,full:c.resp,linhas:colunas?2:1})}
    else tdR.appendChild(falta('a definir'));
    if(c.prazo){
      tdP.appendChild(criar('span','encerramento-data',c.prazo));
      if(c.dias)tdP.appendChild(criar('span','encerramento-dmais',c.dias));
    }else tdP.appendChild(falta(c.prazoInvalido?'data inválida':'a definir'));
    tr.append(tdA,tdR,tdP);
    return tr;
  }
  /* divide os assuntos (na ordem, sem partir nenhum) em dois blocos de altura parecida. Altura estimada em px: a linha do assunto 30; cada
     compromisso, o maior entre a ação (~25 caracteres por linha), o responsável (~15) + o prazo e duas linhas, a 26 px por linha */
  function repartirGrupos(grupos){
    if(grupos.length<2)return [grupos,[]];
    const linhas=c=>Math.max(2,Math.min(3,Math.ceil(c.item.length/25)),Math.min(3,Math.ceil(c.resp.length/15)+1));   // a ação mostra no máx. 3 linhas; o responsável 2 + o prazo
    const peso=g=>30+g.itens.reduce((a,c)=>a+linhas(c)*26+6,0);
    const total=grupos.reduce((a,g)=>a+peso(g),0);
    let melhor=1, menor=Infinity, esq=0;
    for(let k=1;k<grupos.length;k++){
      esq+=peso(grupos[k-1]);
      const maior=Math.max(esq,total-esq);
      if(maior<menor){menor=maior;melhor=k}
    }
    return [grupos.slice(0,melhor),grupos.slice(melhor)];
  }
  function pintarCompromissos(m){
    if(!mudou('comp',m))return;
    const ok=m.total>0&&m.completos===m.total;
    contador.dataset.estado=ok?'ok':'pendente';
    trocarIcone(contador.querySelector('.ico'),ok?'check':'alerta');
    $('span',contador).textContent=m.total
      ?m.completos+' de '+m.total+' '+plural(m.total,'compromisso completo','compromissos completos')
      :'Nenhum compromisso registrado';
    vazioComp.hidden=m.total>0;
    tbl.hidden=m.total===0;
    tbody.replaceChildren();
    tbody2.replaceChildren();
    itensTab.length=0;
    /* lista longa: dois blocos de assuntos lado a lado (esquerda primeiro: ali ficam as pendências); senão, uma coluna só */
    const partes=m.colunas?repartirGrupos(m.grupos):[m.grupos,[]];
    secao.toggleAttribute('data-comp-colunas',!!m.colunas&&m.total>0);
    tbl2.hidden=partes[1].length===0;
    partes.forEach((gs,k)=>gs.forEach(g=>{
      const dest=k?tbody2:tbody;
      dest.appendChild(trGrupo(g));
      g.itens.forEach(c=>dest.appendChild(trLinha(c,m.colunas)));
    }));
    medir();
    encaixarTabela();
  }
  /* depois da densidade (a fonte muda de 26 para 24 px): encurta ação e responsável na palavra inteira que cabe */
  function encaixarTabela(){
    if(!rolagem.clientHeight)return;
    itensTab.forEach(a=>encaixar(a.el,a.full,a.linhas));
  }

  /* densidade adaptativa + "+N compromissos abaixo" (mede sem pintar; tela oculta: nada a medir) */
  function medir(){
    if(medindo||!rolagem.clientHeight)return;
    medindo=true;
    try{
      cComp.removeAttribute('data-densidade');
      if(rolagem.scrollHeight>rolagem.clientHeight+1)cComp.setAttribute('data-densidade','compacta');
      const rb=rolagem.getBoundingClientRect(), esc=rb.height/(rolagem.clientHeight||1);
      let fora=0;
      $$('.encerramento-linha',rolagem).forEach(tr=>{if(tr.getBoundingClientRect().bottom>rb.bottom+2*esc)fora++});
      mais.hidden=fora===0;
      maisTxt.textContent='+'+fora+' abaixo';
      mais.setAttribute('aria-label',fora+' '+plural(fora,'compromisso abaixo','compromissos abaixo')+': rolar a tabela');
      rolagem.toggleAttribute('data-mais-baixo',fora>0);
    }finally{medindo=false}
  }
  let quadroAnim=0;
  function agendarMedir(){
    if(quadroAnim)return;
    quadroAnim=requestAnimationFrame(()=>{quadroAnim=0;refazerMedidas()});
  }
  rolagem.addEventListener('scroll',agendarMedir,{passive:true});
  mais.addEventListener('click',()=>{rolagem.scrollTop+=Math.round(rolagem.clientHeight*.8)});
  /* Teclado com a região focada (Tab): ↓ ↑ rolam uma linha; PageDown/PageUp, 80% da altura; Home/End, início/fim. As teclas só são
     tomadas se há o que rolar (senão seguem como atalhos do deck) e só com o foco na própria região. Tab sai; Esc solta o foco. */
  rolagem.addEventListener('keydown',e=>{
    if(e.target!==rolagem||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
    const k=e.key;
    if(k==='Escape'){rolagem.blur();return}
    const fim=rolagem.scrollHeight-rolagem.clientHeight;
    if(fim<=1)return;
    const linha=60, pagina=Math.round(rolagem.clientHeight*.8);
    const alvo=k==='ArrowDown'?rolagem.scrollTop+linha:k==='ArrowUp'?rolagem.scrollTop-linha
      :k==='PageDown'?rolagem.scrollTop+pagina:k==='PageUp'?rolagem.scrollTop-pagina
      :k==='Home'?0:k==='End'?fim:null;
    if(alvo==null)return;
    e.preventDefault();e.stopPropagation();
    rolagem.scrollTop=Math.max(0,Math.min(fim,alvo));
  });
  if(window.ResizeObserver){
    const ro=new ResizeObserver(agendarMedir);
    ro.observe(rolagem);ro.observe(secao);
  }

  /* antes de sair */
  /* "Todas as propostas com decisão registrada": uma proposta mostra o veredito dela; várias, "Pronto" ou quantas faltam */
  function rotuloPropostas(d){
    if(d.total===0)return {estado:'ok',ico:'check',rot:'Sem propostas'};
    if(d.total===1){
      const it=d.itens[0];
      return it.decisao?{estado:'ok',ico:'check',rot:VEREDITO[it.decisao].rot}:{estado:'pendente',ico:'alerta',rot:'Sem decisão'};
    }
    return d.decididas===d.total
      ?{estado:'ok',ico:'check',rot:'Pronto'}
      :{estado:'pendente',ico:'alerta',rot:'Faltam '+(d.total-d.decididas)};
  }
  function pintarAntes(comp,decisoes,csv){
    const estados={
      compromissos:comp.total===0
        ?{estado:'pendente',ico:'alerta',rot:'Nenhum registrado'}
        :(comp.completos===comp.total
          ?{estado:'ok',ico:'check',rot:'Pronto'}
          :{estado:'pendente',ico:'alerta',rot:'Faltam '+(comp.total-comp.completos)}),
      propostas:rotuloPropostas(decisoes),
      csv
    };
    if(!mudou('antes',estados))return;
    let prontos=0;
    $$('[data-check]',cAntes).forEach(li=>{
      const e=estados[li.dataset.check];
      if(!e)return;
      if(e.estado==='ok')prontos++;
      li.dataset.estado=e.estado;
      trocarIcone(li.querySelector('.ico'),e.ico);
      campo(li,'rotulo').textContent=e.rot;
    });
    const p=campo(cAntes,'prontos');
    p.textContent=prontos+' de 3 prontos';
    p.dataset.estado=prontos===3?'ok':'pendente';
  }

  /* ---------- ciclo ---------- */
  function renderizar(){
    if(renderizando)return;
    renderizando=true;
    try{
      medirOculta(()=>{
        const decisoes=lerDecisoes(), comp=lerCompromissos();
        pintarDecisoes(decisoes);
        pintarCompromissos(comp);
        pintarSugestoes(lerSugestoes());
        pintarBrainstorming(lerBrainstorming());
        ajustarDensidadeEsq();          // depois dos três cards da esquerda: a conta é da coluna inteira
        pintarAntes(comp,decisoes,lerCsv());
      });
    }catch(e){console.error('[encerramento] falha ao atualizar o resumo',e)}
    finally{renderizando=false}
  }
  /* refaz as medidas: densidade/"+N" da tabela, degrau da coluna esquerda e encaixe dos textos (também com a tela oculta) */
  function refazerMedidas(){
    medirOculta(()=>{
      medir();
      ajustesVersao.concat(itensSug,itensProps).forEach(a=>encaixar(a.el,a.full,a.linhas));
      ajustarDensidadeEsq();
      encaixarTabela();
    });
  }

  Object.keys(tabs).forEach(n=>{if(tabs[n])tabs[n].on(()=>renderizar())});
  S.dados.aoMudar(()=>renderizar());
  return {secao,renderizar,refazerMedidas};
}

const resumos=[];
telas.forEach(secao=>{
  try{const r=criarResumo(secao);if(r)resumos.push(r)}
  catch(e){console.error('[encerramento] falha ao montar '+(secao.id||'tela'),e)}
});

S.on('slide',ev=>{
  const aberta=ev.detail&&ev.detail.slide;
  resumos.forEach(r=>{
    if(r.secao!==aberta)return;
    r.renderizar();
    r.refazerMedidas();
    requestAnimationFrame(r.refazerMedidas);   // a tela acabou de aparecer: mede de novo
  });
});
S.on('pronto',()=>resumos.forEach(r=>{r.renderizar();r.refazerMedidas()}));
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>resumos.forEach(r=>r.refazerMedidas()));

S.encerramento={atualizar:()=>resumos.forEach(r=>{r.renderizar();r.refazerMedidas()})};
})();
