/* ==========================================================================
   55 · QUADRO — tabela editável ao vivo, ligada a uma tabela CSV (SUMMIT.dados).
   Dirigido por atributos (ver conteudo/modelos/55-quadro.html): a <section data-layout="quadro" data-tabela data-assunto>
   declara as colunas nos <th data-campo data-tipo …>; este script lê os <th>, gera o <tbody> e grava cada edição pela
   camada de dados (adicionar / atualizar / remover). Nunca toca em localStorage; textos entram por textContent.

   Fluxo de dados:  tabela.linhas() filtradas por assunto  →  sincronizar() (diff por id, não refaz o que tem foco)
                    edição na tela  →  tabela.atualizar(id, {campo: valor})  →  tabela.on(fn) repinta o que mudou.
   Teclado:  Enter avança (pula o contador; na última célula da última linha cria linha) · Tab/Shift+Tab trocam de campo · Esc tira o foco.
             Os atalhos do deck já ignoram campos editáveis; em botões, o núcleo decide: foco por teclado → Espaço aciona o botão; foco por mouse → Espaço avança a tela.
   Prazo:    tripla dia/mês/ano (ISO no CSV). Ajuda "D+N" sobre data-referencia, dia da semana e aviso de fim de semana/feriado.
   Contador: coluna data-tipo="contador" (botões − e + com o valor inteiro >= 0 no meio) = votação por mãos levantadas.
             Cada toque grava pela camada de dados (tabela.atualizar). data-ordenar="<campo>" na <section> liga o botão
             "Ordenar por votos" (alterna; só muda a ORDEM NA TELA, nunca a do CSV; não reordena enquanto alguém digita).
   Linhas visíveis: densidade adaptativa (data-densidade="compacta" no .quadro quando as linhas não cabem), cabeçalho sticky
             e indicador "+N linhas abaixo" (com degradê) sempre que houver linhas fora da vista. A área de rolagem recebe
             data-rolagem (rolagem intencional, conta para a auditoria).
   Remoção:  remover linha e "Limpar quadro" mostram "… removida(s) · Desfazer" por 6 s (role=status). Desfazer devolve as
             linhas com os mesmos ids e valores, na posição de antes. Nada de alert/confirm.
   API pública (window.SUMMIT.quadro): analisarPrazo(iso, referenciaIso), FERIADOS, sincronizar(), quadros.
   ========================================================================== */
(function(){
'use strict';
const S=window.SUMMIT;
if(!S||!S.dados)return;
const $=S.$, $$=S.$$;
const SVG='http://www.w3.org/2000/svg';

const ESPERA_GRAVAR=350;      // ms entre a última tecla e a gravação
const TEMPO_CONFIRMAR=4000;   // ms da confirmação de "Limpar quadro" (manter em sincronia com a animação do CSS)
const MAX_TEXTO=300;          // teto de caracteres colado numa célula
const TEMPO_DESFAZER=6000;    // ms em que "Desfazer" fica disponível após remover linha(s)
const MAX_VOTOS=999;          // teto do contador (cabe na célula e evita cliques em excesso)

/* Feriados NACIONAIS de 2026–2027 (AAAA-MM-DD → nome). Não inclui pontos facultativos nem feriados estaduais/municipais;
   ampliar aqui quando o deck for reaproveitado em outra data. */
const FERIADOS=Object.freeze({
  '2026-10-12':'Nossa Senhora Aparecida',
  '2026-11-02':'Finados',
  '2026-11-15':'Proclamação da República',
  '2026-11-20':'Consciência Negra',
  '2026-12-25':'Natal',
  '2027-01-01':'Confraternização Universal'
});
const DIAS=['dom','seg','ter','qua','qui','sex','sáb'];
const DIAS_LONGOS=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];

/* Ícones das opções: "uso" = símbolo do sprite do deck; "d" = traços próprios (viewBox 24, stroke herdado de .ico). */
const ICONES={
  sugestao:{d:['M9 18h6','M10 21h4','M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z']},
  duvida:{d:['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z','M9.6 9.6a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.2.9-1.2 1.8','M12 16.6v.4']},
  risco:{uso:'alerta'},
  aberto:{d:['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z']},
  andamento:{uso:'relogio'},
  concluido:{uso:'check'},
  padrao:{d:['M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z']}
};

/* ---------- utilidades de DOM ---------- */
function criar(tag,classe,texto){
  const e=document.createElement(tag);
  if(classe)e.className=classe;
  if(texto!=null)e.textContent=texto;
  return e;
}
function svgBase(){
  const s=document.createElementNS(SVG,'svg');
  s.setAttribute('class','ico');s.setAttribute('viewBox','0 0 24 24');
  s.setAttribute('aria-hidden','true');s.setAttribute('focusable','false');
  return s;
}
/** Ícone do sprite do deck (#i-nome). */
function iconeSprite(nome){
  const s=svgBase(),u=document.createElementNS(SVG,'use');
  u.setAttribute('href','#i-'+nome);s.appendChild(u);return s;
}
/** Ícone de uma opção (sugestao, duvida, risco, aberto, andamento, concluido; outro valor = ícone neutro). */
function iconeOpcao(valor){
  const def=ICONES[valor]||ICONES.padrao;
  if(def.uso)return iconeSprite(def.uso);
  const s=svgBase();
  def.d.forEach(d=>{const p=document.createElementNS(SVG,'path');p.setAttribute('d',d);s.appendChild(p)});
  return s;
}
const maiuscula=t=>t?t.charAt(0).toUpperCase()+t.slice(1):t;
const pad2=v=>String(v).padStart(2,'0');
/** Valor de um contador vindo do CSV: inteiro entre 0 e MAX_VOTOS (vazio ou inválido = 0). */
const inteiro=v=>{const n=parseInt(v,10);return n>0?Math.min(n,MAX_VOTOS):0};

/* ---------- datas (tudo em UTC para não sofrer com fuso/horário de verão) ---------- */
/** ISO AAAA-MM-DD → milissegundos UTC, ou null se não for uma data real entre 2000 e 2099. */
function paraUTC(iso){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');
  if(!m)return null;
  const a=+m[1],mes=+m[2],d=+m[3];
  if(a<2000||a>2099)return null;
  const t=Date.UTC(a,mes-1,d),x=new Date(t);
  return (x.getUTCFullYear()===a&&x.getUTCMonth()===mes-1&&x.getUTCDate()===d)?t:null;
}
/** Aceita ISO ou dd/mm/aaaa vindo de um CSV editado à mão; devolve ISO ou ''. */
function normalizarIso(v){
  v=String(v||'').trim();
  if(paraUTC(v)!=null)return v;
  const m=/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(v);
  if(m){const iso=m[3]+'-'+pad2(m[2])+'-'+pad2(m[1]);return paraUTC(iso)!=null?iso:''}
  return '';
}
const montarIso=(a,m,d)=>a+'-'+pad2(m)+'-'+pad2(d);

/**
 * Ajuda de prazo: dias após a referência (D+N), dia da semana e aviso (feriado nacional ou fim de semana).
 * @param {string} iso AAAA-MM-DD do prazo
 * @param {string} referencia AAAA-MM-DD do evento (opcional; sem ela `dias` é null)
 * @returns {{dias:(number|null),dia:string,diaLongo:string,aviso:string}|null} null se o prazo não for uma data válida
 */
function analisarPrazo(iso,referencia){
  const t=paraUTC(iso);
  if(t==null)return null;
  const dow=new Date(t).getUTCDay(), r=paraUTC(referencia);
  let aviso='';
  if(FERIADOS[iso])aviso='feriado: '+FERIADOS[iso];
  else if(dow===0||dow===6)aviso='fim de semana';
  return {dias:r==null?null:Math.round((t-r)/86400000),dia:DIAS[dow],diaLongo:DIAS_LONGOS[dow],aviso};
}
const rotuloDias=n=>'D'+(n<0?'-':'+')+Math.abs(n);

/** contentEditable aceito pelo navegador: 'plaintext-only' quando existe; senão 'true' (colagem é sanitizada à parte). */
const MODO_EDICAO=(function(){
  try{const t=document.createElement('div');t.contentEditable='plaintext-only';if(t.contentEditable==='plaintext-only')return 'plaintext-only'}catch(e){}
  return 'true';
})();

/* ==========================================================================
   Um quadro por <section>
   ========================================================================== */
function criarQuadro(secao){
  const nomeTabela=secao.dataset.tabela||'', assunto=secao.dataset.assunto||'';
  const tbody=$('.quadro-tabela tbody',secao), rodape=$('.quadro-rodape',secao);
  const caixa=$('.quadro',secao), rolagem=$('.quadro-rolagem',secao);
  if(!tbody||!rodape||!caixa||!rolagem)return null;
  rolagem.setAttribute('data-rolagem','');   // rolagem interna intencional (a auditoria não conta como recorte)

  const colunas=$$('thead th[data-campo]',secao).map((th,i)=>{
    const tipo=th.dataset.tipo||'texto';
    const valores=(th.dataset.opcoes||'').split(',').map(s=>s.trim()).filter(Boolean);
    const rotulos=(th.dataset.rotulos||'').split(',').map(s=>s.trim());
    const rotulo=Array.from(th.childNodes).filter(n=>n.nodeType===3).map(n=>n.nodeValue).join('').trim()||th.dataset.campo;
    return {
      campo:th.dataset.campo, tipo, rotulo,
      dica:th.dataset.dica||'',
      exemplo:th.dataset.exemplo!=null?th.dataset.exemplo:'',
      opcoes:valores.map((v,k)=>({valor:v,rotulo:rotulos[k]||maiuscula(v)})),
      compacto:th.hasAttribute('data-compacto'),
      padrao:th.dataset.padrao!=null?th.dataset.padrao:(valores[0]||''),
      primeiraTexto:false
    };
  });
  const primeiro=colunas.find(c=>c.tipo==='texto');
  if(primeiro){primeiro.primeiraTexto=true;if(!primeiro.exemplo&&secao.dataset.exemplo)primeiro.exemplo=secao.dataset.exemplo}
  const temNum=!!$('thead .quadro-col-num',secao), temAcoes=!!$('thead .quadro-col-acoes',secao);
  const nCols=$$('thead th',secao).length;
  const referencia=paraUTC(secao.dataset.referencia||'')!=null?secao.dataset.referencia:'';

  let tabela=null;
  try{tabela=S.dados.tabela(nomeTabela)}
  catch(e){
    console.error('[quadro] '+e.message);
    const tr=criar('tr'),td=criar('td');td.colSpan=nCols;
    td.textContent='Tabela "'+nomeTabela+'" não encontrada em dados/esquema.json.';
    tr.appendChild(td);tbody.appendChild(tr);
    return null;
  }
  const filtra=tabela.colunas.indexOf('assunto')>=0&&assunto!=='';
  const gravavel=campo=>tabela.colunas.indexOf(campo)>=0;

  const refs={
    n:$('[data-quadro-n]',rodape), rot:$('[data-quadro-rot]',rodape),
    grav:$('[data-quadro-gravacao]',rodape), aviso:$('[data-quadro-aviso]',rodape),
    limpar:$('[data-acao="limpar"]',rodape), adicionar:$('[data-acao="adicionar"]',rodape)
  };
  const pendentes=new Map();   // campo de texto → timer da gravação
  let timerConfirmar=null;

  /* Ordenar por votos: o botão vem do HTML (data-acao="ordenar") ou, se faltar, o script o cria ao lado de "Limpar quadro". */
  const campoOrdem=secao.dataset.ordenar||'';
  const colunaOrdem=colunas.find(c=>c.campo===campoOrdem)||null;
  refs.ordenar=$('[data-acao="ordenar"]',rodape);
  if(colunaOrdem&&!refs.ordenar){
    const b=criar('button','quadro-btn quadro-btn--ordenar');
    b.type='button';b.dataset.acao='ordenar';
    b.appendChild(iconeSprite('ajustar'));
    b.appendChild(criar('span','','Ordenar por '+colunaOrdem.rotulo.toLowerCase()));
    rodape.insertBefore(b,refs.limpar||refs.adicionar||null);
    refs.ordenar=b;
  }
  if(refs.ordenar){
    if(colunaOrdem)refs.ordenar.setAttribute('aria-pressed','false');
    else refs.ordenar.hidden=true;   // sem data-ordenar válido não há o que ordenar
  }
  let ordenando=false;             // visão ordenada ligada (só na tela; o CSV mantém a ordem de gravação)
  let janela=null;                 // janela de "Desfazer": {antes:[ids], removidas:Map(id→linha), limpou, timer}

  const daTela=l=>!filtra||l.assunto===assunto;
  const linhasDaTela=()=>tabela.linhas().filter(daTela);
  /* linha "em branco" = sem texto/data e sem voto (as opções sempre têm valor padrão e não contam) */
  const vazia=l=>!colunas.some(c=>c.tipo==='opcoes'?false:(c.tipo==='contador'?inteiro(l[c.campo])>0:String(l[c.campo]||'').trim()!==''));
  const linhasDom=()=>Array.from(tbody.children).filter(tr=>tr.dataset.id);
  const linhaPorId=id=>linhasDom().find(tr=>tr.dataset.id===id)||null;
  const celulas=tr=>Array.from(tr.children).filter(td=>td.dataset.campo);
  const celula=(tr,campo)=>celulas(tr).find(td=>td.dataset.campo===campo)||null;

  /* ---------- leitura de texto e gravação ---------- */
  const limparTexto=t=>String(t||'').replace(/[\r\n\u2028\u2029]+/g,' ').trim();
  function gravar(tr,campo,valor){
    if(!tr||!tr.dataset.id||!gravavel(campo))return;
    tabela.atualizar(tr.dataset.id,{[campo]:valor});
  }
  function agendar(campo){
    clearTimeout(pendentes.get(campo));
    pendentes.set(campo,setTimeout(()=>liberar(campo),ESPERA_GRAVAR));
  }
  /** Grava agora o que está pendente numa célula de texto. */
  function liberar(campo){
    if(!pendentes.has(campo))return;
    clearTimeout(pendentes.get(campo));pendentes.delete(campo);
    const td=campo.closest('td'),tr=td&&td.parentElement;
    if(tr)gravar(tr,td.dataset.campo,limparTexto(campo.textContent));
  }
  function liberarTudo(){Array.from(pendentes.keys()).forEach(liberar)}

  /* ---------- construção de linhas ---------- */
  function controleTexto(c){
    const f=criar('div','quadro-campo');
    f.setAttribute('contenteditable',MODO_EDICAO);
    f.setAttribute('role','textbox');f.setAttribute('aria-multiline','false');
    f.setAttribute('aria-label',c.rotulo);
    f.spellcheck=false;f.dataset.ph=c.dica;
    return f;
  }
  function controleData(c){
    const g=criar('div','quadro-data'),caixa=criar('div','quadro-data-campos');
    caixa.setAttribute('role','group');caixa.setAttribute('aria-label',c.rotulo);
    [['dia','dd',2],['mes','mm',2],['ano','aaaa',4]].forEach((p,i)=>{
      if(i)caixa.appendChild(criar('span','quadro-data-sep','/')).setAttribute('aria-hidden','true');
      const inp=criar('input','quadro-dmy quadro-dmy--'+p[0]);
      inp.type='text';inp.inputMode='numeric';inp.autocomplete='off';inp.maxLength=p[2];
      inp.placeholder=p[1];inp.dataset.parte=p[0];
      inp.setAttribute('aria-label',c.rotulo+': '+({dia:'dia',mes:'mês',ano:'ano'})[p[0]]);
      caixa.appendChild(inp);
    });
    const rel=criar('span','quadro-data-rel');
    const aviso=criar('p','quadro-aviso');aviso.hidden=true;aviso.setAttribute('aria-live','polite');
    aviso.appendChild(iconeSprite('alerta'));aviso.appendChild(criar('span'));
    g.appendChild(caixa);g.appendChild(rel);g.appendChild(aviso);
    return g;
  }
  function controleOpcoes(c){
    const g=criar('div','quadro-seg'+(c.compacto?' quadro-seg--compacto':''));
    g.setAttribute('role','radiogroup');g.setAttribute('aria-label',c.rotulo);
    c.opcoes.forEach(o=>{
      const b=criar('button','quadro-op');b.type='button';
      b.setAttribute('role','radio');b.setAttribute('aria-checked','false');b.tabIndex=-1;
      b.setAttribute('aria-label',o.rotulo);b.dataset.valor=o.valor;
      b.appendChild(iconeOpcao(o.valor));b.appendChild(criar('span','quadro-op-txt',o.rotulo));
      g.appendChild(b);
    });
    return g;
  }
  /** Contador (votação por mãos levantadas): [−] valor [+]. Desabilitado via aria-disabled para não perder o foco no 0. */
  function controleContador(c){
    const g=criar('div','quadro-cont');
    g.setAttribute('role','group');g.setAttribute('aria-label',c.rotulo);
    [['menos','voto-menos'],['mais','voto-mais']].forEach((p,i)=>{
      if(i)g.appendChild(criar('output','quadro-cont-valor','0'));
      const b=criar('button','quadro-cont-btn quadro-cont-btn--'+p[0]);
      b.type='button';b.dataset.acao=p[1];b.appendChild(iconeSprite(p[0]));
      g.appendChild(b);
    });
    return g;
  }
  function criarLinha(id){
    const tr=criar('tr','quadro-linha');tr.dataset.id=id;
    if(temNum)tr.appendChild(criar('td','quadro-num'));
    colunas.forEach(c=>{
      const td=criar('td','quadro-cel');td.dataset.campo=c.campo;td.dataset.tipo=c.tipo;
      td.appendChild(c.tipo==='data'?controleData(c):(c.tipo==='opcoes'?controleOpcoes(c):(c.tipo==='contador'?controleContador(c):controleTexto(c))));
      tr.appendChild(td);
    });
    if(temAcoes){
      const td=criar('td','quadro-acoes'),b=criar('button','quadro-remover');
      b.type='button';b.dataset.acao='remover';b.appendChild(iconeSprite('x'));
      td.appendChild(b);tr.appendChild(td);
    }
    return tr;
  }

  /* ---------- prazo: ajuda D+N e aviso ---------- */
  function pintarAjudaData(td,iso,erro){
    const rel=$('.quadro-data-rel',td),aviso=$('.quadro-aviso',td),caixa=$('.quadro-data-campos',td);
    const an=iso?analisarPrazo(iso,referencia):null;
    rel.textContent='';
    if(an){
      rel.appendChild(criar('span','',(an.dias==null?'':rotuloDias(an.dias)+' · ')+an.dia)).setAttribute('aria-hidden','true');
      rel.appendChild(criar('span','sr-only',(an.dias==null?'':(an.dias===0?'no dia do evento, ':Math.abs(an.dias)+(Math.abs(an.dias)===1?' dia ':' dias ')+(an.dias<0?'antes':'depois')+' do evento, '))+an.diaLongo));
    }
    const msg=erro||(an&&an.aviso)||'';
    aviso.hidden=!msg;
    $('span',aviso).textContent=msg;
    if(erro)caixa.setAttribute('data-invalido','');else caixa.removeAttribute('data-invalido');
  }
  const camposData=td=>$$('.quadro-dmy',td);
  function escreverData(td,iso){
    const [d,m,a]=camposData(td);
    if(/^\d{4}-\d{2}-\d{2}$/.test(iso)){a.value=iso.slice(0,4);m.value=iso.slice(5,7);d.value=iso.slice(8,10)}
    else{a.value='';m.value='';d.value=''}
  }
  /** Ano sugerido quando só dia e mês foram digitados: o primeiro que não cai antes da referência. */
  function anoPadrao(dia,mes){
    const r=referencia?new Date(paraUTC(referencia)):new Date();
    const ay=referencia?r.getUTCFullYear():r.getFullYear(), hoje=referencia?paraUTC(referencia):Date.UTC(r.getFullYear(),r.getMonth(),r.getDate());
    return Date.UTC(ay,mes-1,dia)<hoje?ay+1:ay;
  }
  /** Lê os três campos, valida e grava (ISO válido, ou vazio). `final` = o foco saiu do grupo. */
  function avaliarData(td,final){
    const tr=td.parentElement,[dI,mI,aI]=camposData(td);
    let d=dI.value,m=mI.value,a=aI.value;
    if(!d&&!m&&!a){delete td.dataset.rascunho;gravar(tr,td.dataset.campo,'');pintarAjudaData(td,'','');return}
    if(final&&d&&m&&!a){a=String(anoPadrao(+d,+m));aI.value=a}
    let iso='',erro='';
    if(d&&m&&a.length===4){
      iso=montarIso(a,m,d);
      if(paraUTC(iso)==null||d.length>2||m.length>2){iso='';erro='data inválida'}
    }else if(final)erro='data incompleta';
    if(iso){
      delete td.dataset.rascunho;
      if(final)escreverData(td,iso);
      gravar(tr,td.dataset.campo,iso);
      pintarAjudaData(td,iso,'');
    }else{
      td.dataset.rascunho='1';
      gravar(tr,td.dataset.campo,'');
      pintarAjudaData(td,'',erro);
    }
  }

  /* ---------- preencher uma linha a partir do CSV (sem mexer no que tem foco) ---------- */
  function preencher(tr,l){
    colunas.forEach(c=>{
      const td=celula(tr,c.campo);if(!td)return;
      const v=String(l[c.campo]==null?'':l[c.campo]);
      if(c.tipo==='texto'){
        const f=$('.quadro-campo',td);
        if(document.activeElement===f||pendentes.has(f))return;
        if(f.textContent!==v)f.textContent=v;
      }else if(c.tipo==='data'){
        if(td.contains(document.activeElement)||td.dataset.rascunho==='1')return;
        const iso=normalizarIso(v);
        escreverData(td,iso);pintarAjudaData(td,iso,'');
      }else if(c.tipo==='contador'){
        const n=inteiro(v),val=$('.quadro-cont-valor',td);
        if(val.textContent!==String(n))val.textContent=n;
        $('[data-acao="voto-menos"]',td).setAttribute('aria-disabled',n<=0?'true':'false');
        $('[data-acao="voto-mais"]',td).setAttribute('aria-disabled',n>=MAX_VOTOS?'true':'false');
      }else{
        const ops=$$('[role="radio"]',td);
        const atual=ops.some(b=>b.dataset.valor===v)?v:'';
        ops.forEach((b,i)=>{
          const marcado=b.dataset.valor===atual;
          b.setAttribute('aria-checked',marcado?'true':'false');
          b.tabIndex=(marcado||(!atual&&i===0))?0:-1;
        });
      }
    });
  }
  function numerar(){
    linhasDom().forEach((tr,i)=>{
      const n=i+1,num=$('.quadro-num',tr);
      if(num)num.textContent=n;
      const rem=$('.quadro-remover',tr);
      if(rem)rem.setAttribute('aria-label','Remover linha '+n);
      celulas(tr).forEach(td=>{
        const f=$('.quadro-campo',td),rot=colunas.find(c=>c.campo===td.dataset.campo).rotulo;
        if(f)f.setAttribute('aria-label',rot+', linha '+n);
        if(td.dataset.tipo==='contador'){
          $('.quadro-cont',td).setAttribute('aria-label',rot+', linha '+n);
          $('[data-acao="voto-menos"]',td).setAttribute('aria-label','Menos um em '+rot.toLowerCase()+', linha '+n);
          $('[data-acao="voto-mais"]',td).setAttribute('aria-label','Mais um em '+rot.toLowerCase()+', linha '+n);
        }
      });
    });
  }

  /* ---------- linha-exemplo e convite do quadro vazio ---------- */
  function montarExemplo(){
    const tr=criar('tr','quadro-linha-exemplo exemplo');tr.setAttribute('data-exemplo-linha','');
    if(temNum)tr.appendChild(criar('td','quadro-num'));
    colunas.forEach(c=>{
      const td=criar('td','quadro-cel');
      if(c.tipo==='texto'){
        const box=criar('div','quadro-exemplo-txt');
        if(c.primeiraTexto)box.appendChild(criar('span','exemplo-marca','exemplo'));
        box.appendChild(criar('span','',c.exemplo||c.dica||'—'));
        td.appendChild(box);
      }else if(c.tipo==='data'){
        const g=criar('div','quadro-data');
        const iso=normalizarIso(c.exemplo);
        const an=iso?analisarPrazo(iso,referencia):null;
        const p=iso?iso.split('-'):null;
        const box=criar('span','quadro-exemplo-txt',p?p[2]+'/'+p[1]+'/'+p[0]:'dd/mm/aaaa');
        g.appendChild(box);
        if(an){
          g.appendChild(criar('span','quadro-data-rel',(an.dias==null?'':rotuloDias(an.dias)+' · ')+an.dia));
          if(an.aviso){const av=criar('p','quadro-aviso');av.appendChild(iconeSprite('alerta'));av.appendChild(criar('span','',an.aviso));g.appendChild(av)}
        }
        td.appendChild(g);
      }else if(c.tipo==='contador'){
        const g=criar('div','quadro-cont');
        g.appendChild(criar('span','quadro-cont-valor',String(inteiro(c.exemplo))));
        td.appendChild(g);
      }else{
        const o=c.opcoes.find(x=>x.valor===c.exemplo)||c.opcoes[0];
        const box=criar('span','quadro-exemplo-op');
        if(o){box.appendChild(iconeOpcao(o.valor));box.appendChild(criar('span','',o.rotulo))}
        td.appendChild(box);
      }
      tr.appendChild(td);
    });
    if(temAcoes)tr.appendChild(criar('td','quadro-acoes'));
    return tr;
  }
  function montarConvite(){
    const tr=criar('tr','quadro-linha-vazio'),td=criar('td');td.colSpan=nCols;
    const b=criar('button','quadro-vazio-btn');b.type='button';b.dataset.acao='adicionar';
    b.appendChild(iconeSprite('mais'));b.appendChild(criar('span','',secao.dataset.vazio||'Registrar a primeira linha'));
    td.appendChild(b);tr.appendChild(td);return tr;
  }
  const trExemplo=montarExemplo(), trConvite=montarConvite();
  tbody.appendChild(trExemplo);tbody.appendChild(trConvite);

  /* ---------- avisos sobre a tabela: "+N linhas abaixo" e "Desfazer" (zero de altura; não roubam linhas) ---------- */
  const sobre=criar('div','quadro-sobre');
  const maisBtn=criar('button','quadro-mais');
  maisBtn.type='button';maisBtn.hidden=true;maisBtn.setAttribute('data-quadro-mais','');maisBtn.dataset.acao='rolar';
  const maisTxt=criar('span');maisBtn.appendChild(maisTxt);maisBtn.appendChild(iconeSprite('seta'));
  const desfRegiao=criar('div','quadro-desfazer');
  desfRegiao.setAttribute('role','status');desfRegiao.setAttribute('aria-live','polite');desfRegiao.setAttribute('data-quadro-desfazer','');
  const desfCx=criar('div','quadro-desfazer-cx');desfCx.hidden=true;
  const desfMsg=criar('span','quadro-desfazer-msg');
  const desfBtn=criar('button','quadro-desfazer-btn');desfBtn.type='button';desfBtn.dataset.acao='desfazer';
  desfBtn.appendChild(iconeSprite('seta'));desfBtn.appendChild(criar('span','','Desfazer'));
  desfCx.appendChild(desfMsg);desfCx.appendChild(criar('span','quadro-desfazer-sep',' · '));desfCx.appendChild(desfBtn);
  desfRegiao.appendChild(desfCx);
  sobre.appendChild(maisBtn);sobre.appendChild(desfRegiao);
  caixa.insertBefore(sobre,rodape);

  /* ---------- sincronização com a tabela (diff por id) ---------- */
  /** Alguém está editando texto/data (ou há texto por gravar)? Então a ordem das linhas não muda por baixo dos dedos. */
  function digitando(){
    const f=document.activeElement;
    if(pendentes.size)return true;
    return !!f&&tbody.contains(f)&&(f.classList.contains('quadro-campo')||f.classList.contains('quadro-dmy'));
  }
  /** Ordem de exibição: a da tabela; com "Ordenar por votos" ligado, mais votos primeiro (empate mantém a ordem original). */
  function ordemDeExibicao(linhas){
    if(!ordenando||!colunaOrdem)return linhas;
    if(digitando()){   // adia: mantém a ordem que já está na tela (linhas novas vão ao fim)
      const pos=new Map(linhasDom().map((tr,i)=>[tr.dataset.id,i]));
      return linhas.map((l,i)=>[l,i]).sort((a,b)=>(pos.has(a[0].id)?pos.get(a[0].id):1e9)-(pos.has(b[0].id)?pos.get(b[0].id):1e9)||a[1]-b[1]).map(x=>x[0]);
    }
    return linhas.map((l,i)=>[l,i]).sort((a,b)=>inteiro(b[0][campoOrdem])-inteiro(a[0][campoOrdem])||a[1]-b[1]).map(x=>x[0]);
  }
  function sincronizar(){
    const foco=document.activeElement;
    const linhas=ordemDeExibicao(linhasDaTela()),ids=new Set(linhas.map(l=>l.id));
    linhasDom().forEach(tr=>{if(!ids.has(tr.dataset.id))tr.remove()});
    let moveu=false;
    linhas.forEach((l,i)=>{
      let tr=linhaPorId(l.id);
      if(!tr)tr=criarLinha(l.id);
      const atual=tbody.children[i];
      if(atual!==tr){tbody.insertBefore(tr,atual||null);moveu=true}
      preencher(tr,l);
    });
    /* mover um nó tira o foco dele: devolve ao mesmo controle (re-render sem roubar foco) */
    if(moveu&&foco&&foco!==document.activeElement&&foco.isConnected&&tbody.contains(foco)){
      foco.focus({preventScroll:true});
      const tr=foco.closest('tr');if(tr)tr.scrollIntoView({block:'nearest'});
    }
    trExemplo.hidden=trConvite.hidden=linhas.length>0;
    numerar();pintarRodape();reavaliar();
  }

  /* ---------- linhas visíveis: densidade adaptativa + indicador "+N linhas abaixo" ---------- */
  let reavaliando=false,quadroAnimacao=0;
  /** Densidade normal enquanto tudo cabe; "compacta" (linhas ≥ 56 px, texto ≥ 24 px) quando não cabe. Mede sem pintar. */
  function ajustarDensidade(){
    caixa.removeAttribute('data-densidade');
    if(rolagem.scrollHeight>rolagem.clientHeight+1)caixa.setAttribute('data-densidade','compacta');
  }
  /** Conta as linhas que não estão inteiras na vista (abaixo do corte) e mostra o indicador + degradê. */
  function pintarMais(){
    const rb=rolagem.getBoundingClientRect(),esc=rb.height/(rolagem.clientHeight||1);
    let fora=0;
    linhasDom().forEach(tr=>{if(tr.getBoundingClientRect().bottom>rb.bottom+2*esc)fora++});
    maisBtn.hidden=fora===0;
    maisTxt.textContent='+'+fora+(fora===1?' linha abaixo':' linhas abaixo');
    rolagem.toggleAttribute('data-mais-baixo',fora>0);
  }
  function reavaliar(){
    if(reavaliando||!rolagem.clientHeight)return;   // tela oculta: nada a medir
    reavaliando=true;
    try{ajustarDensidade();pintarMais()}finally{reavaliando=false}
  }
  function agendarReavaliar(){
    if(quadroAnimacao)return;
    quadroAnimacao=requestAnimationFrame(()=>{quadroAnimacao=0;reavaliar()});
  }
  rolagem.addEventListener('scroll',agendarReavaliar,{passive:true});
  if(window.ResizeObserver){   // digitar que quebra linha, fonte carregando, tela aparecendo
    const ro=new ResizeObserver(agendarReavaliar);
    ro.observe(rolagem);ro.observe($('.quadro-tabela',secao));
  }

  /* ---------- rodapé: contador, gravação, limpar ---------- */
  function pintarRodape(){
    const lin=linhasDaTela(),n=lin.filter(l=>!vazia(l)).length;
    if(refs.n)refs.n.textContent=n;
    if(refs.rot)refs.rot.textContent=n===1?'registrada':'registradas';
    if(refs.limpar){refs.limpar.disabled=lin.length===0;if(!lin.length)desarmar()}
    if(refs.grav){
      const st=S.dados.estado(),pasta=st.conectada&&st.permissao;
      const cod=tabela.conflito?'conflito':(pasta?((tabela.salvando||tabela.sujo)?'gravando':'gravado'):'navegador');
      const txt={conflito:'conflito no CSV',gravando:'gravando…',gravado:'gravado em CSV',navegador:'salvo no navegador'}[cod];
      const ico={conflito:'alerta',gravando:'relogio',gravado:'check',navegador:'quadro'}[cod];
      refs.grav.dataset.estado=cod;
      $('span',refs.grav).textContent=txt;
      const u=$('use',refs.grav);if(u)u.setAttribute('href','#i-'+ico);
    }
  }
  function avisar(msg){
    if(!refs.aviso)return;
    refs.aviso.textContent='';
    setTimeout(()=>{refs.aviso.textContent=msg},30);
  }
  function armar(){
    refs.limpar.dataset.estado='confirmar';
    $('span',refs.limpar).textContent='Confirmar limpeza';
    trocarIconeLimpar('alerta');
    clearTimeout(timerConfirmar);timerConfirmar=setTimeout(desarmar,TEMPO_CONFIRMAR);
  }
  function desarmar(){
    clearTimeout(timerConfirmar);timerConfirmar=null;
    if(!refs.limpar||refs.limpar.dataset.estado!=='confirmar')return;
    delete refs.limpar.dataset.estado;
    $('span',refs.limpar).textContent='Limpar quadro';
    trocarIconeLimpar('x');
  }
  function trocarIconeLimpar(nome){const u=$('use',refs.limpar);if(u)u.setAttribute('href','#i-'+nome)}
  function limparQuadro(){
    desarmar();
    liberarTudo();   // grava o que ainda estava por gravar: o "Desfazer" devolve o texto como estava
    removerComDesfazer(linhasDaTela(),true);
    if(refs.adicionar)refs.adicionar.focus();
  }

  /* ---------- remover com "Desfazer" (6 s): devolve as linhas com os mesmos ids e valores, na posição de antes ---------- */
  function mensagemDesfazer(){
    const n=janela.removidas.size,t=n===1?'Linha removida':n+' linhas removidas';
    return janela.limpou?'Quadro limpo: '+t:t;
  }
  function pintarDesfazer(){
    desfMsg.textContent=mensagemDesfazer();
    desfCx.hidden=false;
    clearTimeout(janela.timer);janela.timer=setTimeout(fecharDesfazer,TEMPO_DESFAZER);
  }
  function fecharDesfazer(){
    if(janela)clearTimeout(janela.timer);
    janela=null;desfCx.hidden=true;desfMsg.textContent='';
  }
  /** Remove as linhas (uma só gravação) e abre/estende a janela de desfazer. */
  function removerComDesfazer(ls,limpou){
    if(!ls.length)return;
    if(!janela)janela={antes:tabela.linhas().map(l=>l.id),removidas:new Map(),limpou:false,timer:null};
    ls.forEach(l=>janela.removidas.set(l.id,{...l}));
    if(limpou)janela.limpou=true;
    const ids=new Set(ls.map(l=>l.id));
    tabela.remover(l=>ids.has(l.id));
    pintarDesfazer();
  }
  function desfazer(){
    if(!janela)return;
    const j=janela,atuais=tabela.linhas(),porId=new Map(atuais.map(l=>[l.id,l]));
    const resultado=[],devolvidas=[];
    j.antes.forEach(id=>{
      if(porId.has(id)){resultado.push(porId.get(id));porId.delete(id)}
      else if(j.removidas.has(id)){resultado.push(j.removidas.get(id));devolvidas.push(id)}
    });
    porId.forEach(l=>resultado.push(l));   // linhas criadas depois da remoção ficam no fim
    fecharDesfazer();
    tabela.substituir(resultado);   // mesmos ids e valores (atualizado_em vazio das sementes é carimbado pela camada de dados)
    const primeira=devolvidas.find(id=>linhaPorId(id));
    if(primeira)focarLinha(primeira);
    else if(refs.adicionar)refs.adicionar.focus();
  }

  /* ---------- foco e navegação ---------- */
  function entradaDaCelula(td){
    if(!td)return null;
    if(td.dataset.tipo==='texto')return $('.quadro-campo',td);
    if(td.dataset.tipo==='data')return $('.quadro-dmy',td);
    if(td.dataset.tipo==='contador')return $('[data-acao="voto-mais"]',td);
    return $('[role="radio"][tabindex="0"]',td)||$('[role="radio"]',td);
  }
  function focar(el){
    if(!el)return;
    el.focus();
    const tr=el.closest('tr');
    if(tr)tr.scrollIntoView({block:'nearest'});
  }
  function focarLinha(id){
    const tr=linhaPorId(id);
    if(tr)focar(entradaDaCelula(celulas(tr)[0]));
  }
  /** Enter: vai à próxima célula; na última célula da última linha cria uma linha. */
  function avancar(origem){
    const td=origem.closest('td[data-campo]'),tr=td&&td.parentElement;
    if(!tr)return;
    /* a votação é por toque/clique: o Enter do fluxo de digitação pula o contador (Tab ainda chega nele) */
    const tds=celulas(tr),i=tds.indexOf(td),seguinte=tds.slice(i+1).find(c=>c.dataset.tipo!=='contador');
    if(seguinte){focar(entradaDaCelula(seguinte));return}
    const prox=tr.nextElementSibling;
    if(prox&&prox.dataset.id){focar(entradaDaCelula(celulas(prox)[0]));return}
    adicionarLinha();
  }
  /** Cria uma linha (ou reaproveita a última, se estiver em branco) e leva o foco à sua 1ª célula. */
  function adicionarLinha(){
    const lin=linhasDaTela(),ultima=lin[lin.length-1];
    if(ultima&&vazia(ultima)){focarLinha(ultima.id);return ultima.id}
    const dados={};
    if(gravavel('assunto'))dados.assunto=assunto;
    colunas.forEach(c=>{
      if(c.tipo==='opcoes'&&gravavel(c.campo))dados[c.campo]=c.padrao;
      else if(c.tipo==='contador'&&gravavel(c.campo))dados[c.campo]='0';
    });
    const id=tabela.adicionar(dados);
    focarLinha(id);
    return id;
  }
  function removerLinha(tr){
    const irmas=linhasDom(),i=irmas.indexOf(tr),destino=irmas[i+1]||irmas[i-1]||null;
    liberarTudo();   // texto ainda por gravar entra no que o "Desfazer" devolve
    const l=tabela.obter(tr.dataset.id);
    if(l)removerComDesfazer([l],false);
    if(destino&&destino.isConnected)focar(entradaDaCelula(celulas(destino)[0]));
    else if(refs.adicionar)refs.adicionar.focus();
  }
  /** Descarta linhas em branco que não têm mais o foco (o quadro não acumula linhas vazias). */
  function purgar(){
    const foco=document.activeElement;
    linhasDaTela().forEach(l=>{
      if(!vazia(l))return;
      const tr=linhaPorId(l.id);
      if(tr&&(tr.contains(foco)||tr.querySelector('[data-rascunho]')||Array.from(pendentes.keys()).some(f=>tr.contains(f))))return;
      tabela.remover(l.id);
    });
  }
  function escolher(op){
    const td=op.closest('td'),tr=td&&td.parentElement;
    if(!tr)return;
    gravar(tr,td.dataset.campo,op.dataset.valor);   // a tabela avisa (tabela.on) e sincronizar() repinta
    op.focus();
  }
  /** Soma/subtrai um voto: parte do valor GRAVADO (não do que está na tela), então cliques rápidos nunca se perdem. */
  function votar(btn,delta){
    const td=btn.closest('td'),tr=td&&td.parentElement,l=tr&&tabela.obter(tr.dataset.id);
    if(!l)return;
    const n=inteiro(l[td.dataset.campo]),novo=Math.max(0,Math.min(MAX_VOTOS,n+delta));
    if(novo!==n)gravar(tr,td.dataset.campo,String(novo));
  }
  /** Liga/desliga a visão ordenada por votos (só na tela). */
  function alternarOrdem(){
    ordenando=!ordenando;
    if(refs.ordenar){
      refs.ordenar.setAttribute('aria-pressed',ordenando?'true':'false');
      if(ordenando)refs.ordenar.dataset.estado='ativo';else delete refs.ordenar.dataset.estado;
      const u=$('use',refs.ordenar);if(u)u.setAttribute('href','#i-'+(ordenando?'check':'ajustar'));
    }
    sincronizar();
    avisar(ordenando?'Linhas ordenadas por '+colunaOrdem.rotulo.toLowerCase()+'.':'Linhas na ordem de registro.');
  }

  /* ---------- eventos (delegados na <section>) ---------- */
  secao.addEventListener('click',e=>{
    const op=e.target.closest('[role="radio"]');
    if(op&&secao.contains(op)){escolher(op);return}
    const b=e.target.closest('[data-acao]');
    if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')return;
    const a=b.dataset.acao;
    if(a==='adicionar')adicionarLinha();
    else if(a==='remover')removerLinha(b.closest('tr'));
    else if(a==='limpar'){if(b.dataset.estado==='confirmar')limparQuadro();else armar()}
    else if(a==='voto-mais')votar(b,1);
    else if(a==='voto-menos')votar(b,-1);
    else if(a==='ordenar'&&colunaOrdem)alternarOrdem();
    else if(a==='desfazer')desfazer();
    else if(a==='rolar')rolagem.scrollTop+=Math.round(rolagem.clientHeight*.8);
  });

  secao.addEventListener('keydown',e=>{
    const alvo=e.target;
    if(!alvo.closest('.quadro-tabela'))return;
    if(e.key==='Escape'){alvo.blur();return}
    if(e.isComposing)return;
    const op=alvo.closest('[role="radio"]');
    if(op){teclaOpcao(e,op);return}
    const bc=alvo.closest('.quadro-cont-btn');
    if(bc){teclaContador(e,bc);return}
    if(alvo.classList.contains('quadro-campo')){if(e.key==='Enter'){e.preventDefault();avancar(alvo)}return}
    if(alvo.classList.contains('quadro-dmy'))teclaData(e,alvo);
  });
  function teclaOpcao(e,op){
    const ops=$$('[role="radio"]',op.parentElement),n=ops.length;
    let i=ops.indexOf(op);
    const k=e.key;
    if(k==='Enter'){e.preventDefault();avancar(op);return}
    if(k==='ArrowRight'||k==='ArrowDown')i=(i+1)%n;
    else if(k==='ArrowLeft'||k==='ArrowUp')i=(i-1+n)%n;
    else if(k==='Home')i=0;
    else if(k==='End')i=n-1;
    else return;
    e.preventDefault();e.stopPropagation();
    escolher(ops[i]);
  }
  /** Contador: Enter avança (como nas outras células; não vota sem querer); + e − votam sem passar o cronômetro do deck. */
  function teclaContador(e,btn){
    const k=e.key;
    if(k==='Enter'){e.preventDefault();avancar(btn);return}
    const d=(k==='+'||k==='=')?1:((k==='-'||k==='_')?-1:0);
    if(!d)return;
    e.preventDefault();e.stopPropagation();
    votar(btn,d);
  }
  function teclaData(e,inp){
    const partes=$$('.quadro-dmy',inp.closest('td')),i=partes.indexOf(inp),k=e.key;
    const irPara=(j,fim)=>{const p=partes[j];p.focus();if(fim)p.setSelectionRange(p.value.length,p.value.length)};
    if(k==='Enter'){e.preventDefault();avancar(inp);return}
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(/^[\/.\-]$/.test(k)){e.preventDefault();if(inp.value&&i<2){if(inp.value.length===1)inp.value='0'+inp.value;avaliarData(inp.closest('td'),false);irPara(i+1)}return}
    if(k.length===1&&!/\d/.test(k)){e.preventDefault();return}
    if(k==='Backspace'&&inp.value===''&&i>0){e.preventDefault();irPara(i-1,true);return}
    if(k==='ArrowLeft'&&inp.selectionStart===0&&inp.selectionEnd===0&&i>0){e.preventDefault();irPara(i-1,true);return}
    if(k==='ArrowRight'&&inp.selectionStart===inp.value.length&&i<2){e.preventDefault();irPara(i+1)}
  }

  secao.addEventListener('input',e=>{
    const alvo=e.target;
    if(alvo.classList.contains('quadro-campo')){
      if(!alvo.textContent)alvo.replaceChildren();   // tira <br> residual para o placeholder voltar
      agendar(alvo);return;
    }
    if(alvo.classList.contains('quadro-dmy')){
      const partes=$$('.quadro-dmy',alvo.closest('td')),i=partes.indexOf(alvo);
      alvo.value=alvo.value.replace(/\D/g,'').slice(0,alvo.maxLength);
      const v=alvo.value,digitando=/^insert/.test(e.inputType||'');
      if(digitando&&((i===0&&(v.length===2||(v.length===1&&+v>3)))||(i===1&&(v.length===2||(v.length===1&&+v>1))))){
        if(v.length===1)alvo.value='0'+v;
        partes[i+1].focus();
      }
      avaliarData(alvo.closest('td'),false);
    }
  });
  /* texto simples: sem quebra de linha e sem HTML vindo da área de transferência ou de arrastar */
  secao.addEventListener('beforeinput',e=>{
    if(e.target.classList&&e.target.classList.contains('quadro-campo')&&/^insert(Paragraph|LineBreak)$/.test(e.inputType))e.preventDefault();
  });
  secao.addEventListener('paste',e=>{
    const f=e.target.closest&&e.target.closest('.quadro-campo');
    if(!f)return;
    e.preventDefault();
    const t=((e.clipboardData||window.clipboardData).getData('text/plain')||'').replace(/\s*[\r\n]+\s*/g,' ').slice(0,MAX_TEXTO);
    if(!t)return;
    if(!document.execCommand('insertText',false,t)){
      const sel=window.getSelection();
      if(sel&&sel.rangeCount){const r=sel.getRangeAt(0);r.deleteContents();const n=document.createTextNode(t);r.insertNode(n);r.setStartAfter(n);r.collapse(true);sel.removeAllRanges();sel.addRange(r)}
      f.dispatchEvent(new Event('input',{bubbles:true}));
    }
  });
  secao.addEventListener('drop',e=>{if(e.target.closest&&e.target.closest('.quadro-campo'))e.preventDefault()});

  secao.addEventListener('focusin',e=>{if(e.target.classList&&e.target.classList.contains('quadro-dmy'))e.target.select()});
  secao.addEventListener('focusout',e=>{
    const alvo=e.target;
    if(alvo.classList.contains('quadro-campo'))liberar(alvo);
    const caixa=alvo.closest&&alvo.closest('.quadro-data-campos');
    if(caixa&&!caixa.contains(e.relatedTarget)){
      const td=caixa.closest('td'),[dI,mI]=camposData(td);
      if(dI.value.length===1)dI.value='0'+dI.value;
      if(mI.value.length===1)mI.value='0'+mI.value;
      avaliarData(td,true);
    }
    setTimeout(()=>{purgar();if(ordenando&&!digitando())sincronizar()},0);   // a ordem adiada durante a digitação entra agora
  });

  /* ---------- reações ---------- */
  tabela.on(()=>sincronizar());          // 'local' | 'arquivo' | 'servidor': repinta só o que mudou
  S.dados.aoMudar(pintarRodape);         // situação de gravação (pasta conectada, salvando, conflito)
  const notaRef=$('[data-nota-ref]',secao);
  if(notaRef&&referencia){const p=referencia.split('-');notaRef.textContent='D+N: dias após '+p[2]+'/'+p[1]+'/'+p[0]}
  else if(notaRef)notaRef.hidden=true;

  sincronizar();
  return {secao,tabela,sincronizar,purgar,desarmar,liberarTudo,reavaliar};
}

/* ---------- inicialização ---------- */
const quadros=[];
$$('.slide[data-layout="quadro"]',document.getElementById('deck')||document).forEach(secao=>{
  try{const q=criarQuadro(secao);if(q)quadros.push(q)}catch(e){console.error('[quadro] falha ao montar '+(secao.id||'tela'),e)}
});

S.on('slide',e=>{
  const aberta=e.detail&&e.detail.slide;
  quadros.forEach(q=>{
    if(q.secao===aberta){q.sincronizar();requestAnimationFrame(q.reavaliar)}   // a tela acabou de aparecer: mede de novo
    else{q.liberarTudo();q.desarmar();q.purgar()}
  });
});
S.on('pronto',()=>quadros.forEach(q=>q.sincronizar()));
addEventListener('pagehide',()=>quadros.forEach(q=>q.liberarTudo()));
document.addEventListener('visibilitychange',()=>{if(document.hidden)quadros.forEach(q=>q.liberarTudo())});

S.quadro={analisarPrazo,FERIADOS,sincronizar:()=>quadros.forEach(q=>q.sincronizar()),quadros};
})();
