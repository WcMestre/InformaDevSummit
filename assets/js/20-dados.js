/* ==========================================================================
   20 · DADOS — o CSV é a base de dados do deck.
   Toda tela interativa lê/grava por aqui (SUMMIT.dados.tabela('nome')); nunca direto em localStorage.

   Fluxo:  semente (CSV embutido no build  →  + CSV do servidor, SÓ se a tabela estiver "virgem")
           →  cópia de trabalho (localStorage, SEMPRE {linhas, sujo, seedHash, ciente})
           →  destino: arquivo CSV numa pasta conectada (File System Access, Chrome/Edge)  |  download manual.
   GitHub Pages é estático: o navegador não grava no servidor. A pasta conectada é o clone local de dados/;
   depois do evento: commit + push e o Pages passa a servir a base nova.

   Formato: UTF-8 com BOM · separador ';' (abre direto no Excel pt-BR; leitor aceita também ',' e TAB) · CRLF · aspas RFC 4180.
   Toda tabela tem 'id' (1ª coluna) e 'atualizado_em' (última), gerenciadas aqui.

   Segurança do CSV (injeção de fórmula): serializar() põe um apóstrofo (') na frente de toda célula que começa com
   = + - @ TAB ou CR (o Excel abriria como fórmula); parse() tira esse apóstrofo de volta. A ida-e-volta é idêntica:
   uma célula que já começa com apóstrofos seguidos de um desses caracteres ganha mais um apóstrofo e perde um na volta.
   Quem ler os CSV fora daqui (scripts, Excel) vê o apóstrofo nesses poucos casos.

   Regras que nunca podem quebrar (a sala nunca perde dado):
     1. A cópia local SEMPRE volta no F5/reabertura, mesmo já gravada ou baixada; 'sujo' só serve de aviso (beforeunload),
        nunca decide se restaura. Cópia diferente da semente e já exportada = 'divergente' (aviso, não bloqueia).
     2. O CSV do servidor só vale para tabela virgem (sem cópia local, sem edição, sem pasta conectada/pendente,
        nunca reconciliada com arquivo) — assim a pasta conectada nunca é atropelada pela rede.
     3. Arquivo × local diferentes = conflito: nada é gravado até resolver (Mesclar é o caminho recomendado).
     4. Falha ao gravar: 3 novas tentativas (1,5 s · 3 s · 6 s); depois estado 'falhou' + "Gravar agora".

   Origens emitidas por tabela.on(fn): 'local' · 'arquivo' · 'servidor' · 'repositorio' · 'outra-aba' · 'zerar'.
   ========================================================================== */
(function(){
'use strict';
const S=window.SUMMIT, $=S.$;
const DELIM=';', BOM='﻿', EOL='\r\n', NS='informa-summit-2026:';
const ATRASOS=[1500,3000,6000];              // retentativas de gravação (ms)
const CONFIRMA_MS=4000;                      // janela do "toque de novo para confirmar"

/* ---------- CSV ---------- */
/** Célula que o Excel trataria como fórmula (após zero ou mais apóstrofos de proteção). */
const PERIGOSA=/^'*[=+\-@\t\r]/, PROTEGIDA=/^'+[=+\-@\t\r]/;
/** colunas: string[]; linhas: objetos {coluna:valor}. Devolve texto CSV (; · CRLF · aspas RFC 4180) com células de fórmula protegidas. */
function serializar(colunas,linhas){
  const q=v=>{v=(v==null?'':String(v));if(PERIGOSA.test(v))v="'"+v;return /[";\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  const cab=c=>{c=String(c);return /[";\r\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c};
  return [colunas.map(cab).join(DELIM)].concat(linhas.map(l=>colunas.map(c=>q(l[c])).join(DELIM))).join(EOL)+EOL;
}
/* leitor interno: além de {colunas,linhas} conta as linhas mais largas que o cabeçalho (sinal de arquivo quebrado) */
function lerCsv(texto){
  texto=String(texto||'').replace(/^﻿/,'');
  const primeira=texto.split(/\r?\n/,1)[0]||'';
  const cont=ch=>(primeira.match(new RegExp(ch==='\t'?'\t':'\\'+ch,'g'))||[]).length;
  const d=[[';',cont(';')],[',',cont(',')],['\t',cont('\t')]].sort((a,b)=>b[1]-a[1])[0][0];
  const linhas=[];let cel='',lin=[],aspas=false;
  for(let i=0;i<texto.length;i++){
    const c=texto[i];
    if(aspas){ if(c==='"'){ if(texto[i+1]==='"'){cel+='"';i++} else aspas=false } else cel+=c }
    else if(c==='"')aspas=true;
    else if(c===d){lin.push(cel);cel=''}
    else if(c==='\n'||c==='\r'){ if(c==='\r'&&texto[i+1]==='\n')i++; lin.push(cel);cel='';linhas.push(lin);lin=[] }
    else cel+=c;
  }
  if(cel!==''||lin.length){lin.push(cel);linhas.push(lin)}
  const validas=linhas.filter(l=>!(l.length===1&&l[0]===''));
  if(!validas.length)return {colunas:[],linhas:[],largas:0};
  const colunas=validas[0].map(s=>s.trim());
  const des=v=>PROTEGIDA.test(v)?v.slice(1):v;
  return {colunas,largas:validas.slice(1).filter(l=>l.length>colunas.length).length,
    linhas:validas.slice(1).map(l=>{const o={};colunas.forEach((c,i)=>o[c]=l[i]==null?'':des(l[i]));return o})};
}
/** Lê CSV (aceita ; , ou TAB, BOM, CRLF/LF) → {colunas:string[], linhas:objeto[]}; desfaz a proteção de fórmula. */
function parse(texto){const r=lerCsv(texto);return {colunas:r.colunas,linhas:r.linhas}}

/* ---------- esquema e sementes (embutidos pelo montar.py) ---------- */
function json(id){try{const e=document.getElementById(id);return e?JSON.parse(e.textContent):{}}catch(e){return {}}}
const ESQUEMA=(json('dados-esquema').tabelas)||{};
const SEMENTES=json('dados-sementes');

const agora=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())};
const novoId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const hashTxt=s=>{s=String(s||'');let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)+'.'+s.length.toString(36)};
/** forma canônica para comparar conjuntos de linhas (ignora a ordem) */
const canon=(linhas,cols)=>JSON.stringify(linhas.map(l=>cols.map(c=>l[c])).sort((a,b)=>a[0]<b[0]?-1:(a[0]>b[0]?1:0)));
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const msgErro=e=>(e&&e.message)||String(e);

/** União por id; mesmo id → vence o atualizado_em mais novo (empate: a tela). Ordem: a do arquivo, depois o que só a tela tem. */
function mesclar(doArquivo,local){
  const porId=new Map(local.map(l=>[l.id,l])), vistos=new Set();
  let daTela=0;
  const res=doArquivo.map(a=>{
    vistos.add(a.id);const l=porId.get(a.id);
    if(l&&String(l.atualizado_em||'')>=String(a.atualizado_em||'')){daTela++;return l}
    return a;
  });
  local.forEach(l=>{if(!vistos.has(l.id)){res.push(l);daTela++}});
  return {linhas:res,doArquivo:doArquivo.length,daTela};
}

/* ---------- estado global de destino ---------- */
const destino={dir:null,nome:'',permissao:false,suportado:typeof window.showDirectoryPicker==='function',erro:'',restaurando:typeof window.showDirectoryPicker==='function'};
const tabelas={}, ouvintes=new Set();
const avisa=()=>{ouvintes.forEach(f=>{try{f()}catch(e){}});pintaChip()};
let mensagem={txt:'',erro:false};      // último resultado de uma ação do painel (lido pelo leitor de tela)

/* ---------- IndexedDB (guarda o handle da pasta) ---------- */
const idb={
  abrir(){return new Promise((ok,er)=>{try{const r=indexedDB.open('informa-summit-2026',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>ok(r.result);r.onerror=()=>er(r.error)}catch(e){er(e)}})},
  async get(k){const db=await this.abrir();return new Promise((ok,er)=>{const r=db.transaction('kv').objectStore('kv').get(k);r.onsuccess=()=>ok(r.result);r.onerror=()=>er(r.error)})},
  async set(k,v){const db=await this.abrir();return new Promise((ok,er)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=ok;t.onerror=()=>er(t.error)})},
  async del(k){const db=await this.abrir();return new Promise((ok,er)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').delete(k);t.oncomplete=ok;t.onerror=()=>er(t.error)})}
};

/* ---------- Tabela ---------- */
/**
 * Uma tabela CSV. Obtenha por SUMMIT.dados.tabela('nome'); colunas vêm de dados/esquema.json.
 *  .nome · .colunas (['id', …negócio…, 'atualizado_em'])
 *  .sujo (há dado ainda não exportado/gravado) · .salvando · .conflito · .divergente · .falhou · .erro
 *  .estado() → {sujo, salvando, conflito, divergente, falhou, erro, linhas, virgem, reconciliada, tentativa, ultimoSalvo}
 *  leitura:  linhas() · obter(id) · csv()                    escrita: adicionar(obj)→id · atualizar(id,patch) · remover(id|fn) · substituir(lista)
 *  fluxo:    on(fn(origem))→cancelar · gravar() · baixar() · validarImportacao(txt) · importar(txt)→{ok,erro?,linhas,idsRegenerados}
 */
class Tabela{
  constructor(nome,colunas){
    this.nome=nome;this.colunas=['id'].concat(colunas,['atualizado_em']);this._negocio=colunas;
    this._linhas=[];this._subs=new Set();
    this.sujo=false;this.conflito=false;this.salvando=false;this.divergente=false;this.falhou=false;this.erro='';this.ultimoSalvo=null;
    this._t=null;this._tr=null;this._fila=Promise.resolve();this._emFila=0;this._tentativa=0;this._v=0;
    this._virgem=true;this._trabalho=false;this._reconciliada=false;this._reconciliando=false;this._rec=null;
    this._arquivoTxt=null;this._arquivoN=0;this._servidorTxt=null;this._ciente='';this._lsFalhou=false;
    this._carregarLocalOuSemente();
  }
  _chave(){return 'dados:'+this.nome}
  _seedHash(){return hashTxt(SEMENTES[this.nome]||'')}
  _normaliza(l){const o={};this.colunas.forEach(c=>o[c]=l[c]==null?'':String(l[c]));if(!o.id)o.id=novoId();return o}
  /* garante id único (duplicado ou vazio ganha id novo); devolve {linhas, regenerados} */
  _unicos(lista){
    const vistos=new Set();let reg=0;
    const linhas=lista.map(l=>{
      if(!l.id||vistos.has(l.id)){let id;do{id=novoId()}while(vistos.has(id));l.id=id;reg++}
      vistos.add(l.id);return l;
    });
    return {linhas,regenerados:reg};
  }
  _deCsv(txt){return this._unicos(parse(txt).linhas.map(l=>this._normaliza(l))).linhas}
  _semente(){return this._deCsv(SEMENTES[this.nome]||'')}
  _lerLocal(){let l=null;try{l=JSON.parse(localStorage.getItem(NS+this._chave())||'null')}catch(e){}return l&&Array.isArray(l.linhas)?l:null}
  _persistirLocal(){
    try{localStorage.setItem(NS+this._chave(),JSON.stringify({linhas:this._linhas,sujo:this.sujo,seedHash:this._seedHash(),ciente:this._ciente}));this._lsFalhou=false}
    catch(e){this._lsFalhou=true}
  }
  /* cópia local existe e é diferente da semente → ADOTA (nunca descarta em silêncio); exportada mas diferente → 'divergente' */
  _carregarLocalOuSemente(){
    const local=this._lerLocal(), sem=this._semente();
    if(!local){this._linhas=sem;return}
    const minhas=this._unicos(local.linhas.map(l=>this._normaliza(l))).linhas;
    this.sujo=!!local.sujo;this._ciente=local.ciente||'';
    if(!this.sujo&&canon(minhas,this.colunas)===canon(sem,this.colunas)){this._linhas=sem;return}   // cópia igual à base: nada a proteger
    this._linhas=minhas;this._virgem=false;this._trabalho=true;
    this.divergente=!this.sujo&&this._ciente!==this._seedHash();
  }
  /* restaura a semente embutida e esquece a cópia local (zerar / outra aba zerou) */
  _restaurarSemente(){
    clearTimeout(this._t);clearTimeout(this._tr);
    this._linhas=this._semente();this.sujo=false;this.conflito=false;this.divergente=false;this.falhou=false;this.erro='';
    this._tentativa=0;this._trabalho=false;this._virgem=false;this._arquivoTxt=null;this._ciente='';this._v++;
  }
  _emitir(origem){this._subs.forEach(f=>{try{f(origem||'local')}catch(e){console.error(e)}});document.dispatchEvent(new CustomEvent('summit:dados',{detail:{tabela:this.nome,origem:origem||'local'}}));avisa()}
  _mudou(){this._virgem=false;this._trabalho=true;this.divergente=false;this._v++;this.sujo=true;this._persistirLocal();this._emitir('local');this._agendarGravacao()}
  estado(){return {sujo:this.sujo,salvando:this.salvando,conflito:this.conflito,divergente:this.divergente,falhou:this.falhou,erro:this.erro,
    linhas:this._linhas.length,virgem:this._virgem,reconciliada:this._reconciliada,tentativa:this._tentativa,ultimoSalvo:this.ultimoSalvo}}
  /* leitura */
  linhas(){return this._linhas.map(l=>({...l}))}
  obter(id){const l=this._linhas.find(x=>x.id===id);return l?{...l}:null}
  /* escrita */
  adicionar(obj){const l=this._normaliza({...obj,id:'',atualizado_em:agora()});this._linhas.push(l);this._mudou();return l.id}
  atualizar(id,patch){const l=this._linhas.find(x=>x.id===id);if(!l)return false;let m=false;Object.keys(patch).forEach(k=>{if(this._negocio.includes(k)&&l[k]!==String(patch[k]==null?'':patch[k])){l[k]=String(patch[k]==null?'':patch[k]);m=true}});if(m){l.atualizado_em=agora();this._mudou()}return m}
  remover(alvo){const n=this._linhas.length;this._linhas=this._linhas.filter(l=>typeof alvo==='function'?!alvo(l):l.id!==alvo);if(this._linhas.length!==n){this._mudou();return true}return false}
  substituir(lista){this._linhas=this._unicos(lista.map(l=>this._normaliza({...l,atualizado_em:l.atualizado_em||agora()}))).linhas;this._mudou()}
  on(fn){this._subs.add(fn);return()=>this._subs.delete(fn)}
  csv(){return serializar(this.colunas,this._linhas)}
  /* destino */
  _podeGravar(){return !!(destino.dir&&destino.permissao&&this._reconciliada&&!this.conflito)}
  _agendarGravacao(){clearTimeout(this._t);clearTimeout(this._tr);this._tentativa=0;this.falhou=false;if(!this._podeGravar())return;this._t=setTimeout(()=>this.gravar(),500)}
  /** Grava o CSV na pasta conectada. Não grava enquanto houver conflito. Falha → 3 retentativas, depois 'falhou'. */
  gravar(opt){
    opt=opt||{};
    if(!destino.dir||!destino.permissao||this.conflito)return Promise.resolve(false);
    if(!this._reconciliada)return reconciliar(this);            // antes de escrever, olha o que já existe no arquivo
    clearTimeout(this._t);clearTimeout(this._tr);
    if(opt.manual){this._tentativa=0;this.falhou=false}
    this._emFila++;this.salvando=true;avisa();
    const p=this._fila.then(async()=>{
      if(this.conflito)return false;
      try{
        const fh=await destino.dir.getFileHandle(this.nome+'.csv',{create:true});
        const w=await fh.createWritable();
        const v=this._v;await w.write(BOM+this.csv());await w.close();
        if(this._v===v){this.sujo=false;this._persistirLocal()}   // se houve edição durante a escrita, segue sujo e já há nova gravação agendada
        this.ultimoSalvo=agora();this.erro='';this.falhou=false;this._tentativa=0;destino.erro='';
        return true;
      }catch(e){
        this.erro=msgErro(e);this._tentativa++;
        if(this._tentativa<=ATRASOS.length){clearTimeout(this._tr);this._tr=setTimeout(()=>this.gravar(),ATRASOS[this._tentativa-1])}
        else this.falhou=true;
        return false;
      }finally{this._emFila--;this.salvando=this._emFila>0;avisa()}
    });
    this._fila=p;return p;
  }
  async _lerArquivo(){   // texto do arquivo; null se ainda não existe; outros erros sobem
    try{const fh=await destino.dir.getFileHandle(this.nome+'.csv');return await (await fh.getFile()).text()}
    catch(e){if(e&&e.name==='NotFoundError')return null;throw e}
  }
  /** Exporta o CSV (download). A cópia local continua valendo no F5; o aviso de saída só some se não houver mais nada pendente. */
  baixar(){
    const blob=new Blob([BOM+this.csv()],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=this.nome+'.csv';document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);
    this.sujo=false;this._persistirLocal();avisa();   // baixado = exportado
  }
  /** Confere um CSV antes de importar, sem tocar nos dados → {ok, erro?, linhas?, n?, idsRegenerados?}. Cabeçalho tem de ser idêntico ao esperado. */
  validarImportacao(texto){
    texto=String(texto==null?'':texto);
    if(texto.indexOf('�')>=0)return {ok:false,erro:'O arquivo não está em UTF-8 (caracteres quebrados). Salve como "CSV UTF-8" e tente de novo.'};
    const p=lerCsv(texto);
    if(!p.colunas.length)return {ok:false,erro:'O arquivo está vazio.'};
    if(p.colunas.join('\u0001')!==this.colunas.join('\u0001'))
      return {ok:false,erro:'Cabeçalho diferente do esperado para '+this.nome+'.csv. Esperado: '+this.colunas.join(';')+' · recebido: '+p.colunas.join(';')+'.'};
    if(p.largas)return {ok:false,erro:p.largas+' linha(s) com mais colunas que o cabeçalho; confira o separador.'};
    const vazios=p.linhas.filter(l=>!l.id).length;     // _normaliza já dá id novo aos vazios; aqui só contamos
    const u=this._unicos(p.linhas.map(l=>this._normaliza(l)));
    return {ok:true,linhas:u.linhas,n:u.linhas.length,idsRegenerados:u.regenerados+vazios};
  }
  /** Substitui os dados por um CSV válido (ids duplicados/vazios são regenerados). Arquivo inválido NUNCA troca dado. → {ok,erro?,linhas,idsRegenerados} */
  importar(texto){
    const v=this.validarImportacao(texto);
    if(!v.ok)return v;
    this._linhas=v.linhas.map(l=>({...l,atualizado_em:l.atualizado_em||agora()}));this._mudou();
    return {ok:true,linhas:v.n,idsRegenerados:v.idsRegenerados};
  }
  /* servidor (GitHub Pages): só vale para tabela virgem; senão apenas confirma que a cópia local já bate com o repositório */
  async _atualizarDoServidor(){
    if(!/^https?:$/.test(location.protocol))return;
    try{
      const r=await fetch('dados/'+this.nome+'.csv',{cache:'no-store'});if(!r.ok)return;
      this._servidorTxt=await r.text();this._aplicarServidor();
    }catch(e){}
  }
  _aplicarServidor(){
    if(this._servidorTxt==null)return;
    const l=this._deCsv(this._servidorTxt);
    if(this._virgem&&!destino.dir&&!destino.restaurando){
      if(canon(l,this.colunas)!==canon(this._linhas,this.colunas)){this._linhas=l;this._emitir('servidor')}   // não persiste: é só a base
    }else if(this.divergente&&!this.sujo&&canon(l,this.colunas)===canon(this._linhas,this.colunas)){this.divergente=false;avisa()}
  }
  /* outra aba do mesmo navegador mexeu na cópia local → adota (sem regravar o localStorage: não há eco) */
  _deOutraAba(){
    const local=this._lerLocal();
    if(!local){this._restaurarSemente();this._emitir('outra-aba');return}
    const novas=this._unicos(local.linhas.map(l=>this._normaliza(l))).linhas;
    const mudou=canon(novas,this.colunas)!==canon(this._linhas,this.colunas);
    this._virgem=false;this._trabalho=true;this.sujo=!!local.sujo;this._ciente=local.ciente||'';
    if(mudou){this._linhas=novas;this._v++;this._emitir('outra-aba')}else avisa();
    if(this.sujo)this._agendarGravacao();
  }
}

function tabela(nome,colunas){
  if(tabelas[nome])return tabelas[nome];
  const cols=colunas||(ESQUEMA[nome]&&ESQUEMA[nome].colunas);
  if(!cols)throw new Error('SUMMIT.dados: tabela "'+nome+'" não está em dados-esquema.json');
  const t=tabelas[nome]=new Tabela(nome,cols);
  t._atualizarDoServidor();
  if(destino.dir&&destino.permissao)reconciliar(t);
  avisa();
  return t;
}

/* ---------- pasta conectada ---------- */
/* Compara o arquivo da pasta com a tabela: igual → ok · tabela sem trabalho → adota o arquivo · senão → conflito (ou mescla, se opt.mesclarAuto) */
function reconciliar(t,opt){
  if(t._rec)return t._rec;
  t._rec=(async()=>{
    opt=opt||{};t._virgem=false;t._reconciliando=true;avisa();
    try{
      let txt;
      try{txt=await t._lerArquivo()}
      catch(e){t.erro=msgErro(e);t.falhou=true;return false}     // não conseguiu nem ler: não escreve por cima
      t.erro='';
      if(txt==null){t._reconciliada=true;await t.gravar();return true}     // arquivo ainda não existe: cria
      const doArq=t._deCsv(txt);t._arquivoN=doArq.length;
      if(canon(doArq,t.colunas)===canon(t._linhas,t.colunas)){t._reconciliada=true;t.sujo=false;t.divergente=false;t._persistirLocal();return true}
      if(!t._trabalho){t._reconciliada=true;t._linhas=doArq;t._trabalho=true;t.sujo=false;t.divergente=false;t._persistirLocal();t._emitir('arquivo');return true}
      if(opt.mesclarAuto&&t.sujo){t._reconciliada=true;t._arquivoTxt=txt;await aplicarMescla(t,txt);return true}
      t._reconciliada=true;t.conflito=true;t._arquivoTxt=txt;      // a sala decide no painel; enquanto isso nada é gravado
      abrirPainel();return true;
    }finally{
      t._reconciliando=false;t._rec=null;avisa();
      if(t.sujo&&t._podeGravar())t._agendarGravacao();
    }
  })();
  return t._rec;
}
async function aplicarMescla(t,txt){
  const m=mesclar(t._deCsv(txt),t._linhas);
  t._linhas=t._unicos(m.linhas).linhas;t.conflito=false;t._arquivoTxt=null;t.divergente=false;t._trabalho=true;t._v++;t.sujo=true;t._persistirLocal();
  t._emitir('arquivo');
  await t.gravar({manual:true});
  aviso('Mesclado '+t.nome+'.csv: arquivo '+m.doArquivo+' + tela '+t._linhas.length+' → '+m.linhas.length+' linhas, sem duplicar, gravado no arquivo.');
}
/**
 * Resolve uma divergência. Em conflito (arquivo × tela): 'mesclar' (padrão) · 'arquivo' (descarta a tela) · 'local' (sobrescreve o arquivo).
 * Em divergente (cópia do navegador × repositório): 'local' (manter) · 'repositorio' (descarta a cópia local).
 */
async function resolver(nome,quem){
  const t=tabelas[nome];if(!t)return false;
  quem=quem||'mesclar';
  if(t.conflito){
    let txt=t._arquivoTxt;
    try{const novo=await t._lerArquivo();if(novo!=null)txt=novo}catch(e){}     // relê: o arquivo pode ter mudado desde o aviso
    if(quem==='arquivo'&&txt!=null){t._linhas=t._deCsv(txt);t._trabalho=true;t.sujo=false;t.conflito=false;t._arquivoTxt=null;t.divergente=false;t._v++;t._persistirLocal();t._emitir('arquivo');aviso('Usado o arquivo de '+t.nome+'.csv; a tela anterior foi descartada.')}
    else if(quem==='local'||txt==null){t.conflito=false;t._arquivoTxt=null;await t.gravar({manual:true});aviso('Mantida a tela em '+t.nome+'.csv; o arquivo foi sobrescrito.')}
    else await aplicarMescla(t,txt);
  }else if(t.divergente){
    if(quem==='repositorio'){
      const sem=t._servidorTxt!=null?t._deCsv(t._servidorTxt):t._semente();
      try{localStorage.removeItem(NS+t._chave())}catch(e){}
      t._linhas=sem;t._trabalho=false;t.sujo=false;t.divergente=false;t._ciente='';t._virgem=false;t._v++;t._emitir('repositorio');aviso('Usado o repositório em '+t.nome+'.csv; a cópia local foi descartada.');
    }else{t._ciente=t._seedHash();t.divergente=false;t._persistirLocal();avisa();aviso('Mantida a cópia local de '+t.nome+'.csv.')}
  }else if(quem==='local')await t.gravar({manual:true});
  avisa();return true;
}
async function conectarPasta(){
  if(!destino.suportado){destino.erro='Este navegador não permite gravar em pasta. Use Chrome ou Edge, ou Baixar CSV.';avisa();return false}
  try{
    const dir=await window.showDirectoryPicker({id:'informa-summit-dados',mode:'readwrite'});
    soltarTabelas();destino.dir=dir;destino.nome=dir.name;destino.permissao=true;destino.erro='';
    try{await idb.set('pasta',dir)}catch(e){}
    for(const t of Object.values(tabelas))await reconciliar(t);
    avisa();return true;
  }catch(e){if(e&&e.name!=='AbortError')destino.erro=msgErro(e);avisa();return false}
}
/** Pasta já escolhida, permissão perdida (reinício do navegador): reautoriza e reconcilia — edições locais são MESCLADAS, nunca sobrescritas. */
async function reconectar(){
  if(!destino.dir)return conectarPasta();
  try{
    const p=await destino.dir.requestPermission({mode:'readwrite'});
    destino.permissao=(p==='granted');
    if(destino.permissao){destino.erro='';for(const t of Object.values(tabelas))await reconciliar(t,{mesclarAuto:true})}
  }catch(e){destino.erro=msgErro(e)}
  avisa();return destino.permissao;
}
/* pasta nova (ou nenhuma): nenhuma tabela está reconciliada com ela ainda */
function soltarTabelas(){Object.values(tabelas).forEach(t=>{t._reconciliada=false;clearTimeout(t._t);clearTimeout(t._tr)})}
async function desconectar(){
  destino.dir=null;destino.nome='';destino.permissao=false;soltarTabelas();
  Object.values(tabelas).forEach(t=>{t.conflito=false;t.falhou=false;t._arquivoTxt=null});    // sem pasta não há o que resolver nem gravar
  try{await idb.del('pasta')}catch(e){}avisa();
}
/* adota um handle (restaurado do IndexedDB): com permissão → reconcilia; sem → fica pendente (edições seguem locais e 'sujas') */
async function adotarPasta(dir){
  soltarTabelas();destino.dir=dir;destino.nome=dir.name||'pasta';destino.permissao=false;
  let p='prompt';try{p=await dir.queryPermission({mode:'readwrite'})}catch(e){}
  destino.permissao=(p==='granted');
  if(destino.permissao)for(const t of Object.values(tabelas))await reconciliar(t);
}
let painelAutoPasta=false;
function aposRestaurar(){
  destino.restaurando=false;
  Object.values(tabelas).forEach(t=>t._aplicarServidor());      // sem pasta: agora o CSV do servidor pode valer (se a tabela seguir virgem)
  avisa();
  if(destino.dir&&!destino.permissao&&!painelAutoPasta){painelAutoPasta=true;abrirPainel()}   // "reconectar pasta": o painel abre sozinho, uma vez
}
async function restaurarPasta(){
  if(!destino.suportado){destino.restaurando=false;return}
  try{
    const dir=await Promise.race([idb.get('pasta'),new Promise(ok=>setTimeout(ok,3000))]);
    if(dir)await adotarPasta(dir);
  }catch(e){}
  aposRestaurar();
}

/* ---------- zerar (novo evento) ---------- */
/** Volta cada tabela à semente embutida, apaga as chaves dados:* e a posição do deck; regrava os CSV se houver pasta conectada. */
async function zerar(){
  const ts=Object.values(tabelas);
  S.store.chaves('dados:').forEach(k=>S.store.del(k));      // inclusive tabelas que nenhuma tela abriu
  S.store.del('pos');
  ts.forEach(t=>t._restaurarSemente());
  ts.forEach(t=>t._emitir('zerar'));
  let gravou=false;
  if(destino.dir&&destino.permissao){
    for(const t of ts){t._reconciliada=true;t.sujo=true;await t.gravar({manual:true})}    // quem zera quer sobrescrever o ensaio
    gravou=ts.every(t=>!t.falhou);
  }
  avisa();
  aviso('Dados zerados: '+ts.length+' tabela(s) voltaram à base do repositório'+(gravou?' e os CSV da pasta foram regravados.':'.'));
  return {tabelas:ts.length,gravou};
}
function gravarTodas(){return Promise.all(Object.values(tabelas).map(t=>t.gravar({manual:true})))}

/* ---------- multi-aba ---------- */
addEventListener('storage',e=>{
  try{
    if(e.storageArea&&e.storageArea!==localStorage)return;
    if(e.key===null){Object.values(tabelas).forEach(t=>t._deOutraAba());return}
    const pre=NS+'dados:';if(!e.key||e.key.indexOf(pre)!==0)return;
    const t=tabelas[e.key.slice(pre.length)];if(t)t._deOutraAba();
  }catch(err){console.error(err)}
});

/* ---------- indicador na moldura ---------- */
const chip=$('#dadosChip'), painel=$('#dadosPainel');
function resumo(){
  const ts=Object.values(tabelas);
  const pend=ts.some(t=>t.sujo||t.salvando||t._reconciliando);
  if(ts.some(t=>t.conflito))return {cls:'conflito',txt:'CSV · conflito (D)',icone:'alerta'};
  if(ts.some(t=>t.falhou))return {cls:'falhou',txt:'CSV · falha ao gravar (D)',icone:'alerta'};
  if(destino.dir&&!destino.permissao)return {cls:'alerta',txt:'CSV · reconectar pasta (D)',icone:'alerta'};
  if(ts.some(t=>t._lsFalhou))return {cls:'alerta',txt:'CSV · navegador não guarda (D)',icone:'alerta'};
  if(destino.dir)return pend?{cls:'salvando',txt:'CSV · salvando…',icone:'relogio'}:{cls:'ok',txt:'CSV · gravado em '+destino.nome+'/',icone:'check'};
  if(ts.some(t=>t.divergente))return {cls:'alerta',txt:'CSV · difere do repo (D)',icone:'alerta'};
  return destino.suportado?{cls:'alerta',txt:'CSV · sem pasta (tecle D)',icone:'alerta'}:{cls:'alerta',txt:'CSV · só download (D)',icone:'alerta'};
}
function pintaChip(){
  if(chip){
    const r=resumo();
    chip.className='dados-chip dados-chip--'+r.cls;chip.innerHTML='<svg class="ico"><use href="#i-'+r.icone+'"/></svg><span></span>';
    chip.lastChild.textContent=r.txt;chip.title='Dados: clique ou tecle D';chip.setAttribute('aria-label','Base de dados CSV: '+r.txt);
  }
  if(painel&&!painel.hidden)pintaPainel();
}

/* ---------- painel de dados (tecla D) ---------- */
let armado=null, armadoT=0, importacao=null, ultimoFoco=null, casca=null;
const armar=k=>{armado=k;clearTimeout(armadoT);armadoT=setTimeout(()=>{armado=null;pintaPainel()},CONFIRMA_MS);pintaPainel()};
function aviso(txt,erro){
  mensagem={txt:txt,erro:!!erro};
  const el=painel&&painel.querySelector('#dadosStatus');
  if(el){el.textContent=txt;el.className='dados-status'+(erro?' dados-status--erro':'')}
}
function botao(a,rotulo,o){
  o=o||{};const chave=a+':'+(o.t||'');
  const conf=o.confirma&&armado===chave;
  return '<button type="button" class="dados-btn'+(o.forte?' dados-btn--forte':'')+(o.perigo?' dados-btn--perigo':'')+(conf?' dados-btn--armado':'')+'" data-a="'+a+'"'+(o.t?' data-t="'+esc(o.t)+'"':'')+(o.confirma?' data-confirma="1"':'')+'>'+esc(conf?o.confirma:rotulo)+'</button>';
}
const ICONE={conflito:'alerta',falhou:'alerta',divergente:'alerta','sem-arquivo':'alerta',salvando:'relogio',gravada:'check',base:'quadro'};
function situacao(t){
  const pasta=destino.dir&&destino.permissao;
  if(t.conflito)return ['conflito','conflito'];
  if(t.falhou)return ['falhou','falhou ao gravar'];
  if(pasta&&(t.salvando||t.sujo||t._reconciliando))return ['salvando','salvando…'];
  if(t.divergente)return ['divergente','difere do repositório'];
  if(t.sujo)return ['sem-arquivo','sem arquivo'];
  if(pasta)return ['gravada','gravada'];
  return ['base','base do repositório'];
}
function htmlPasta(){
  const r=resumo(), pend=Object.values(tabelas).some(t=>!t.conflito&&(t.sujo||t.falhou));
  let h='<svg class="ico"><use href="#i-'+r.icone+'"/></svg><span>'+esc(r.txt)+'</span>';
  if(!destino.suportado)h+='<em>Navegador sem acesso a pastas: use Baixar CSV</em>';
  else if(!destino.dir)h+=botao('conectar','Conectar pasta dados/',{forte:true});
  else if(!destino.permissao)h+=botao('reconectar','Reautorizar pasta',{forte:true});
  else{if(pend)h+=botao('gravar-todas','Gravar agora');h+=botao('desconectar','Desconectar')}
  return {cls:r.cls,html:h};
}
function htmlTabelas(){
  const ts=Object.values(tabelas).sort((a,b)=>a.nome.localeCompare(b.nome)), pasta=destino.dir&&destino.permissao;
  let h='<table class="dados-tab"><thead><tr><th>Tabela</th><th>Linhas</th><th>Situação</th><th></th></tr></thead><tbody>';
  ts.forEach(t=>{
    const [cod,rot]=situacao(t), n=esc(t.nome);
    h+='<tr><td><code>'+n+'.csv</code></td><td>'+t._linhas.length+'</td><td class="sit sit--'+cod+'"><svg class="ico"><use href="#i-'+ICONE[cod]+'"/></svg> '+esc(rot)+'</td><td class="acoes">';
    if(pasta&&!t.conflito&&(t.falhou||t.sujo))h+=botao('gravar',t.falhou?'Gravar agora':'Gravar',{t:t.nome});
    h+=botao('baixar','Baixar',{t:t.nome})+botao('importar','Importar',{t:t.nome})+'</td></tr>';
    if(t.conflito){
      h+='<tr class="dados-det"><td colspan="4"><p>O arquivo da pasta e a tela têm dados diferentes (arquivo: '+t._arquivoN+' linhas · tela: '+t._linhas.length+'). Nada é gravado até você escolher. '
        +'<b>Mesclar</b> junta os dois lados pelo id, sem duplicar (vale o registro mais recente) e grava o resultado no arquivo.</p><div class="dados-acoes">'
        +botao('mesclar','Mesclar (recomendado)',{t:t.nome,forte:true})
        +botao('usar-arquivo','Usar arquivo (descarta a tela)',{t:t.nome,confirma:'Confirmar: descartar a tela',perigo:true})
        +botao('usar-local','Manter local (sobrescreve o arquivo)',{t:t.nome,confirma:'Confirmar: sobrescrever o arquivo',perigo:true})+'</div></td></tr>';
    }else if(t.divergente){
      h+='<tr class="dados-det"><td colspan="4"><p>A cópia deste navegador difere do repositório (você baixou o CSV e ainda não fez commit, ou o repositório mudou). Seus dados estão guardados; decida quando quiser.</p><div class="dados-acoes">'
        +botao('manter-local','Manter local',{t:t.nome,forte:true})
        +botao('usar-repo','Usar repositório (descarta local)',{t:t.nome,confirma:'Confirmar: descartar a cópia local',perigo:true})+'</div></td></tr>';
    }else if(t.falhou||(t.erro&&pasta)){
      h+='<tr class="dados-det"><td colspan="4"><p class="dados-erro">'+(t.falhou?'Não foi possível gravar':'Falhou; tentando de novo')+': '+esc(t.erro)+'. Se o arquivo estiver aberto no Excel, feche-o.</p></td></tr>';
    }
  });
  if(!ts.length)h+='<tr><td colspan="4" class="vazio">Nenhuma tabela em uso ainda.</td></tr>';
  return h+'</tbody></table>';
}
function htmlImport(){
  if(!importacao)return '';
  const i=importacao;
  return '<p>Importar <code>'+esc(i.nome)+'.csv</code> substitui '+i.antes+' linha(s) por '+i.n+(i.idsRegenerados?' ('+i.idsRegenerados+' id(s) repetido(s) ou vazio(s) serão renovados)':'')+'.</p><div class="dados-acoes">'
    +botao('import-ok','Confirmar importação',{forte:true})+botao('import-cancela','Cancelar')+'</div>';
}
function htmlRodape(){
  return '<div class="dados-zerar"><p class="dados-texto dados-texto--tab">Zerar: depois do ensaio e antes do evento, volta tudo à base do repositório e apaga os dados locais e a posição do deck'+(destino.dir&&destino.permissao?' (e regrava os CSV da pasta)':'')+'.</p>'
    +'<div class="dados-rodape">'+botao('zerar','Zerar dados (novo evento)',{confirma:'Confirmar: apagar dados locais',perigo:true})+botao('baixar-todas','Baixar todos os CSV')+'<span class="dados-dica">D ou Esc fecha</span></div></div>';
}
/* troca o conteúdo de uma zona só se mudou e devolve o foco ao mesmo botão (nada de perder foco a cada gravação) */
function trocar(zona,html,cls){
  if(zona.dataset.h===html&&zona.dataset.c===(cls||''))return;
  const at=document.activeElement, foco=at&&zona.contains(at)?{a:at.dataset.a,t:at.dataset.t}:null;
  zona.innerHTML=html;zona.dataset.h=html;zona.dataset.c=cls||'';
  if(cls!=null)zona.className='dados-pasta dados-pasta--'+cls;
  if(foco&&foco.a){
    const alvo=zona.querySelector('[data-a="'+foco.a+'"]'+(foco.t?'[data-t="'+foco.t+'"]':''))||zona.querySelector('[data-a]');
    if(alvo)alvo.focus();
  }
}
function montarCasca(){
  painel.setAttribute('role','dialog');painel.setAttribute('aria-modal','true');painel.setAttribute('aria-labelledby','dadosTitulo');
  painel.innerHTML='<div class="dados-caixa"><div class="dados-topo"><h2 id="dadosTitulo">Base de dados · CSV</h2>'
    +'<button type="button" class="dados-x" data-a="fechar" aria-label="Fechar painel de dados"><svg class="ico"><use href="#i-x"/></svg></button></div>'
    +'<p class="dados-texto">Cada interação grava em um CSV. O navegador não escreve no servidor: <b>conecte a pasta <code>dados/</code></b> do repositório clonado (Chrome ou Edge) e tudo é gravado ali sozinho; depois do evento, commit e push. Sem pasta, use <b>Baixar CSV</b>.</p>'
    +'<div id="dadosZPasta" class="dados-pasta"></div>'
    +'<p class="dados-status" id="dadosStatus" role="status" aria-live="polite"></p>'
    +'<div id="dadosZImport" class="dados-import" hidden></div>'
    +'<div id="dadosZTab"></div><div id="dadosZRodape"></div>'
    +'<input type="file" id="dadosArquivo" accept=".csv,text/csv" hidden></div>';
  casca={pasta:$('#dadosZPasta',painel),imp:$('#dadosZImport',painel),tab:$('#dadosZTab',painel),rod:$('#dadosZRodape',painel),status:$('#dadosStatus',painel),arq:$('#dadosArquivo',painel)};
}
function pintaPainel(){
  if(!painel)return;
  if(!casca||!painel.contains(casca.tab))montarCasca();
  const p=htmlPasta();
  trocar(casca.pasta,p.html,p.cls);
  const hi=htmlImport();casca.imp.hidden=!hi;trocar(casca.imp,hi);
  trocar(casca.tab,htmlTabelas());
  trocar(casca.rod,htmlRodape());
  if(destino.erro){casca.status.textContent=destino.erro;casca.status.className='dados-status dados-status--erro'}
  else if(casca.status.textContent!==mensagem.txt){casca.status.textContent=mensagem.txt;casca.status.className='dados-status'+(mensagem.erro?' dados-status--erro':'')}
}
const focaveis=()=>Array.from(painel.querySelectorAll('button:not([disabled]),[href],input:not([hidden]):not([disabled])')).filter(e=>e.offsetParent!==null||e===document.activeElement);
function abrirPainel(){
  if(!painel||!painel.hidden)return;
  ultimoFoco=document.activeElement;
  painel.hidden=false;pintaPainel();
  const alvo=painel.querySelector('.dados-btn--forte')||painel.querySelector('[data-a="fechar"]');
  if(alvo)alvo.focus();
}
function fecharPainel(){
  if(!painel||painel.hidden)return;
  painel.hidden=true;armado=null;clearTimeout(armadoT);
  const f=ultimoFoco&&ultimoFoco.isConnected&&ultimoFoco!==document.body?ultimoFoco:chip;
  try{if(f&&f.focus)f.focus()}catch(e){}
  ultimoFoco=null;
}
function lerArquivoImport(inp){
  const t=tabelas[inp.dataset.t],f=inp.files[0];inp.value='';
  if(!t||!f)return;
  const fr=new FileReader();
  fr.onload=()=>{
    let txt;try{txt=new TextDecoder('utf-8',{fatal:true}).decode(fr.result)}catch(e){aviso('Importação recusada: "'+f.name+'" não está em UTF-8. Salve como "CSV UTF-8". Nada foi alterado.',true);return}
    const v=t.validarImportacao(txt);
    if(!v.ok){aviso('Importação recusada ('+f.name+'): '+v.erro+' Nada foi alterado.',true);return}
    if(!t._linhas.length){const r=t.importar(txt);aviso('Importado em '+t.nome+'.csv: '+r.linhas+' linha(s)'+(r.idsRegenerados?', '+r.idsRegenerados+' id(s) renovado(s)':'')+'.');return}
    importacao={nome:t.nome,texto:txt,n:v.n,antes:t._linhas.length,idsRegenerados:v.idsRegenerados};
    aviso('Arquivo válido: '+v.n+' linha(s). Confirme para substituir as '+t._linhas.length+' de '+t.nome+'.csv.');pintaPainel();
  };
  fr.onerror=()=>aviso('Não foi possível ler "'+f.name+'". Nada foi alterado.',true);
  fr.readAsArrayBuffer(f);
}
if(painel){
  painel.addEventListener('click',async e=>{
    if(e.target===painel){fecharPainel();return}
    const b=e.target.closest('[data-a]');if(!b)return;
    const a=b.dataset.a,n=b.dataset.t,t=n&&tabelas[n];
    if(b.dataset.confirma&&armado!==a+':'+(n||'')){armar(a+':'+(n||''));aviso('Toque de novo em "'+b.textContent.trim()+'" para confirmar (vale por 4 segundos).');return}
    armado=null;clearTimeout(armadoT);
    if(a==='fechar')fecharPainel();
    else if(a==='conectar')await conectarPasta();
    else if(a==='reconectar')await reconectar();
    else if(a==='desconectar')await desconectar();
    else if(a==='baixar'&&t)t.baixar();
    else if(a==='baixar-todas')Object.values(tabelas).forEach((x,i)=>setTimeout(()=>x.baixar(),i*350));
    else if(a==='gravar'&&t)await t.gravar({manual:true});
    else if(a==='gravar-todas')await gravarTodas();
    else if(a==='mesclar')await resolver(n,'mesclar');
    else if(a==='usar-arquivo')await resolver(n,'arquivo');
    else if(a==='usar-local'||a==='manter-local')await resolver(n,'local');
    else if(a==='usar-repo')await resolver(n,'repositorio');
    else if(a==='zerar')await zerar();
    else if(a==='importar'&&t){casca.arq.dataset.t=n;casca.arq.click()}
    else if(a==='import-ok'&&importacao){
      const t2=tabelas[importacao.nome],r=t2&&t2.importar(importacao.texto);importacao=null;
      if(r)aviso(r.ok?'Importado em '+t2.nome+'.csv: '+r.linhas+' linha(s)'+(r.idsRegenerados?', '+r.idsRegenerados+' id(s) renovado(s)':'')+'.':r.erro,!r.ok);
    }
    else if(a==='import-cancela'){importacao=null;aviso('Importação cancelada; nada foi alterado.')}
    pintaPainel();
  });
  painel.addEventListener('change',e=>{const inp=e.target.closest('input[type=file]');if(inp&&inp.files[0])lerArquivoImport(inp)});
}
if(chip)chip.addEventListener('click',()=>abrirPainel());
/* D abre/fecha; Esc fecha; Tab fica preso no painel (captura: precede o teclado do núcleo enquanto o painel está aberto) */
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const t=e.target, edit=t&&t.closest&&t.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"]');
  if(painel&&!painel.hidden){
    if(e.key==='Escape'||(!edit&&e.key.toLowerCase()==='d')){fecharPainel();e.preventDefault();e.stopImmediatePropagation()}
    else if(e.key==='Tab'){
      const f=focaveis();
      if(f.length){
        const i=f.indexOf(document.activeElement), fora=!painel.contains(document.activeElement);
        if(fora||(e.shiftKey&&i<=0)||(!e.shiftKey&&i===f.length-1)){f[e.shiftKey?f.length-1:0].focus();e.preventDefault()}
      }
      e.stopImmediatePropagation();
    }
    else if(!edit){e.stopImmediatePropagation()}
    return;
  }
  if(!edit&&e.key.toLowerCase()==='d'){abrirPainel();e.preventDefault();e.stopImmediatePropagation()}
},true);

/* aviso ao sair com dado que só existe neste navegador (sem pasta, pasta sem permissão, conflito ou falha) */
addEventListener('beforeunload',e=>{
  const coberto=destino.dir&&destino.permissao;
  if(Object.values(tabelas).some(t=>t.sujo&&(!coberto||t.conflito||t.falhou))){e.preventDefault();e.returnValue=''}
});

S.dados={
  tabela,esquema:ESQUEMA,serializar,parse,
  tabelas:()=>Object.values(tabelas),
  conectarPasta,desconectar,reconectar,resolver,zerar,gravarTodas,abrirPainel,fecharPainel,
  estado:()=>{const r=resumo(),ts=Object.values(tabelas);return {pasta:destino.nome,conectada:!!destino.dir,permissao:destino.permissao,suportado:destino.suportado,
    pendentePasta:!!(destino.dir&&!destino.permissao),restaurando:destino.restaurando,painelAberto:!!(painel&&!painel.hidden),
    erro:destino.erro||((ts.find(t=>t.erro)||{}).erro||''),mensagem:mensagem.txt,chip:{cls:r.cls,txt:r.txt},
    tabelas:ts.map(t=>({nome:t.nome,linhas:t._linhas.length,sujo:t.sujo,conflito:t.conflito,divergente:t.divergente,salvando:t.salvando,falhou:t.falhou,erro:t.erro,virgem:t._virgem,reconciliada:t._reconciliada}))}},
  aoMudar:f=>{ouvintes.add(f);return()=>ouvintes.delete(f)},
  /* só para testes: injeta uma "pasta" falsa (mesma interface de FileSystemDirectoryHandle).
     Com queryPermission() no objeto, segue o caminho do reinício (permissão pode estar pendente); sem ele, já nasce autorizada. */
  _usarPastaFalsa:async dir=>{
    destino.suportado=true;
    if(typeof dir.queryPermission==='function'){await adotarPasta(dir);aposRestaurar();return}
    destino.restaurando=false;soltarTabelas();destino.dir=dir;destino.nome=dir.name||'falsa';destino.permissao=true;
    for(const t of Object.values(tabelas))await reconciliar(t);
    avisa();
  }
};
restaurarPasta();
S.on('pronto',()=>pintaChip());
pintaChip();
})();
