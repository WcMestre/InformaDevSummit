/* ==========================================================================
   56 · BRAINSTORM — comportamento do layout 'brainstorm'.
   Lê e grava SOMENTE por SUMMIT.dados.tabela('brainstorming') (colunas: rodada · participante · tipo · texto · criticidade).
   O HTML (conteudo/modelos/56-brainstorm.html) traz o esqueleto; este arquivo:
     - renderiza as duas colunas e a faixa de progresso por participante (DOM com chaves: só toca no que mudou,
       então re-renderizar nunca tira o foco de quem está digitando). A faixa mostra só o ESTADO de cada pessoa
       (completo = check, parcial = anel vazio): nunca nome junto de número; números só agregados, sem nomear;
     - registra pela barra de entrada (Enter adiciona e mantém participante e tipo; clicar no participante seleciona tudo);
     - edita inline (texto e criticidade) e remove com confirmação em dois cliques;
     - DENSIDADE ADAPTATIVA: mede as listas e escolhe o nível mais legível em que o conjunto cabe (1 coluna -> 2 -> 3,
       texto de 26px até 22px); o que não couber rola, com aviso "+N mais abaixo/acima" e degradê;
     - modo VER TODOS (botão, tecla V; volta com o mesmo controle, V ou Esc): recolhe entrada e progresso para a sala ler o conjunto;
     - reage a tabela.on() (origem 'local' | 'arquivo' | 'servidor') e aos eventos 'summit:slide' e 'summit:pronto'.
   Nada é interpretado como HTML: todo texto digitado entra por textContent / value.
   Expõe window.SUMMIT.brainstorm = { tabela, montar, atualizar }.
   ========================================================================== */
(function(){
'use strict';
const S=window.SUMMIT;
if(!S)return;

const TABELA='brainstorming';
const SELETOR='.slide[data-layout="brainstorm"]';
const TIPOS=['bom','melhorar'];
const ROTULO={bom:'O que fazemos bem',melhorar:'O que podemos melhorar'};
const MAX_TEXTO=160;
const PLACEHOLDER_PARTICIPANTE='Pessoa (sigla)';   // incentiva iniciais/P1, P2: nome completo projetado expõe a pessoa
const LIMITE_COMPACTO=8;     // acima disto os chips de progresso ficam compactos
const NIVEL_MAX=4;           // densidades 0 (amplo) … 4 (denso); ver o CSS. No modo normal o 4 (3 colunas) não é usado
const NIVEL_MAX_NORMAL=3;
const MS_ARMADO=3500;        // tempo em que "Remover" espera a confirmação
const MS_NOVO=1800;          // destaque do item recém-adicionado
const NS_SVG='http://www.w3.org/2000/svg';

const instancias=new WeakMap();   // <section> -> instância

/* ---------- utilidades ---------- */
/** Texto limpo para o CSV: sem controles/quebras, espaços colapsados. */
const limpar=s=>String(s==null?'':s).replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim();
/** Chave de comparação de participante: sem acento, sem caixa. */
const chave=s=>limpar(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const nivelDe=v=>{const n=parseInt(v,10);return n>=1&&n<=3?n:0};

function no(tag,classe,texto){
  const e=document.createElement(tag);
  if(classe)e.className=classe;
  if(texto!=null)e.textContent=texto;
  return e;
}
function icone(nome){
  const s=document.createElementNS(NS_SVG,'svg'),u=document.createElementNS(NS_SVG,'use');
  s.setAttribute('class','ico');s.setAttribute('aria-hidden','true');
  u.setAttribute('href','#i-'+nome);s.appendChild(u);
  return s;
}
function definirTexto(el,valor){if(el.textContent!==valor)el.textContent=valor}
function definirAttr(el,nome,valor){if(el.getAttribute(nome)!==valor)el.setAttribute(nome,valor)}

function criarPips(nivel){
  const e=no('span','brainstorm-crit');
  e.setAttribute('role','img');
  for(let i=0;i<3;i++)e.appendChild(no('span'));
  ajustarPips(e,nivel);
  return e;
}
function ajustarPips(e,nivel){
  e.dataset.nivel=String(nivel);
  definirAttr(e,'aria-label','Criticidade '+nivel+' de 3');
}

function criarRadioSeg(nome,valor,texto,marcado,rotuloAria){
  const l=no('label'),i=no('input','brainstorm-radio');
  i.type='radio';i.name=nome;i.value=valor;i.checked=marcado;
  if(rotuloAria)i.setAttribute('aria-label',rotuloAria);
  l.append(i,no('span','brainstorm-seg brainstorm-seg--melhorar',texto));
  return l;
}

function botao(classe,texto,ico){
  const b=no('button','brainstorm-btn '+classe);
  b.type='button';
  if(ico)b.appendChild(icone(ico));
  b.appendChild(document.createTextNode(texto));
  return b;
}

/* ---------- uma tela brainstorm ---------- */
function montar(secao){
  if(instancias.has(secao))return instancias.get(secao);
  const form=secao.querySelector('.brainstorm-entrada');
  if(!form||!S.dados)return null;

  const tabela=S.dados.tabela(TABELA);
  const rodada=limpar(secao.dataset.rodada)||'1';
  const meta=Math.max(1,parseInt(secao.dataset.meta,10)||3);
  const uid=secao.id||('brainstorm-'+Math.random().toString(36).slice(2,7));

  const q=s=>secao.querySelector(s), qa=s=>Array.from(secao.querySelectorAll(s));
  const campoPart=q('[data-campo="participante"]'), campoTexto=q('[data-campo="texto"]');
  const radiosTipo=qa('.brainstorm-entrada [data-campo="tipo"]'), radiosCrit=qa('.brainstorm-entrada [data-campo="criticidade"]');
  const grupoCrit=q('.brainstorm-campo--criticidade');
  const sugestoes=q('[data-brainstorm-sugestoes]');
  const chips=q('.brainstorm-chips'), chipExemplo=q('.brainstorm-pessoa--exemplo');
  const resumo=q('[data-brainstorm-resumo]'), status=q('[data-brainstorm-status]');
  const areaColunas=q('.brainstorm-colunas'), instrucao=q('.brainstorm-instrucao');
  const colunas={};
  TIPOS.forEach(t=>{
    const col=q('.brainstorm-col[data-tipo="'+t+'"]');
    if(!col)return;
    const lista=col.querySelector('.brainstorm-lista');
    if(!lista)return;
    /* a <ul> vira o conteúdo (em N colunas internas, empacotadas) de um contêiner rolável: só assim as colunas internas
       crescem na vertical e o excedente rola, em vez de estourar para o lado. Rótulo, foco e [data-rolagem] vão para o rolável. */
    let rol=lista.parentElement;
    if(!rol.classList.contains('brainstorm-rolagem')){
      rol=no('div','brainstorm-rolagem');
      lista.replaceWith(rol);rol.appendChild(lista);
    }
    rol.setAttribute('role','region');rol.tabIndex=0;rol.setAttribute('data-rolagem','');
    const rotulo=lista.getAttribute('aria-label');
    if(rotulo){rol.setAttribute('aria-label',rotulo);lista.removeAttribute('aria-label')}
    lista.removeAttribute('tabindex');lista.removeAttribute('data-rolagem');
    colunas[t]={
      col,rol,lista,
      n:col.querySelector('[data-brainstorm-n]'),
      rot:col.querySelector('[data-brainstorm-n-rot]'),
      exemplo:col.querySelector('.brainstorm-item--exemplo'),
      cima:no('span','brainstorm-mais brainstorm-mais--cima'),
      baixo:no('span','brainstorm-mais brainstorm-mais--baixo')
    };
  });
  if(!campoPart||!campoTexto||!areaColunas||!colunas.bom||!colunas.melhorar)return null;

  /* avisos "+N mais acima/abaixo" (só visuais: a lista rolável já é focável e rotulada) */
  TIPOS.forEach(t=>{
    const c=colunas[t];
    [c.cima,c.baixo].forEach(e=>{e.hidden=true;e.setAttribute('aria-hidden','true');e.append(icone('seta'),no('span','brainstorm-mais-txt'))});
    c.col.append(c.cima,c.baixo);
  });

  /* botão "Ver todos": usa o do HTML ([data-brainstorm-todos]) ou cria (telas antigas não trazem) */
  let btnTodos=q('[data-brainstorm-todos]'),infoTodos=q('[data-brainstorm-todos-info]');
  if(!btnTodos&&instrucao){
    const acoes=no('p','brainstorm-acoes');
    btnTodos=botao('brainstorm-btn--todos','','quadro');
    btnTodos.dataset.brainstormTodos='';btnTodos.setAttribute('aria-pressed','false');
    btnTodos.append(no('span','brainstorm-todos-rot','Ver todos'),no('kbd',null,'V'));
    acoes.appendChild(btnTodos);instrucao.appendChild(acoes);
  }
  if(!infoTodos&&instrucao){infoTodos=no('p','brainstorm-todos-info');infoTodos.hidden=true;infoTodos.dataset.brainstormTodosInfo='';instrucao.prepend(infoTodos)}
  const rotTodos=btnTodos&&btnTodos.querySelector('.brainstorm-todos-rot'),teclaTodos=btnTodos&&btnTodos.querySelector('kbd');
  if(chips)chips.setAttribute('data-rolagem','');      // faixa de chips com rolagem intencional (mais de 3 linhas)
  campoPart.placeholder=PLACEHOLDER_PARTICIPANTE;

  /* ids/names únicos por tela: o HTML do modelo não traz nenhum */
  if(sugestoes){sugestoes.id=uid+'-participantes';campoPart.setAttribute('list',sugestoes.id)}
  radiosTipo.forEach(r=>{r.name=uid+'-tipo'});
  radiosCrit.forEach(r=>{r.name=uid+'-criticidade'});
  qa('[data-brainstorm-rodada]').forEach(e=>{e.textContent=rodada});
  qa('[data-brainstorm-meta]').forEach(e=>{e.textContent=String(meta)});

  const itens=new Map();       // id da linha -> {li,corpo,quem,texto,crit,tipo}
  const pessoas=new Map();     // chave do participante -> {el,selo,nome,bom,melhorar}
  let editando=null;           // {id,li,form,ta,crit}
  let armado=null;             // {id,btn,timer}
  let primeira=true;           // a 1ª renderização não anima "novo"
  let nomesSugeridos='';
  let todos=false;             // modo "Ver todos": entrada e progresso recolhidos, listas ocupam a área toda
  let ajusteAgendado=false;

  /* ----- leitura ----- */
  const tipoAtual=()=>{const r=radiosTipo.find(x=>x.checked);return r?r.value:'bom'};
  const critAtual=()=>{const r=radiosCrit.find(x=>x.checked);return r?r.value:'2'};

  function anunciar(msg){if(status){status.textContent='';status.textContent=msg}}

  /** Reaproveita a grafia já gravada ("joao" -> "João" se "João" já existe). */
  function nomeCanonico(digitado){
    const k=chave(digitado);
    const achada=tabela.linhas().find(l=>chave(l.participante)===k);
    return achada?limpar(achada.participante):limpar(digitado);
  }

  /* ----- erro de preenchimento (rótulo do campo muda: não depende só de cor) ----- */
  function sinalizar(campo){
    const cx=campo.closest('.brainstorm-campo'),rot=cx&&cx.querySelector('.brainstorm-campo-rot');
    if(!cx||!rot)return;
    if(!rot.dataset.original)rot.dataset.original=rot.textContent;
    rot.textContent=rot.dataset.erro||('Preencha · '+rot.dataset.original);
    cx.classList.add('brainstorm-campo--erro');
    campo.setAttribute('aria-invalid','true');
    campo.focus();
  }
  function limparErro(campo){
    const cx=campo.closest('.brainstorm-campo'),rot=cx&&cx.querySelector('.brainstorm-campo-rot');
    if(!cx||!cx.classList.contains('brainstorm-campo--erro'))return;
    cx.classList.remove('brainstorm-campo--erro');
    campo.removeAttribute('aria-invalid');
    if(rot&&rot.dataset.original)rot.textContent=rot.dataset.original;
  }

  /* ----- barra de entrada ----- */
  function sincronizarTipo(){grupoCrit.hidden=tipoAtual()!=='melhorar'}

  function adicionar(){
    const nome=limpar(campoPart.value),texto=limpar(campoTexto.value).slice(0,MAX_TEXTO);
    if(!nome){sinalizar(campoPart);return}
    if(!texto){sinalizar(campoTexto);return}
    const tipo=tipoAtual(),participante=nomeCanonico(nome);
    tabela.adicionar({rodada,participante,tipo,texto,criticidade:tipo==='melhorar'?critAtual():''});
    campoPart.value=participante;                     // mantém participante e tipo
    campoTexto.value='';
    const padrao=radiosCrit.find(r=>r.value==='2');if(padrao)padrao.checked=true;
    colunas[tipo].rol.scrollTop=0;                  // o mais novo fica no topo da coluna
    marcarAtual();
    anunciar('Apontamento de '+participante+' adicionado em '+ROTULO[tipo]+'.');
    campoTexto.focus();
  }

  /* ----- edição inline ----- */
  function abrirEdicao(id){
    const it=itens.get(id);
    if(!it)return;
    if(editando){
      if(editando.id===id){editando.ta.focus();return}
      if(!fecharEdicao(true))return;     // texto inválido na edição anterior: ela continua aberta
    }
    const linha=tabela.obter(id);
    if(!linha)return;
    const f=no('form','brainstorm-edicao');
    f.noValidate=true;
    const ta=no('textarea','brainstorm-input brainstorm-input--area');
    ta.rows=2;ta.maxLength=MAX_TEXTO;ta.value=linha.texto;
    ta.setAttribute('aria-label','Texto do apontamento');
    f.appendChild(ta);

    const l=no('div','brainstorm-edicao-linha');
    let segCrit=null;
    if(linha.tipo==='melhorar'){
      segCrit=no('div','brainstorm-segmento brainstorm-segmento--crit');
      segCrit.setAttribute('role','radiogroup');segCrit.setAttribute('aria-label','Criticidade');
      const atual=String(nivelDe(linha.criticidade)||2);
      [['1','baixa'],['2','média'],['3','alta']].forEach(([v,nome])=>
        segCrit.appendChild(criarRadioSeg(uid+'-edit-crit',v,v,v===atual,'Criticidade '+v+' de 3, '+nome)));
      l.appendChild(segCrit);
    }
    l.appendChild(no('span','brainstorm-edicao-espaco'));
    const salvar=botao('brainstorm-btn--forte','Salvar');salvar.type='submit';
    const cancelar=botao('','Cancelar');cancelar.dataset.acao='cancelar';
    const remover=botao('brainstorm-btn--perigo','Remover','x');remover.dataset.acao='remover';
    remover.setAttribute('aria-label','Remover apontamento de '+linha.participante+': '+linha.texto);
    l.append(salvar,cancelar,remover);
    f.appendChild(l);

    const quem=no('span','brainstorm-quem',linha.participante);quem.title=linha.participante;
    it.li.classList.add('brainstorm-item--editando');
    it.li.replaceChildren(quem,f);
    editando={id,li:it.li,form:f,ta,crit:segCrit};
    ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);
    it.li.scrollIntoView({block:'nearest'});
  }

  /** Fecha a edição; com salvar=true grava se o texto for válido e mudou. Devolve false se o texto inválido mantém a edição aberta. */
  function fecharEdicao(salvar){
    if(!editando)return true;
    const e=editando,it=itens.get(e.id);
    let patch=null;
    if(salvar&&it){
      const texto=limpar(e.ta.value).slice(0,MAX_TEXTO);
      if(!texto){e.ta.setAttribute('aria-invalid','true');e.ta.focus();return false}
      patch={texto};
      if(e.crit){const r=Array.from(e.crit.querySelectorAll('input')).find(x=>x.checked);if(r)patch.criticidade=r.value}
    }
    desarmar();
    editando=null;
    if(it){it.li.classList.remove('brainstorm-item--editando');it.li.replaceChildren(it.corpo)}
    if(patch){
      tabela.atualizar(e.id,patch);
      anunciar('Apontamento atualizado.');
    }
    return true;
  }

  /* ----- remoção em dois cliques (sem confirm()) ----- */
  function desarmar(){
    if(!armado)return;
    clearTimeout(armado.timer);
    const b=armado.btn;
    if(b&&b.isConnected){delete b.dataset.armado;b.lastChild.textContent='Remover';b.setAttribute('aria-label',armado.rotulo)}
    armado=null;
  }
  function pedirRemocao(btn){
    if(!editando)return;
    if(armado&&armado.btn===btn){remover(editando.id);return}
    desarmar();
    const rotulo=btn.getAttribute('aria-label');
    btn.dataset.armado='sim';
    btn.lastChild.textContent='Confirmar';
    btn.setAttribute('aria-label','Confirmar a remoção: '+rotulo.replace(/^Remover /,''));
    armado={id:editando.id,btn,rotulo,timer:setTimeout(desarmar,MS_ARMADO)};
  }
  function remover(id){
    const it=itens.get(id);
    if(!it)return;
    const vizinho=[it.li.nextElementSibling,it.li.previousElementSibling].find(e=>e&&e.dataset&&e.dataset.id);
    const idVizinho=vizinho?vizinho.dataset.id:null;
    desarmar();
    editando=null;
    tabela.remover(id);                               // a renderização tira o <li>
    const alvo=idVizinho&&itens.get(idVizinho);
    (alvo?alvo.corpo:campoTexto).focus();
    anunciar('Apontamento removido.');
  }

  /* ----- renderização (chaves: não recria o que não mudou) ----- */
  function criarItem(linha){
    const li=no('li','brainstorm-item');
    li.dataset.id=linha.id;li.dataset.tipo=linha.tipo;
    const corpo=no('button','brainstorm-item-corpo');
    corpo.type='button';
    const quem=no('span','brainstorm-quem'),texto=no('span','brainstorm-texto');
    corpo.append(quem,document.createTextNode(' '),texto);   // o espaço é a oportunidade de quebra entre etiqueta e texto (densidades em fluxo)
    let crit=null;
    if(linha.tipo==='melhorar'){crit=criarPips(0);corpo.appendChild(crit)}
    li.appendChild(corpo);
    return {li,corpo,quem,texto,crit,tipo:linha.tipo};
  }
  function atualizarItem(it,l){
    const nivel=it.crit?nivelDe(l.criticidade):0;
    definirTexto(it.quem,l.participante);definirAttr(it.quem,'title',l.participante);
    definirTexto(it.texto,l.texto);
    if(it.crit)ajustarPips(it.crit,nivel);
    definirAttr(it.corpo,'aria-label','Editar apontamento de '+l.participante+': '+l.texto+(it.crit?'. Criticidade '+nivel+' de 3':''));
  }

  function sincronizarLista(tipo,linhas){
    const c=colunas[tipo],vivos=new Set(linhas.map(l=>l.id));
    itens.forEach((it,id)=>{
      if(it.tipo!==tipo||vivos.has(id))return;
      if(editando&&editando.id===id){editando=null;desarmar()}
      it.li.remove();itens.delete(id);
    });
    let ref=c.lista.firstElementChild;
    linhas.forEach(l=>{
      let it=itens.get(l.id);
      if(!it){
        it=criarItem(l);itens.set(l.id,it);
        if(!primeira){
          it.li.classList.add('brainstorm-item--novo');
          setTimeout(()=>it.li.classList.remove('brainstorm-item--novo'),MS_NOVO);
        }
      }
      atualizarItem(it,l);
      if(it.li===ref)ref=ref.nextElementSibling;else c.lista.insertBefore(it.li,ref);
    });
    if(c.exemplo)c.exemplo.hidden=linhas.length>0;
    definirTexto(c.n,String(linhas.length));
    if(c.rot)definirTexto(c.rot,linhas.length===1?'item':'itens');
  }

  /** Degradê + "+N mais acima/abaixo": N = apontamentos que não estão inteiros na vista. */
  function marcarRolagem(tipo){
    const c=colunas[tipo],ul=c.rol;
    if(!ul.clientHeight)return;                       // tela fechada (display:none): nada a medir
    const topo=ul.scrollTop,base=topo+ul.clientHeight;
    let cima=0,baixo=0;
    Array.from(c.lista.children).forEach(li=>{
      if(!li.dataset.id||li.hidden)return;
      const a=li.offsetTop,b=a+li.offsetHeight;
      if(a<topo-2)cima++;else if(b>base+2)baixo++;
    });
    ul.toggleAttribute('data-mais-cima',cima>0);
    ul.toggleAttribute('data-mais-baixo',baixo>0);
    [[c.cima,cima,'acima'],[c.baixo,baixo,'abaixo']].forEach(([el,n,lado])=>{
      el.hidden=n===0;
      if(n)definirTexto(el.lastChild,'+'+n+' mais '+lado);
    });
  }
  const marcarTodasRolagens=()=>TIPOS.forEach(marcarRolagem);

  /* ----- densidade adaptativa ----- */
  /** Escolhe o nível mais legível (menor) em que as duas listas cabem sem rolar; se nenhum couber, o que sobra menos. */
  function ajustarDensidade(){
    ajusteAgendado=false;
    if(!TIPOS.every(t=>colunas[t].rol.clientHeight>0))return;   // tela fechada
    const maximo=todos?NIVEL_MAX:NIVEL_MAX_NORMAL;
    const sobra=()=>Math.max(...TIPOS.map(t=>{const u=colunas[t].rol;return u.scrollHeight-u.clientHeight}));
    let escolhido=0,menor=Infinity;
    for(let n=0;n<=maximo;n++){
      areaColunas.dataset.densidade=String(n);
      const s=sobra();
      if(s<=2){escolhido=n;menor=0;break}
      if(s<menor){menor=s;escolhido=n}
    }
    areaColunas.dataset.densidade=String(escolhido);
    marcarTodasRolagens();
  }
  /** Adia para o próximo quadro e junta pedidos (digitar, redimensionar e re-renderizar podem chegar juntos). */
  function agendarAjuste(){
    if(ajusteAgendado)return;
    ajusteAgendado=true;
    requestAnimationFrame(ajustarDensidade);
  }

  /* ----- modo "Ver todos" ----- */
  function definirTodos(ativo,anunciarMudanca){
    ativo=!!ativo;
    if(ativo===todos)return;
    todos=ativo;
    if(ativo)fecharEdicao(false);
    secao.toggleAttribute('data-todos',ativo);
    if(btnTodos){
      btnTodos.setAttribute('aria-pressed',ativo?'true':'false');
      if(rotTodos)rotTodos.textContent=ativo?'Voltar a registrar':'Ver todos';
      if(teclaTodos)teclaTodos.textContent=ativo?'Esc':'V';
    }
    if(infoTodos)infoTodos.hidden=!ativo;
    ajustarDensidade();
    if(anunciarMudanca)anunciar(ativo?'Modo ver todos: a tabela ocupa a tela toda.':'Voltou ao registro.');
  }

  /* Chip de participante: só o nome e um ESTADO (check = completo; anel vazio = em andamento).
     Nenhum número por pessoa (regra do cliente: nunca nome junto de métrica); a forma diz o estado, não só a cor. */
  function criarChip(p){
    const b=no('button','brainstorm-pessoa');
    b.type='button';b.dataset.chave=p.k;b.setAttribute('aria-pressed','false');
    const selo=no('span','brainstorm-selo');selo.appendChild(icone('check'));
    const nome=no('span','brainstorm-pessoa-nome');
    b.append(selo,nome);
    return {el:b,selo,nome};
  }

  function renderizarProgresso(todas,daRodada){
    const mapa=new Map();
    todas.forEach(l=>{const k=chave(l.participante);if(k&&!mapa.has(k))mapa.set(k,{k,nome:limpar(l.participante),bom:0,melhorar:0})});
    daRodada.forEach(l=>{const p=mapa.get(chave(l.participante));if(p&&TIPOS.includes(l.tipo))p[l.tipo]++});

    pessoas.forEach((c,k)=>{if(!mapa.has(k)){c.el.remove();pessoas.delete(k)}});
    let ref=chips.firstElementChild,completos=0;
    mapa.forEach(p=>{
      let c=pessoas.get(p.k);
      if(!c){c=criarChip(p);pessoas.set(p.k,c)}
      const completo=p.bom>=meta&&p.melhorar>=meta;
      if(completo)completos++;
      definirTexto(c.nome,p.nome);
      c.selo.classList.toggle('brainstorm-selo--parcial',!completo);
      c.el.classList.toggle('brainstorm-pessoa--completo',completo);
      const txt=p.nome+': '+(completo?'completo':'em andamento');
      definirAttr(c.el,'title',txt);
      definirAttr(c.el,'aria-label',txt+'. Selecionar participante');
      if(c.el===ref)ref=ref.nextElementSibling;else chips.insertBefore(c.el,ref);
    });
    chips.dataset.densidade=mapa.size>LIMITE_COMPACTO?'compacto':'amplo';
    if(chipExemplo)chipExemplo.hidden=mapa.size>0;
    if(resumo)definirTexto(resumo,mapa.size?completos+' de '+mapa.size+' completos':'nenhum participante ainda');
    if(infoTodos){      // só agregados, sem nomear ninguém
      const total=daRodada.length;
      definirTexto(infoTodos,total+(total===1?' apontamento':' apontamentos')+' · '+mapa.size+(mapa.size===1?' pessoa':' pessoas')+' · '+completos+(completos===1?' completa':' completas'));
    }

    const nomes=Array.from(mapa.values()).map(p=>p.nome).join('\n');
    if(sugestoes&&nomes!==nomesSugeridos){
      nomesSugeridos=nomes;
      sugestoes.replaceChildren(...Array.from(mapa.values()).map(p=>{const o=no('option');o.value=p.nome;return o}));
    }
    marcarAtual();
  }

  function marcarAtual(){
    const k=chave(campoPart.value);
    pessoas.forEach((c,ch)=>c.el.setAttribute('aria-pressed',k&&k===ch?'true':'false'));
  }

  function renderizar(){
    const todas=tabela.linhas();
    const daRodada=todas.filter(l=>l.rodada===rodada);
    TIPOS.forEach(t=>sincronizarLista(t,daRodada.filter(l=>l.tipo===t).reverse()));   // mais novo primeiro
    /* largura da etiqueta do participante nas densidades >= 1: o maior nome, em "ch" (a fonte é mono), para o texto alinhar sem gastar espaço */
    const maiorNome=daRodada.reduce((m,l)=>Math.max(m,limpar(l.participante).length),2);
    areaColunas.style.setProperty('--brainstorm-quem-ch',String(maiorNome));
    renderizarProgresso(todas,daRodada);
    primeira=false;
    agendarAjuste();          // a faixa de chips pode ter mudado de altura e as listas de tamanho
  }

  /* ----- eventos (delegação na própria tela) ----- */
  secao.addEventListener('submit',e=>{
    e.preventDefault();
    if(e.target===form)adicionar();
    else if(editando&&e.target===editando.form){
      const id=editando.id;
      if(fecharEdicao(true)){const it=itens.get(id);if(it)it.corpo.focus()}
    }
  });
  secao.addEventListener('click',e=>{
    const alvo=e.target;
    if(alvo.closest('[data-brainstorm-todos]')){definirTodos(!todos,true);return}
    const corpo=alvo.closest('button.brainstorm-item-corpo');
    if(corpo){const li=corpo.closest('.brainstorm-item');if(li)abrirEdicao(li.dataset.id);return}
    const chip=alvo.closest('button.brainstorm-pessoa');
    if(chip){
      const c=pessoas.get(chip.dataset.chave);
      if(c){campoPart.value=c.nome.textContent;limparErro(campoPart);marcarAtual();campoTexto.focus()}
      return;
    }
    const acao=alvo.closest('[data-acao]');
    if(acao&&acao.dataset.acao==='cancelar')fecharEdicao(false);
    else if(acao&&acao.dataset.acao==='remover')pedirRemocao(acao);
    else if(alvo.closest('.brainstorm-entrada [data-campo="tipo"] + .brainstorm-seg')&&e.detail>0)setTimeout(()=>campoTexto.focus(),0);   // clique (não teclado) no Bom/Melhorar; adiado: o <label> devolve o foco ao rádio depois do clique
  });
  secao.addEventListener('change',e=>{
    if(radiosTipo.includes(e.target))sincronizarTipo();
  });
  secao.addEventListener('input',e=>{
    if(e.target===campoPart){limparErro(campoPart);marcarAtual()}
    else if(e.target===campoTexto)limparErro(campoTexto);
    else if(editando&&e.target===editando.ta)editando.ta.removeAttribute('aria-invalid');
  });
  secao.addEventListener('keydown',e=>{
    const t=e.target;
    if(e.key===' '&&t.closest('button'))return;   // Espaço em botão: quem decide é o núcleo (teclado aciona o botão; mouse avança o deck)
    if(editando&&editando.li.contains(t)){
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();const id=editando.id;fecharEdicao(false);const it=itens.get(id);if(it)it.corpo.focus();return}
      if(e.key==='Enter'&&t===editando.ta&&!e.shiftKey){e.preventDefault();const id=editando.id;if(fecharEdicao(true)){const it=itens.get(id);if(it)it.corpo.focus()}}
      return;
    }
    if(e.key==='Enter'&&t===campoPart&&limpar(campoPart.value)){e.preventDefault();campoTexto.focus()}   // nome pronto: segue para o texto
  });
  secao.addEventListener('focusout',e=>{
    if(armado&&e.target===armado.btn)desarmar();
  });
  /* Participante: ao focar, seleciona tudo (digitar substitui o nome em vez de concatenar: "Ana" + "Bruno" -> "AnaBruno").
     O mouseup seguinte ao clique é cancelado uma vez, senão o navegador recoloca o cursor e desfaz a seleção. */
  let selecionarNoMouseup=false;
  secao.addEventListener('focusin',e=>{
    if(e.target!==campoPart)return;
    campoPart.select();
    selecionarNoMouseup=true;
  });
  secao.addEventListener('mouseup',e=>{
    if(!selecionarNoMouseup||e.target!==campoPart)return;
    selecionarNoMouseup=false;
    e.preventDefault();
  });
  secao.addEventListener('focusout',e=>{if(e.target===campoPart)selecionarNoMouseup=false});
  TIPOS.forEach(t=>{
    const ul=colunas[t].rol;
    ul.addEventListener('scroll',()=>marcarRolagem(t),{passive:true});
    if(typeof ResizeObserver==='function')new ResizeObserver(agendarAjuste).observe(ul);
  });
  tabela.on(()=>renderizar());

  sincronizarTipo();
  renderizar();

  const inst={
    secao,tabela,rodada,meta,
    renderizar,
    alternarTodos:()=>definirTodos(!todos,true),
    sairTodos:()=>{if(!todos)return false;definirTodos(false,true);return true},
    emTodos:()=>todos,
    /** Rola as duas listas juntas, quase uma tela por vez (setas no modo Ver todos). */
    rolar:dir=>TIPOS.forEach(t=>{const r=colunas[t].rol;r.scrollBy({top:dir*Math.round(r.clientHeight*.85)})}),
    focarEntrada:()=>{
      if(todos)definirTodos(false,true);                       // a entrada está recolhida: volta a registrar
      (limpar(campoPart.value)?campoTexto:campoPart).focus();   // sem participante ainda: começa por ele
    },
    aoAbrir:()=>{definirTodos(false);renderizar();ajustarDensidade()}   // reabrir a tela sempre volta ao registro
  };
  instancias.set(secao,inst);
  return inst;
}

/* ---------- ligação com o deck ---------- */
function iniciar(){
  Array.from(S.slides||[]).filter(s=>s.matches(SELETOR)).forEach(montar);
}
const sobreposicaoAberta=()=>!!document.querySelector('#visao:not([hidden]),#ajuda:not([hidden]),#apagao:not([hidden]),#dadosPainel:not([hidden])');
const ativa=()=>{const s=S.slides&&S.slides[S.atual()];return s?instancias.get(s):null};

S.on('pronto',iniciar);
S.on('slide',e=>{
  const s=e.detail&&e.detail.slide,inst=s&&instancias.get(s);
  if(inst)inst.aoAbrir();
});
/* V alterna "Ver todos"; Esc sai dele; ↓ ↑ rolam as listas quando há mais do que cabe (só nesse modo). Fase de captura: o Esc que fecha uma sobreposição (visão geral, ajuda...) é do núcleo e não sai do modo.
   Não intercepta teclas com foco em campo editável (PADROES §7). */
const emEdicao=t=>!!(t&&t.closest&&t.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||e.defaultPrevented)return;
  const k=e.key;
  if(k!=='v'&&k!=='V'&&k!=='Escape'&&k!=='ArrowDown'&&k!=='ArrowUp')return;
  const inst=ativa();
  if(!inst||emEdicao(e.target)||sobreposicaoAberta())return;
  if(k==='Escape'){if(inst.sairTodos())e.preventDefault();return}
  if(k==='ArrowDown'||k==='ArrowUp'){if(inst.emTodos()){e.preventDefault();inst.rolar(k==='ArrowDown'?1:-1)}return}
  e.preventDefault();inst.alternarTodos();
},true);
/* Enter, com a tela aberta e sem foco em nada, leva o foco à barra de entrada (Esc devolve a navegação) */
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter'||e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
  if(e.target!==document.body||sobreposicaoAberta())return;
  const inst=ativa();
  if(inst){e.preventDefault();inst.focarEntrada()}
});

S.brainstorm={
  tabela:TABELA,
  /** Monta (se ainda não montada) uma tela brainstorm; devolve a instância ou null. */
  montar,
  /** Re-renderiza todas as telas brainstorm montadas (útil depois de importar CSV por fora da camada de dados). */
  atualizar:()=>Array.from(S.slides||[]).forEach(s=>{const i=instancias.get(s);if(i)i.renderizar()})
};
})();
