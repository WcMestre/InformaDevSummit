/* ==========================================================================
   58 · NUVEM — nuvem de palavras a partir da tabela 'brainstorming'. Lê os apontamentos e, no ranking lateral,
   é onde a sala VOTA a criticidade (passo 5 da dinâmica): o único ponto de escrita é tabela.atualizar(id,{criticidade}).

   Fluxo:  linhas (CSV) -> filtro por rodada -> termos (palavras ou frases) -> peso -> tamanho
           -> posição (espiral elíptica determinística, sem sobreposição) -> DOM (spans absolutos com texto real)

   Regras (as mesmas impressas na legenda da tela):
     • cor: azul = 'bom' · vermelho = 'melhorar'; a mesma palavra nos dois lados vira DUAS entradas
     • peso = Σ das citações (1 por apontamento que contém o termo); 'bom' vale ×1;
       'melhorar' vale pela criticidade: 1 -> ×1 · 2 -> ×2 · 3 -> ×4 (a criticidade pesa mais que a frequência)
     • tamanho = raiz do peso entre 24 px e um TETO (150 px; frases 72 px); o maior peso fica sempre no teto.
       O teto só desce (150 -> 64) quando há tantos termos que o topo ocuparia a área toda (ver planejar)
     • destaque: vermelho ganha sublinhado; criticidade média 2/3 ganha peso 700, traço grosso, brilho e barras (CSS)

     • termos: palavras com 2+ letras (siglas CI, CD, PR, QA, DB, TI…, '.NET', 'C#', 'Node.js' sobrevivem); stopwords caem.
       Exibição = grafia original mais frequente (com acento e caixa originais; sigla de até 3 letras fica em maiúsculas)
     • ajuste de criticidade: cada termo VERMELHO do ranking tem um controle 1·2·3 (≥ 44 px, teclável). Aplica o valor a TODOS os
       apontamentos 'melhorar' que contêm o termo (no modo Frases, à frase) e grava por tabela.atualizar; a nuvem re-desenha ao vivo.

   Eventos: 'summit:slide' (tela aberta) · 'summit:pronto' · tabela.on (ao vivo, com origem local|arquivo|servidor).
   Único global: window.SUMMIT.nuvem (funções puras expostas para teste).
   Sem dependências externas.
   ========================================================================== */
(function(){
'use strict';
const S=window.SUMMIT;
if(!S||!S.dados)return;
const $=S.$, $$=S.$$;

/* ---------- constantes ---------- */
const MIN_PX=24;                               // menor tamanho legível (projeção)
const TETOS={                                  // teto de tamanho (px) que o maior peso recebe; tenta do maior ao menor
  palavras:[150,132,116,102,90,80,70,64],
  frases:[72,64,56,48,42,36,30]
};
const ALVO={palavras:30,frases:20};            // se houver mais termos que isto, basta caberem ALVO; senão, todos precisam caber
const MAX_TERMOS=150;                          // teto de termos na nuvem
const ANCORA=.5;                               // t = raiz((peso-ANCORA)/(pmax-ANCORA)): suaviza o piso sem zerar o menor peso
const FOLGA_X=14, FOLGA_Y=6, MARGEM=4;         // respiro entre termos e da borda da área (px)
const ELIPSE=1.6;                              // razão largura/altura da espiral (a área é larga)
const MULT_CRIT={1:1,2:2,3:4};                 // peso de cada citação em 'melhorar' (criticidade 1 · 2 · 3)
const ROTULO_CRIT={1:'baixa',2:'média',3:'alta'};
const TOP_RANKING=5;
const MAX_FRASE_CHARS=90;                      // frase mais longa é abreviada na nuvem (texto completo no aria-label)
const FONTES_RANKING='500 24px Inter, "Segoe UI", sans-serif';

/* Stopwords pt-BR (já sem acento, minúsculas): artigos, preposições, conjunções, pronomes,
   verbos auxiliares comuns, quantificadores e advérbios de intensidade. Tokens de 2 letras são MANTIDOS (siglas: CI, CD, PR, QA, DB, TI…):
   só caem as stopwords curtas listadas aqui; tokens de 1 letra sempre caem. */
const STOP=new Set(`
  o a os as um uma uns umas
  de do da dos das dum duma em no na nos nas num numa por pelo pela pelos pelas para pra pro com sem sob sobre ate apos
  entre ante perante contra desde durante
  que se como quando porque pois porem contudo todavia entretanto embora enquanto nem logo senao
  ele ela eles elas eu tu voce voces vos nos me te lhe lhes si meu minha meus minhas teu tua seu sua seus suas
  nosso nossa nossos nossas este esta estes estas esse essa esses essas aquele aquela aqueles aquelas isto isso aquilo
  qual quais quem cujo cuja onde aqui ali la
  ser sou eh era eram foi foram fosse sera serao sendo sido somos sao
  ter tem tenho temos tinha tinham teve tiver tendo tido tenha
  haver havia houve estar esta estao estava estavam esteve estou estamos estando estado
  ir vai vao vou vamos pode podem poder podemos deve devem dever devemos
  mais menos muito muita muitos muitas pouco pouca poucos poucas bem mal ainda tambem mesmo mesma tao tanto tanta
  todo toda todos todas cada outro outra outros outras algum alguma alguns algumas nenhum nenhuma nao sim sempre nunca
  tudo nada algo entao assim coisa coisas vezes tres dois duas atras jamais demais depois antes
  ou ao aos ja ha so ai ne ta vc tb pq falta faltam
`.split(/\s+/).filter(Boolean));

/* ---------- normalização ---------- */
const semAcento=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'');

/* Token = palavra com 2+ letras/dígitos; preserva termos técnicos: ".NET", "C#", "C++", "Node.js", "ASP.NET".
   Um ponto só une partes quando a extensão é conhecida (js, net, io…): "lento.Falta" continua sendo duas palavras. */
const RE_TOKEN=/(?<![\p{L}\p{N}.])\.\p{L}[\p{L}\p{N}]*|\p{L}{1,3}(?:#|\+\+)(?![\p{L}\p{N}#+])|[\p{L}\p{N}]+(?:\.[\p{L}\p{N}]+)*/gu;
const EXT_TECNICA=new Set('js ts jsx tsx net io py cs md sh ai json yml yaml xml sql php rb go env'.split(' '));
/** Quebra o texto em tokens {tok, inicio}; `inicio` = começa uma frase (a maiúscula inicial é da gramática, não do termo). */
function tokens(texto){
  const out=[];RE_TOKEN.lastIndex=0;let m;
  while((m=RE_TOKEN.exec(texto))){
    const antes=texto.slice(0,m.index).trimEnd();
    const inicio=!antes||/[.!?:;\-–—•*]$/.test(antes);
    const t=m[0];
    if(t.charAt(0)==='.'||t.indexOf('.')<0){out.push({tok:t,inicio});continue}
    const partes=t.split('.');let cur=partes[0],ini=inicio;
    for(let i=1;i<partes.length;i++){
      if(EXT_TECNICA.has(partes[i].toLowerCase()))cur+='.'+partes[i];
      else{out.push({tok:cur,inicio:ini});cur=partes[i];ini=false}
    }
    out.push({tok:cur,inicio:ini});
  }
  return out;
}
/** Ruído = número puro, token de 1 letra ou stopword. Siglas de 2 letras (CI, QA…) NÃO são ruído. */
function ruido(k){
  if(/^[\d.,]+$/.test(k))return true;
  const n=k.replace(/[^\p{L}\p{N}]/gu,'').length;
  if(/[#+]$/.test(k))return n<1;
  return n<2||STOP.has(k);
}
/** Grafia que vai para a tela: original, exceto maiúscula de início de frase ("Deploy" -> "deploy") e GRITO longo.
 *  Sigla (tudo em maiúsculas, até 6 letras; até 3 se o texto inteiro está em caixa alta) mantém as maiúsculas. */
function formaExibicao(tok,inicio,caixaAlta){
  const letras=tok.replace(/[^\p{L}]/gu,'');
  if(!letras)return tok;
  if(letras.length>=2&&letras===letras.toUpperCase()&&letras!==letras.toLowerCase())
    return letras.length<=(caixaAlta?3:6)?tok:tok.toLowerCase();
  if(inicio&&letras.length>1&&letras===letras[0].toUpperCase()+letras.slice(1).toLowerCase())return tok.toLowerCase();
  return tok;
}

/** Irregulares que a regra não deduz (mês/meses, país/países). */
const IRREGULAR={meses:'mes',paises:'pais'};
/** Candidatos de singular para um plural terminado em -es/-ens/-eis…; o 1º é o padrão, os demais só valem se já existirem na sala. */
function candidatos(p){
  const a=p.slice(0,-1), b=p.slice(0,-2);
  if(/(oes|aes)$/.test(p)||(p.length>=6&&/aos$/.test(p)))return [p.slice(0,-3)+'ao'];        // reuniões -> reuniao · cidadãos -> cidadao
  if(p.length>=5&&/ais$/.test(p))return [b+'l'];                                               // canais -> canal
  if(p.length>=5&&/eis$/.test(p))return [p.slice(0,-3)+'el',p.slice(0,-3)+'il'];               // papéis -> papel · fáceis -> fácil
  if(/[eio]ns$/.test(p))return [p.slice(0,-3)+(p.endsWith('ons')?'om':p.endsWith('ins')?'im':'em'),a];   // itens -> item · ruins -> ruim · tokens -> token (se "token" existe)
  if(/(ss|us|is)$/.test(p))return [p];                                                          // acesso, vírus, lápis, país: intactos
  if(/(ch|sh|x|z)es$/.test(p))return [b,a];                                                     // branches -> branch · hotfixes -> hotfix · caches -> cache
  if(/[aeiou]res$/.test(p))return [b,a];                                                        // desenvolvedores -> desenvolvedor · softwares -> software
  if(/ses$/.test(p))return [a,b];                                                               // fases -> fase · gases -> gas (se "gas" existe)
  if(p.endsWith('s'))return [a];                                                                // times -> time
  return [p];
}
/** Singular/plural sem acento, seguro. `pool` (opcional) = chaves já vistas na sala: desempata "caches" (cache) de "branches" (branch). */
function singular(p,pool){
  if(p.length<4||/[^a-z0-9]/.test(p))return p;               // curtos e termos com símbolo (.net, c#, node.js) ficam como estão
  if(IRREGULAR[p])return IRREGULAR[p];
  const c=candidatos(p);
  if(pool){const i=c.findIndex(x=>pool.has(x));if(i>0)return c[i]}
  return c[0];
}
const citacoes=n=>n===1?'1 citação':n+' citações';
const dec=n=>(Math.round(n*10)/10).toFixed(1).replace('.',',');

/* ---------- dados ---------- */
/** Lê e sanitiza as linhas da tabela; filtra por rodada ('' = todas) e por tipo válido. */
function lerLinhas(tabela,rodada){
  return tabela.linhas().map(l=>{
    const crit=parseInt(l.criticidade,10);
    return {
      id:String(l.id||''),
      rodada:String(l.rodada||'').trim(),
      participante:String(l.participante||'').trim().toLowerCase(),
      tipo:String(l.tipo||'').trim().toLowerCase(),
      texto:String(l.texto||'').replace(/\s+/g,' ').trim(),
      crit:Number.isFinite(crit)?Math.min(3,Math.max(1,crit)):1
    };
  }).filter(l=>(rodada===''||l.rodada===rodada)&&(l.tipo==='bom'||l.tipo==='melhorar')&&l.texto);
}

/* ---------- termos ---------- */
/** Soma uma citação ao termo. `contar=false` só registra a forma escrita (repetição dentro do mesmo apontamento). */
function acumular(mapa,id,lado,chave,forma,mult,crit,contar,linhaId){
  let e=mapa.get(id);
  if(!e){e={id,lado,chave,formas:new Map(),ocorrencias:0,peso:0,critSoma:0,critMin:9,critMax:0,ids:new Set()};mapa.set(id,e)}
  if(contar){
    e.ocorrencias++;e.peso+=mult;
    if(lado==='melhorar'){e.critSoma+=crit;e.critMin=Math.min(e.critMin,crit);e.critMax=Math.max(e.critMax,crit);if(linhaId)e.ids.add(linhaId)}
  }
  e.formas.set(forma,(e.formas.get(forma)||0)+1);
}
const temAcento=f=>/[̀-ͯ]/.test(f.normalize('NFD'));
const nMaiusc=f=>f.replace(/[^\p{Lu}]/gu,'').length;
const ehSigla=f=>f.length<=3&&nMaiusc(f)>=2;
/** Forma de exibição: COM acento antes de sem acento ("reunião", nunca "reuniao"); sigla curta em maiúsculas (CI, API);
 *  depois a mais frequente; empate -> mais maiúsculas (nome próprio/sigla); por fim ordem alfabética (determinístico). */
function melhorForma(formas){
  return Array.from(formas.keys()).sort((a,b)=>
    temAcento(b)-temAcento(a)||ehSigla(b)-ehSigla(a)||formas.get(b)-formas.get(a)||nMaiusc(b)-nMaiusc(a)||(a<b?-1:a>b?1:0))[0];
}
function ordem(a,b){
  return (b.peso-a.peso)||(b.ocorrencias-a.ocorrencias)||(a.lado===b.lado?0:(a.lado==='bom'?-1:1))||(a.chave<b.chave?-1:a.chave>b.chave?1:0);
}
function finalizar(mapa,modo){
  const termos=Array.from(mapa.values()).map(e=>{
    const critMedia=e.lado==='melhorar'?e.critSoma/e.ocorrencias:0;
    let texto=melhorForma(e.formas);
    const completo=texto;
    if(modo==='frases'&&texto.length>MAX_FRASE_CHARS)texto=texto.slice(0,MAX_FRASE_CHARS-1).trim()+'…';
    return {id:e.id,lado:e.lado,chave:e.chave,texto,completo,ocorrencias:e.ocorrencias,peso:e.peso,critMedia,
      nivel:e.lado==='melhorar'?Math.min(3,Math.max(1,Math.round(critMedia))):0,
      critUnica:e.lado==='melhorar'&&e.critMin===e.critMax?e.critMax:0,        // valor comum a todas as ocorrências (0 = misto)
      ids:Array.from(e.ids)};                                                   // linhas 'melhorar' que contêm o termo (ajuste de criticidade)
  });
  return termos.sort(ordem);
}

/**
 * Transforma linhas em termos ordenados por peso (maior primeiro).
 * @param {Array} linhas  saída de lerLinhas
 * @param {'palavras'|'frases'} modo
 * @returns {Array<{id,lado,chave,texto,completo,ocorrencias,peso,critMedia,nivel}>}
 */
function processar(linhas,modo){
  const mapa=new Map();
  const mult=l=>l.tipo==='melhorar'?MULT_CRIT[l.crit]:1;
  if(modo==='frases'){
    linhas.forEach(l=>{
      const forma=l.texto.replace(/^[\s.,;:!?-]+|[\s.,;:!?-]+$/g,'');
      const chave=semAcento(forma.toLowerCase()).replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
      if(chave)acumular(mapa,l.tipo+'|'+chave,l.tipo,chave,forma,mult(l),l.crit,true,l.id);
    });
    return finalizar(mapa,modo);
  }
  /* 1ª passada: tokens úteis de cada apontamento + "pool" de chaves da sala (decide branches×caches, meses×fases) */
  const pool=new Set();
  const prep=linhas.map(l=>{
    const caixaAlta=l.texto===l.texto.toUpperCase()&&l.texto!==l.texto.toLowerCase();
    const toks=[];
    tokens(l.texto).forEach(({tok,inicio})=>{
      if(/^\p{Lu}{2,}s$/u.test(tok))tok=tok.slice(0,-1);                // PRs -> PR · APIs -> API
      const k0=semAcento(tok.toLowerCase());
      if(ruido(k0))return;
      pool.add(k0);toks.push({k0,forma:formaExibicao(tok,inicio,caixaAlta)});
    });
    return {l,toks};
  });
  /* 2ª passada: singulariza, agrupa e soma (1 citação por apontamento) */
  prep.forEach(({l,toks})=>{
    const vistos=new Set();
    toks.forEach(({k0,forma})=>{
      const k=singular(k0,pool);
      if(k!==k0&&ruido(k))return;
      const id=l.tipo+'|'+k;
      acumular(mapa,id,l.tipo,k,forma,mult(l),l.crit,!vistos.has(id),l.id);
      vistos.add(id);
    });
  });
  return finalizar(mapa,modo);
}

/** Tamanho em px: raiz do peso entre MIN_PX e maxPx; pesos todos iguais -> meio da escala. */
function tamanho(peso,pmax,pmin,maxPx){
  if(pmax<=pmin)return Math.round(MIN_PX+(maxPx-MIN_PX)*.5);
  return Math.round(MIN_PX+(maxPx-MIN_PX)*Math.sqrt((peso-ANCORA)/(pmax-ANCORA)));
}

/**
 * Posiciona caixas {w,h} (já ordenadas por peso) numa área W×H por espiral elíptica.
 * Determinístico: sem aleatório. Quem não cabe vai para `omitidos`.
 * @returns {{colocados:Array<{i:number,x:number,y:number}>, omitidos:number[]}}  x,y = canto superior esquerdo
 */
function colocar(caixas,W,H){
  const colocados=[], omitidos=[], ocupados=[], falhas=[];
  const cx=W/2, cy=H/2, areaMax=(W-2*MARGEM)*(H-2*MARGEM)*.9;
  let usada=0;
  caixas.forEach((c,i)=>{
    const rw=c.w+FOLGA_X, rh=c.h+FOLGA_Y;
    // quem é maior que uma falha anterior também não cabe (o espaço livre só diminui)
    if(usada+rw*rh>areaMax||falhas.some(f=>rw>=f.w&&rh>=f.h)){omitidos.push(i);return}
    let theta=0,achou=null;
    for(;;){
      const r=3*theta, x0=cx+ELIPSE*r*Math.cos(theta)-rw/2, y0=cy+r*Math.sin(theta)-rh/2;
      if(x0>=MARGEM&&y0>=MARGEM&&x0+rw<=W-MARGEM&&y0+rh<=H-MARGEM){
        let livre=true;
        for(let k=0;k<ocupados.length;k++){
          const o=ocupados[k];
          if(x0<o.x1&&x0+rw>o.x0&&y0<o.y1&&y0+rh>o.y0){livre=false;break}
        }
        if(livre){achou={x0,y0};break}
      }
      if(ELIPSE*r>W/2+rw&&r>H/2+rh)break;                       // a espiral já saiu da área por inteiro
      theta+=9/Math.max(10,r*1.3);
    }
    if(!achou){falhas.push({w:rw,h:rh});omitidos.push(i);return}
    ocupados.push({x0:achou.x0,y0:achou.y0,x1:achou.x0+rw,y1:achou.y0+rh});
    usada+=rw*rh;
    colocados.push({i,x:achou.x0+FOLGA_X/2,y:achou.y0+FOLGA_Y/2});
  });
  // centraliza o conjunto na área (continua dentro: o conjunto cabia)
  if(colocados.length){
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    colocados.forEach(p=>{const c=caixas[p.i];x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x+c.w);y1=Math.max(y1,p.y+c.h)});
    const dx=Math.round((W-(x1-x0))/2-x0), dy=Math.round((H-(y1-y0))/2-y0);
    colocados.forEach(p=>{p.x+=dx;p.y+=dy});
  }
  return {colocados,omitidos};
}

/* ---------- fontes e medidas de texto ---------- */
let promessaFontes=null;
/** Garante que Inter (500–700) está carregada antes de medir; nunca rejeita. */
function fontesProntas(){
  if(!promessaFontes){
    const f=document.fonts;
    promessaFontes=(f&&f.load)?Promise.all(['500 24px Inter','600 24px Inter','700 24px Inter'].map(x=>f.load(x,'aáçãõ').catch(()=>null))).then(()=>f.ready).catch(()=>null)
      :Promise.resolve();
  }
  return promessaFontes;
}
let ctxTexto=null;
function larguraTexto(t){
  if(!ctxTexto){ctxTexto=document.createElement('canvas').getContext('2d');ctxTexto.font=FONTES_RANKING}
  return ctxTexto.measureText(t).width;
}
/** Abrevia com "…" até caber em `max` px (fonte do ranking). */
function truncar(texto,max){
  if(larguraTexto(texto)<=max)return texto;
  let n=texto.length;
  while(n>1&&larguraTexto(texto.slice(0,n).trimEnd()+'…')>max)n--;
  return texto.slice(0,n).trimEnd()+'…';
}

/* ---------- instância por tela ---------- */
const instancias=[];
const tabelasOuvidas=new Map();        // nome -> true (um tabela.on por tabela)

function rodadaDe(slide){
  const r=(slide.dataset.rodada||'').trim();
  return /^todas?$/i.test(r)?'':r;
}
function obterTabela(nome){
  try{return S.dados.tabela(nome)}catch(e){return null}     // tabela fora do esquema: a tela mostra o estado vazio
}

/** Preenche um span de termo (texto + barras de criticidade) sem tocar no DOM se nada mudou. */
function preencher(el,t){
  el.dataset.lado=t.lado;el.dataset.nivel=String(t.nivel);
  const sig=t.texto+'|'+t.nivel;
  if(el.dataset.sig===sig)return;
  el.dataset.sig=sig;el.textContent=t.texto;
  if(t.nivel>=2){
    el.append('\u2060');                      // word joiner: as barras nunca ficam sozinhas numa linha
    const b=document.createElement('span');b.className='nuvem-barras';b.dataset.nivel=String(t.nivel);b.setAttribute('aria-hidden','true');
    for(let i=0;i<3;i++)b.appendChild(document.createElement('i'));
    el.appendChild(b);
  }
}
const rotuloLado=l=>l==='bom'?'fazemos bem':'podemos melhorar';
function descricao(t){
  return t.completo+', '+rotuloLado(t.lado)+', '+citacoes(t.ocorrencias)+(t.lado==='melhorar'?', criticidade média '+dec(t.critMedia):'');
}

/** Mede um termo no DOM (sonda invisível) com um tamanho de fonte; frases quebram em linhas (largura máx. proporcional). */
function medirDom(inst,t,fs,modo,W){
  const p=inst.sonda;
  preencher(p,t);
  p.classList.toggle('nuvem-termo--frase',modo==='frases');
  p.style.fontSize=fs+'px';
  p.style.maxWidth=modo==='frases'?Math.round(Math.min(W*.6,Math.max(300,fs*10)))+'px':'none';
  return {w:p.offsetWidth+1,h:p.offsetHeight,maxw:p.style.maxWidth};
}

/**
 * Dimensões de cada termo para um teto de tamanho. Palavras (uma linha) escalam linearmente a partir de UMA
 * medida a 100 px; frases são medidas no DOM porque a quebra de linha muda com o tamanho.
 */
function dimensionar(inst,termos,ref,teto,pmax,pmin,W,H){
  return termos.map((t,i)=>{
    let fs=tamanho(t.peso,pmax,pmin,teto);
    if(inst.modo==='palavras'){
      fs=Math.max(MIN_PX,Math.min(fs,Math.floor(100*W*.94/ref[i].w)));          // palavra comprida encolhe até caber
      return {t,fs,w:Math.ceil(ref[i].w*fs/100)+2,h:Math.ceil(fs*1.1),maxw:'none'};
    }
    let m=null;
    for(let n=0;n<14;n++){
      m=medirDom(inst,t,fs,'frases',W);
      if((m.w<=W*.6+2&&m.h<=H*.45)||fs<=MIN_PX)break;
      fs=Math.max(MIN_PX,Math.floor(fs*.9));
    }
    return {t,fs,w:m.w,h:m.h,maxw:m.maxw};
  });
}

/** Escolhe o maior teto de tamanho em que cabem os termos exigidos (ver ALVO); devolve itens, posições e teto. */
function planejar(inst,termos,pmax,pmin,W,H){
  const ref=inst.modo==='palavras'?termos.map(t=>medirDom(inst,t,100,'palavras',W)):null;
  const alvo=Math.min(termos.length,ALVO[inst.modo]);
  let melhor=null;
  for(const teto of TETOS[inst.modo]){
    const itens=dimensionar(inst,termos,ref,teto,pmax,pmin,W,H);
    const res=colocar(itens,W,H);
    if(!melhor||res.colocados.length>melhor.res.colocados.length)melhor={itens,res,teto};
    if(res.colocados.length>=alvo)break;
  }
  return melhor;
}

/** Recalcula e redesenha a nuvem, o ranking, os contadores e o estado vazio. */
function renderizar(inst){
  if(!inst.slide.classList.contains('active')){inst.sujo=true;return}
  if(!inst.fontes){
    fontesProntas().then(()=>{inst.fontes=true;renderizar(inst)});
    return;
  }
  inst.sujo=false;
  const t0=performance.now();
  const W=inst.area.clientWidth, H=inst.area.clientHeight;
  const linhas=inst.tabela?lerLinhas(inst.tabela,inst.rodada):[];
  const todos=processar(linhas,inst.modo);
  const termos=todos.slice(0,MAX_TERMOS);
  inst.todosPorId=new Map(todos.map(t=>[t.id,t]));

  /* tamanho + medida + posição */
  let pmax=0,pmin=Infinity;
  todos.forEach(t=>{pmax=Math.max(pmax,t.peso);pmin=Math.min(pmin,t.peso)});
  const plano=(W>0&&H>0&&termos.length)?planejar(inst,termos,pmax,pmin,W,H):{itens:[],res:{colocados:[],omitidos:[]},teto:0};
  const itens=plano.itens, res=plano.res;
  inst.teto=plano.teto;

  /* DOM da nuvem (reaproveita os spans pela chave: a nuvem "anda" em vez de piscar) */
  const foco=document.activeElement;
  const ordemDom=[], vistos=new Set();
  inst.porChave=new Map();
  res.colocados.forEach(p=>{
    const it=itens[p.i], t=it.t;
    let el=inst.mapa.get(t.id);
    if(!el){
      el=document.createElement('span');el.className='nuvem-termo';el.tabIndex=0;el.setAttribute('role','listitem');
      el.dataset.chave=t.id;inst.mapa.set(t.id,el);
    }
    preencher(el,t);
    el.classList.toggle('nuvem-termo--frase',inst.modo==='frases');
    el.style.left=Math.round(p.x)+'px';el.style.top=Math.round(p.y)+'px';
    el.style.width=it.w+'px';el.style.fontSize=it.fs+'px';el.style.maxWidth=it.maxw;
    el.setAttribute('aria-label',descricao(t));
    inst.porChave.set(t.id,t);
    vistos.add(t.id);ordemDom.push(el);
  });
  inst.mapa.forEach((el,id)=>{if(!vistos.has(id)){el.remove();inst.mapa.delete(id)}});
  const atual=$$('.nuvem-termo',inst.termos);
  if(atual.length!==ordemDom.length||atual.some((el,i)=>el!==ordemDom[i])){
    ordemDom.forEach(el=>inst.termos.appendChild(el));
    if(foco&&foco!==document.body&&inst.termos.contains(foco))foco.focus({preventScroll:true});
  }
  esconderDica(inst);

  pintarEstado(inst,linhas,todos);
  pintarRanking(inst,todos,res.colocados.length);
  inst.ultimoMs=performance.now()-t0;
  inst.termosNaNuvem=res.colocados.length;
}

function pintarEstado(inst,linhas,todos){
  const vazio=!todos.length;
  inst.area.dataset.estado=vazio?'vazio':'cheio';
  inst.vazio.hidden=!vazio;
  if(vazio){
    const semDados=!linhas.length;
    $('.nuvem-vazio-titulo',inst.vazio).textContent=semDados?'Sem apontamentos ainda':'Sem palavras para a nuvem';
    $('.nuvem-vazio-texto',inst.vazio).textContent=semDados?'Volte à tela anterior e registre.'
      :'Os apontamentos só têm palavras comuns (de, para, com…). Tente o modo Frases.';
  }
  const part=new Set(linhas.map(l=>l.participante).filter(Boolean)).size;
  stat(inst,'apontamentos','',linhas.length,linhas.length===1?'apontamento':'apontamentos');
  stat(inst,'participantes','',part,part===1?'participante':'participantes');
  const r=$('[data-stat="rodada"]',inst.slide);
  if(r){
    r.textContent='';
    if(inst.rodada){r.append('rodada ');const b=document.createElement('b');b.textContent=inst.rodada;r.append(b)}
    else r.append('todas as rodadas');
  }
}
function stat(inst,nome,pre,num,pos){
  const el=$('[data-stat="'+nome+'"]',inst.slide);if(!el)return;
  el.textContent='';
  const b=document.createElement('b');b.textContent=String(num);
  el.append(pre,b,' '+pos);
}

/** Barras crescentes de criticidade 1–3 (forma, não só cor). */
function barras(nivel){
  const b=document.createElement('span');b.className='nuvem-barras';b.dataset.nivel=String(nivel);b.setAttribute('aria-hidden','true');
  for(let i=0;i<3;i++)b.appendChild(document.createElement('i'));
  return b;
}
/** Controle 1·2·3 do termo vermelho: aplica a criticidade a TODAS as ocorrências (no modo Frases, à frase). */
function controleCriticidade(t){
  const g=document.createElement('div');g.className='nuvem-crit';g.setAttribute('role','group');
  g.setAttribute('aria-label','Criticidade de '+t.completo+': 1 baixa, 2 média, 3 alta');
  [1,2,3].forEach(v=>{
    const bt=document.createElement('button');bt.type='button';bt.className='nuvem-crit-btn';bt.dataset.valor=String(v);
    bt.setAttribute('aria-pressed',String(t.critUnica===v));
    bt.setAttribute('aria-label','Criticidade '+v+' ('+ROTULO_CRIT[v]+') para '+t.completo);
    bt.append(barras(v),String(v));
    g.appendChild(bt);
  });
  return g;
}
/** Dica fixa sob o título "Podemos melhorar": a escala e o que o controle faz. Criada aqui se a tela não a trouxer. */
function garantirEscala(inst,ol){
  let e=$('.nuvem-rank-escala',inst.slide);
  if(!e){e=document.createElement('p');e.className='nuvem-rank-escala';ol.before(e)}
  e.textContent='Votar criticidade: 1 baixa · 3 alta';
}

function pintarRanking(inst,todos,naNuvem){
  /* o ranking é refeito a cada gravação: guarda o botão focado (termo + valor) para devolver o foco a ele */
  const ativo=document.activeElement;
  let foco=null;
  if(ativo&&ativo.classList&&ativo.classList.contains('nuvem-crit-btn')&&inst.slide.contains(ativo)){
    const li=ativo.closest('.nuvem-rank-item');if(li)foco={chave:li.dataset.chave,valor:ativo.dataset.valor};
  }
  ['bom','melhorar'].forEach(lado=>{
    const ol=$('.nuvem-rank-lista[data-lado="'+lado+'"]',inst.slide);if(!ol)return;
    ol.textContent='';
    if(lado==='melhorar')garantirEscala(inst,ol);
    const top=todos.filter(t=>t.lado===lado).slice(0,TOP_RANKING);
    if(!top.length){
      const li=document.createElement('li');li.className='nuvem-rank-vazio';li.textContent='Nada citado ainda';ol.appendChild(li);return;
    }
    const largura=lado==='melhorar'?196:278;
    top.forEach(t=>{
      const li=document.createElement('li');li.className='nuvem-rank-item';li.dataset.lado=lado;li.dataset.chave=t.id;
      const nome=document.createElement('span');nome.className='nuvem-rank-termo';nome.textContent=truncar(t.texto,largura);
      if(nome.textContent!==t.completo)li.title=t.completo;
      const n=document.createElement('span');n.className='nuvem-rank-n';n.textContent='×'+t.ocorrencias;
      if(lado==='bom'){
        li.setAttribute('aria-label',descricao(t));
        li.append(nome,n);
      }else{
        /* vermelho: [termo / ×n · barras · média]  [1·2·3] — o facilitador vê o efeito da votação na própria linha */
        const corpo=document.createElement('span');corpo.className='nuvem-rank-corpo';
        const meta=document.createElement('span');meta.className='nuvem-rank-meta';
        const c=document.createElement('span');c.className='nuvem-rank-crit';
        const sr=document.createElement('span');sr.className='sr-only';sr.textContent='criticidade média ';
        c.append(barras(t.nivel),sr,dec(t.critMedia));
        meta.append(n,c);corpo.append(nome,meta);
        li.append(corpo,controleCriticidade(t));
      }
      ol.appendChild(li);
    });
  });
  const info=$('[data-info]',inst.slide);
  if(info){
    info.textContent='';
    if(todos.length)info.append('Na nuvem: '+naNuvem+' de '+todos.length+' termos');
  }
  caberNoCard(inst);
  if(foco){
    const li=$$('.nuvem-rank-item',inst.slide).find(x=>x.dataset.chave===foco.chave);
    const bt=li&&$('.nuvem-crit-btn[data-valor="'+foco.valor+'"]',li);
    if(bt)bt.focus({preventScroll:true});
  }
}

/** Título de 2 linhas (ou tela baixa) encolhe o card: tira o último item (azuis até 3, depois vermelhos até 3) até o ranking caber sem rolar. */
function caberNoCard(inst){
  const rank=$('.nuvem-rank',inst.slide);if(!rank)return;
  const cortar=(lado,min)=>{const its=$$('.nuvem-rank-item',$('.nuvem-rank-lista[data-lado="'+lado+'"]',inst.slide));if(its.length<=min)return false;its[its.length-1].remove();return true};
  while(rank.scrollHeight>rank.clientHeight+1){if(!(cortar('bom',3)||cortar('melhorar',3)))break}
}

/** Aplica a criticidade `valor` a todas as linhas 'melhorar' do termo (tabela.atualizar). A nuvem re-desenha pelo tabela.on. */
function ajustarCriticidade(inst,chave,valor){
  const t=inst.todosPorId&&inst.todosPorId.get(chave);
  if(!t||t.lado!=='melhorar'||!inst.tabela)return 0;
  let n=0;
  t.ids.forEach(id=>{if(inst.tabela.atualizar(id,{criticidade:String(valor)}))n++});
  return n;
}

/** A legenda da tela segue os multiplicadores do código (uma só fonte da verdade). */
function sincronizarLegenda(slide){
  const selo=$('.nuvem-legenda .nuvem-selo--melhorar',slide), item=selo&&selo.closest('.nuvem-leg-item'), p=item&&$('p',item);
  const f=n=>String(n).replace('.',',');
  if(p)p.textContent='Vem sublinhado. Criticidade 1, 2 ou 3 vale '+f(MULT_CRIT[1])+', '+f(MULT_CRIT[2])+' ou '+f(MULT_CRIT[3])+' citações.';
}

/* ---------- dica ao passar/focar ---------- */
function mostrarDica(inst,el){
  const t=inst.porChave&&inst.porChave.get(el.dataset.chave), d=inst.dica;
  if(!t||!d)return;
  d.textContent='';
  const a=document.createElement('b');a.textContent=t.lado==='bom'?'Fazemos bem':'Podemos melhorar';
  const b=document.createElement('span');
  b.textContent=citacoes(t.ocorrencias)+(t.lado==='melhorar'?' · criticidade média '+dec(t.critMedia):'');
  d.append(a,b);d.hidden=false;
  const W=inst.area.clientWidth, H=inst.area.clientHeight;
  const x=parseFloat(el.style.left)||0, y=parseFloat(el.style.top)||0, w=el.offsetWidth, h=el.offsetHeight;
  const tw=d.offsetWidth, th=d.offsetHeight;
  let top=y-th-10; if(top<6)top=y+h+10;
  d.style.left=Math.round(Math.max(6,Math.min(W-tw-6,x+w/2-tw/2)))+'px';
  d.style.top=Math.round(Math.max(6,Math.min(H-th-6,top)))+'px';
}
function esconderDica(inst){if(inst.dica)inst.dica.hidden=true}

/* ---------- ligação com a tela ---------- */
function criar(slide){
  const area=$('.nuvem-area',slide), termos=$('.nuvem-termos',slide), vazio=$('.nuvem-vazio',slide);
  if(!area||!termos||!vazio)return null;
  const inst={slide,area,termos,vazio,dica:$('.nuvem-dica',area),sonda:$('.nuvem-medida',area),
    modo:'palavras',rodada:rodadaDe(slide),mapa:new Map(),porChave:new Map(),sujo:true,fontes:false,ultimoMs:0,termosNaNuvem:0,
    tabela:obterTabela(slide.dataset.tabela||'brainstorming')};
  if(!inst.sonda){inst.sonda=document.createElement('span');inst.sonda.className='nuvem-termo nuvem-medida';inst.sonda.setAttribute('aria-hidden','true');area.appendChild(inst.sonda)}
  if(!inst.dica){inst.dica=document.createElement('div');inst.dica.className='nuvem-dica';inst.dica.hidden=true;area.appendChild(inst.dica)}

  sincronizarLegenda(slide);
  slide.addEventListener('click',e=>{
    const c=e.target.closest('.nuvem-crit-btn');
    if(c){const li=c.closest('.nuvem-rank-item');if(li)ajustarCriticidade(inst,li.dataset.chave,c.dataset.valor);return}
    const b=e.target.closest('.nuvem-alterna-btn');if(!b)return;
    inst.modo=b.dataset.modo==='frases'?'frases':'palavras';
    $$('.nuvem-alterna-btn',slide).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    renderizar(inst);
  });
  const sobre=e=>{const el=e.target.closest&&e.target.closest('.nuvem-termo:not(.nuvem-medida)');if(el&&slide.contains(el))mostrarDica(inst,el)};
  const fora=e=>{if(!(e.relatedTarget&&e.relatedTarget.closest&&e.relatedTarget.closest('.nuvem-termo:not(.nuvem-medida)')))esconderDica(inst)};
  slide.addEventListener('mouseover',sobre);
  slide.addEventListener('focusin',sobre);
  slide.addEventListener('mouseout',fora);
  slide.addEventListener('focusout',fora);

  if(inst.tabela&&!tabelasOuvidas.has(inst.tabela.nome)){
    tabelasOuvidas.set(inst.tabela.nome,true);
    inst.tabela.on(()=>agendar(inst.tabela.nome));
  }
  return inst;
}

/** Junta várias gravações seguidas (ex.: importação de CSV) em uma única redesenhada. */
let adiado=null;
const pendentes=new Set();
function agendar(nomeTabela){
  pendentes.add(nomeTabela);
  clearTimeout(adiado);
  adiado=setTimeout(()=>{
    const nomes=Array.from(pendentes);pendentes.clear();
    instancias.filter(i=>i.tabela&&nomes.includes(i.tabela.nome)).forEach(renderizar);
  },40);
}

$$('.slide[data-layout="nuvem"]').forEach(s=>{const i=criar(s);if(i)instancias.push(i)});

S.on('slide',e=>{
  const inst=instancias.find(i=>i.slide===e.detail.slide);
  if(inst)renderizar(inst);
});
S.on('pronto',()=>instancias.forEach(i=>{if(i.slide.classList.contains('active')||i.sujo)renderizar(i)}));

/** API mínima: funções puras (teste) + redesenho manual. */
S.nuvem={
  processar,tamanho,colocar,lerLinhas,singular,tokens,STOP,
  constantes:{MIN_PX,TETOS,ALVO,MAX_TERMOS,ANCORA,MULT_CRIT},
  instancias:()=>instancias,
  atualizar:()=>instancias.forEach(renderizar)
};
})();
