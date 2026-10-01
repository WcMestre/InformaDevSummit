# Padrões do deck — 1º Informa DEV Summit (02/10/2026)

Site estático para GitHub Pages: HTML, CSS e JS em arquivos separados; `index.html` é **gerado** por `python ferramentas/montar.py` a partir de `conteudo/`.
Este documento é o **contrato**: quem cria ou altera uma tela segue o que está aqui. Comandos e rotina do dia: `README.md`.

## 1. Princípios

1. **Palco fixo 1920×1080**, escalado para caber em qualquer janela/projetor (letterbox). Todas as medidas são px do palco.
2. **Legível no fundo da sala**: nada abaixo de **20 px**; corpo 30 px; contraste ≥ 4,5:1 (≥ 3:1 para texto ≥ 24 px). `SUMMIT.auditar()` confere.
3. **Marca Informa**: logo da marca (vetor, símbolo `#logo-informa`) na moldura e nas telas de abertura/encerramento. Nunca distorcer, recolorir o ícone laranja nem trocar a tipografia. Fundo escuro → logo branco; fundo claro → `class="logo logo--claro"`.
4. **Tela de facilitação guia, não anuncia**: nenhuma tela pede algo sem que a anterior tenha dado o material para responder; toda decisão chega como **proposta na mesa** (aceitar · ajustar · recusar) declarando o que custa; dinâmicas trazem objetivo, passos com tempo e formato, "pronto quando" e condução (abrir · se travar · fechar). Tudo **na tela projetada**.
5. **A conta fecha**: passos de uma dinâmica somam exatamente o tempo do bloco; apresentação + definições somam o tempo do assunto (o `montar.py` reprova se não fechar).
6. **Todo slide interativo grava em CSV** (seção 5). O CSV é a base de dados da apresentação.
7. **Fato interno com número leva origem e data** (`.fonte`); nunca nome de pessoa junto de métrica; nunca nome de cliente; **nunca inventar fatos**. Exceção explícita: nome de pessoa ligado só a **papel ou produto**, **sem métrica** — os POs ligados ao seu produto ou frente (`a3-funil`, `a3-pos`, `a5-papeis`) e o Tech Lead ligado ao seu papel (`a5-papeis`; o `a5-proposta` também o cita pelo nome, veja a seção 9, *proposta*).
8. **Responsáveis nascem em branco** nos quadros (as linhas-semente de compromissos também); linhas-exemplo em cinza, marcadas como exemplo e fora do CSV. Na tela, o rótulo é sempre **Responsável** ("Owner" é o termo do cliente e não vai para a tela); `responsavel` é o nome da coluna no CSV.
9. **Funciona offline e no GitHub Pages**: fontes, logo e ícones locais; zero requisições externas (a CSP do `<meta>` só aceita `'self'`); caminhos relativos; abre por `file://`.

## 2. Estrutura

```
index.html · catalogo.html          gerados (não editar)
assets/css/  00-tokens · 10-palco · 20-moldura · 25-dados · 30-componentes · 90-impressao
assets/css/layouts/NN-<layout>.css  um arquivo por layout; tudo escopado em .slide[data-layout="x"]
assets/js/   10-nucleo · 20-dados · 90-auditoria · 99-iniciar
assets/js/layouts/NN-<layout>.js    scripts dos 9 layouts com comportamento (cronograma, bloco, proposta, dinamica, quadro, brainstorm, nuvem, pausa, encerramento); os outros 10 (capa, conteudo, duas-colunas, numeros, destaque, fluxo, linha-tempo, ciclo, opcoes, matriz) são só HTML + CSS
assets/fontes/ assets/img/          woff2 + fontes.css · logo e sprites de ícones (SVG)
conteudo/slides/NN-*.html           o deck real (ordem = ordem alfabética dos arquivos)
conteudo/modelos/NN-*.html          catálogo de modelos (vira catalogo.html): 21 arquivos, 38 telas-modelo, os 19 layouts; o comentário de ANATOMIA de cada um é a fonte da seção 9
dados/ esquema.json + *.csv         base de dados
ferramentas/ montar.py · casca.html · capturar.cjs
```

Ordem de carga no `index.html`: núcleo (arquivos < `90`) → layouts → `90+` (auditoria, impressão, iniciar). `99-iniciar.js` roda por último, depois de todos os layouts registrarem seus ouvintes.

## 3. Anatomia de uma tela

```html
<section class="slide" id="kebab-unico" data-layout="conteudo" data-bloco="a1" data-min="5">
  <header class="cab"> <p class="kicker">…</p> <h2>… <em>…</em></h2> <p class="sub">…</p> </header>
  <div class="corpo"> … </div>
</section>
```

| atributo | obrigatório | função |
|---|---|---|
| `id` | sim | único; âncora `#id` |
| `data-layout` | sim | um dos 19 layouts reconhecidos em `montar.py` (`LAYOUTS`; seção 9) |
| `data-bloco` | sim | id do bloco (assunto) a que a tela pertence |
| `data-min` | não | minutos da tela (alimenta o cronômetro `T`; em `dinamica` é o tempo do bloco) |
| `data-modelo` | — | conteúdo-modelo; `--final` reprova se sobrar |
| `data-chrome` | não | `off` esconde a moldura (é o padrão da `capa`); `min` mantém só logo e contador |
| `data-sangra` / `data-decor` | não | permite ocupar margens / elemento decorativo ignorado pela auditoria |
| `data-rolagem` | não | contêiner com rolagem interna intencional (a auditoria não o conta como recorte) |
| `data-tabela`, `data-assunto` | em telas interativas | tabela CSV e assunto a que a tela se liga (seções 5 e 9) |

Atributos próprios de cada layout (`data-variante`, `data-rodada`, `data-sala`, `data-referencia`, `data-volta`, `data-n`, `data-entradas`, `data-proposta`…): seção 9.

**Metadados do bloco** (só na primeira tela do bloco): `data-bloco-nome`, `data-bloco-curto`, `data-bloco-ini` ("09:00"), `data-bloco-min`, `data-bloco-apres`, `data-bloco-def`, `data-bloco-tipo` (`pausa` | `intocavel`). Em bloco de uma tela só (intervalo, almoço, fechamento) a própria tela leva os metadados. A trilha do dia, o rótulo da moldura e o cronograma nascem daí. O `montar.py` exige nome, início e duração; que os metadados estejam na primeira tela do bloco; `apres + def = min`; horários no formato `HH:MM`; e que cada bloco comece quando o anterior termina (em `--final`, lacuna ou sobreposição é erro; no build comum, aviso).

Entrada escalonada: `.anim` + `.d1…d7`. Sem emoji nem glifos fora do subconjunto latin (não existem `→ ✓ ✕`): use `<svg class="ico"><use href="#i-check"/></svg>` — ícones: seta, check, x, mais, menos, ajustar, relogio, pessoas, alvo, cadeado, alerta, cafe, talher, quadro, play, pause.

## 4. Componentes compartilhados (`30-componentes.css`)

`.cab` `.kicker` `h1–h4` `.sub` `.corpo` `.corpo-txt` · grades `.g2 .g3 .g4` `.linha` `.cresce` · `.card` (`--destaque`, `--forte`) · `.rotulo` · `.chip` (`--tempo --individual --subgrupos --plenaria --ok --alerta --perigo`) · `.lista` (`--pros --contras --numerada`) · `.fonte` · `.ph` · `.exemplo` `.exemplo-marca` · `.num` · `.dim` `.mono`.
Layouts compõem esses; o que for exclusivo de um layout leva prefixo do layout (`.dinamica-…`, `.nuvem-…`).

## 5. Base de dados (CSV)

**Regra: toda tela que recebe interação lê e grava pela camada de dados** (`assets/js/20-dados.js`) — nunca direto em `localStorage`.

```js
const tabela = SUMMIT.dados.tabela('decisoes');         // colunas vêm de dados/esquema.json
tabela.adicionar({assunto:'versionamento', item:'…'});  // → id
tabela.atualizar(id, {responsavel:'…'});  tabela.remover(id|fn);  tabela.linhas();  tabela.obter(id);  tabela.substituir(lista);
tabela.on(origem => renderizar());                      // 'local' | 'arquivo' | 'servidor' | 'repositorio' | 'outra-aba' | 'zerar'
tabela.estado();                                        // {sujo, salvando, conflito, divergente, falhou, erro, linhas, virgem, …}
tabela.csv();  tabela.baixar();  tabela.gravar();  tabela.importar(texto);  tabela.validarImportacao(texto);
SUMMIT.dados.estado();                                  // pasta, permissão, chip e situação de cada tabela (depuração)
```

- Toda tabela tem `id` (1ª coluna) e `atualizado_em` (última), geridas pela camada.
- Esquema em `dados/esquema.json`; o `montar.py` valida os cabeçalhos de `dados/*.csv` e cria os que faltam (só no build completo; `--saida`, `--so` e `--modelos` não criam).
- Formato: UTF-8 com BOM · separador `;` · CRLF · aspas RFC 4180 (o leitor também aceita `,` e TAB). `.gitattributes` fixa `*.csv` em CRLF.
- `data-tabela` desconhecido e `th data-campo` que não seja coluna da tabela são **erro de build** (`montar.py`); em runtime, o quadro mostra um aviso e a nuvem, o estado vazio.

### 5.1 Três camadas

1. **Semente** — o CSV de `dados/` embutido no `index.html` no momento do build (`#dados-sementes`). Em `http(s)` (Pages, `servir`), a camada também busca `dados/<tabela>.csv` no servidor (`cache: no-store`), mas esse CSV **só vale para tabela "virgem"**: sem cópia local, sem edição, sem pasta conectada ou pendente e nunca reconciliada com um arquivo. Em `file://` só há a semente embutida.
2. **Cópia de trabalho** — `localStorage`, chave `informa-summit-2026:dados:<tabela>` com `{linhas, sujo, seedHash, ciente}`. Cada origem (URL) tem a sua: `file:///…/index.html`, `http://localhost:8080` e o endereço do Pages **não compartilham dados**.
3. **Destino** — arquivo CSV numa pasta conectada (tecla **D**, File System Access API: Chrome/Edge; o handle da pasta fica no IndexedDB) ou **Baixar CSV**. Sem navegador com acesso a pastas, só o download.

### 5.2 Regras que nunca quebram (a sala nunca perde dado)

1. **A cópia local sempre volta** no F5 e ao reabrir, mesmo já gravada ou baixada. `sujo` só alimenta o aviso ao sair da página (`beforeunload`); nunca decide se restaura. Cópia diferente da semente que já foi exportada = **divergente** (aviso, não bloqueia nem descarta).
2. **A rede nunca atropela a pasta**: o CSV do servidor só vale para tabela virgem.
3. **Arquivo × tela diferentes = conflito**: nada é gravado até alguém resolver (Mesclar é o caminho recomendado).
4. **Falha ao gravar**: 3 novas tentativas (1,5 s · 3 s · 6 s); depois o estado vira `falhou` e aparece **Gravar agora**.

### 5.3 O chip da moldura e o painel D

O chip fica no canto superior direito (na `capa` a moldura está oculta: tecle **D** mesmo assim). Clicar nele ou teclar **D** abre o painel; **D** ou **Esc** fecha; Tab fica preso dentro do painel; ações destrutivas pedem toque duplo em até 4 s.

| chip | significa | o que fazer |
|---|---|---|
| `CSV · gravado em <pasta>/` (verde) | pasta conectada, nada pendente | nada |
| `CSV · salvando…` | há gravação em curso ou por fazer | aguardar |
| `CSV · sem pasta (tecle D)` (âmbar) | dados só na cópia local | D › **Conectar pasta dados/** |
| `CSV · só download (D)` | navegador sem acesso a pastas | usar Chrome/Edge, ou **Baixar** |
| `CSV · reconectar pasta (D)` | a pasta foi escolhida antes, mas o navegador pediu a permissão de novo (reinício) | D › **Reautorizar pasta**; as edições locais são **mescladas**, nunca sobrescritas |
| `CSV · conflito (D)` (vermelho) | o arquivo da pasta difere da tela | D › **Mesclar** (5.4) |
| `CSV · falha ao gravar (D)` (vermelho) | esgotaram as 3 retentativas | fechar o CSV se estiver aberto no Excel; D › **Gravar agora** |
| `CSV · difere do repo (D)` | cópia local ≠ repositório (CSV baixado e sem commit, ou repositório mudou) | decidir quando quiser (5.4) |
| `CSV · navegador não guarda (D)` | `localStorage` indisponível (janela anônima, bloqueio) | sair dessa janela; conectar a pasta |

O painel lista cada tabela em uso com linhas e situação (`gravada` · `salvando…` · `sem arquivo` · `difere do repositório` · `conflito` · `falhou ao gravar` · `base do repositório`) e, por tabela, **Gravar/Gravar agora** (com pasta e algo por gravar), **Baixar** e **Importar**. No rodapé: **Zerar dados (novo evento)** e **Baixar todos os CSV**.

### 5.4 Resolver conflito e divergência

| situação | botão | efeito |
|---|---|---|
| **conflito** (arquivo × tela) | **Mesclar (recomendado)** | une os dois lados pelo `id`, sem duplicar; no mesmo `id` vale o `atualizado_em` mais novo (empate: a tela); grava o resultado no arquivo |
| conflito | **Usar arquivo** (toque duplo) | descarta a tela, fica o arquivo |
| conflito | **Manter local** (toque duplo) | sobrescreve o arquivo com a tela |
| **divergente** (cópia do navegador × repositório) | **Manter local** | continua com a cópia local e deixa de avisar |
| divergente | **Usar repositório** (toque duplo) | descarta a cópia local e volta ao CSV do repositório (ou à semente do build) |

Ao conectar uma pasta, cada tabela é comparada com o arquivo: igual → segue; tabela sem trabalho → adota o arquivo; arquivo inexistente → cria; diferente e com trabalho → conflito. Ao **reautorizar** depois de um reinício, a mescla é automática.

### 5.5 Gravar, baixar, importar

- **Gravar**: a cada mudança, ~0,5 s depois, `tabela.gravar()` escreve `dados/<tabela>.csv` (com BOM). Só a pasta conectada e reconciliada recebe gravação. Causa comum de falha: CSV aberto no Excel (o painel avisa).
- **Baixar**: exporta o CSV da tabela (**Baixar todos os CSV** baixa um por vez; o Chrome pode pedir para permitir downloads múltiplos). Baixar conta como exportar: a cópia local continua valendo no F5 e o aviso de saída some.
- **Importar** (por tabela): **substitui** os dados por um CSV válido — não mescla. Antes de tocar em qualquer coisa a camada valida: UTF-8 (`�` recusa), cabeçalho **idêntico** ao do esquema, nenhuma linha mais larga que o cabeçalho. Arquivo inválido **nunca** troca dado (a mensagem diz o motivo). Em tabela com linhas, pede **Confirmar importação**; ids repetidos ou vazios são renovados.

### 5.6 Zerar (novo evento)

Painel D › **Zerar dados (novo evento)** (toque duplo): apaga as chaves `dados:*` do `localStorage` (inclusive de tabelas que nenhuma tela abriu) e a posição salva do deck, devolve cada tabela à **semente embutida no build** e emite `origem='zerar'`. Com pasta conectada e autorizada, **regrava todos os CSV** (sobrescreve o ensaio). Sem pasta, zera só o navegador. **Cuidado**: com a pasta conectada, Zerar sobrescreve os CSV — só o use depois de arquivar ou commitar os dados do evento. Como a semente é a do último build, rode `python ferramentas/montar.py --final` antes do evento para garantir que `dados/` e o `index.html` estão limpos (as 9 linhas-semente de `decisoes` voltam, com responsável e prazo em branco).

### 5.7 Mais de uma aba

Duas abas do mesmo navegador e da mesma origem compartilham a cópia local: a mudança de uma é **adotada** pela outra (evento `storage`, `origem='outra-aba'`) e um "zerar" numa aba restaura a semente na outra. Mesmo assim, projete com **uma aba só**: cada aba tem o seu chip, o seu cronômetro e as suas gravações.

### 5.8 Segurança do CSV

- **Injeção de fórmula**: toda célula que começa com `=` `+` `-` `@` TAB ou CR ganha um **apóstrofo** na frente ao gravar (o Excel não a executa) e perde o apóstrofo ao ler; a ida-e-volta é idêntica. Quem abre o CSV no Excel ou em script vê o apóstrofo nesses poucos casos.
- Texto digitado entra no DOM só por `textContent`/`value`; o painel escapa tudo o que monta como HTML.

### 5.9 Tabelas (colunas atuais)

Além de `id` (1ª) e `atualizado_em` (última):

| tabela | alimentada por | colunas de negócio |
|---|---|---|
| `brainstorming` | `brainstorm` (grava) · `nuvem` (só ajusta `criticidade`) | `rodada` · `participante` · `tipo` (bom\|melhorar) · `texto` · `criticidade` (1–3, só em `melhorar`; vazia em `bom`) |
| `anotacoes` | `quadro` (variante anotações: `a2-anotacoes`, assunto `pipeline`; `a4-anotacoes`, `ocorrencias`; `a5-anotacoes`, `review-dos-prs`; `a6-anotacoes`, `shapeup`) | `assunto` · `tipo` (sugestao\|duvida\|risco) · `texto` · `votos` (mãos levantadas, inteiro ≥ 0, preenchido pela coluna `data-tipo="contador"`; as quatro telas de anotações declaram essa coluna e têm `data-ordenar="votos"`) |
| `propostas` | `proposta` (1 linha por tela; `proposta` = id da `<section>`: `a1-proposta`, `a3-proposta`, `a4-proposta`, `a5-proposta`, `a7-proposta`) | `assunto` · `proposta` · `enunciado` (texto do `h2`, em 1 linha) · `decisao` (aceitar\|ajustar\|recusar\|vazio) · `votos_aceitar` · `votos_ajustar` · `votos_recusar` · `ajuste` |
| `decisoes` | `quadro` (variante compromissos: `a1-`, `a2-`, `a3-`, `a4-`, `a5-` e `a7-compromissos`) | `assunto` · `item` · `responsavel` · `prazo` (AAAA-MM-DD) · `status` (aberto\|andamento\|concluido) · `observacao` |
| `progresso` | `dinamica` (1 linha por passo com estado; 8 telas de condução: `a0` a `a7`) | `slide` · `passo` · `estado` (feito\|em-curso) |

Chave `assunto` de cada tela de quadro ou proposta (o `data-assunto` da `<section>`): `versionamento` (a1) · `pipeline` (a2) · `operacao-inovacao` (a3) · `ocorrencias` (a4) · `review-dos-prs` (a5) · `shapeup` (a6, só anotações: não tem proposta nem compromissos) · `ferramentas-e-ia` (a7). O brainstorming (a0) não tem `assunto`: usa `rodada`. As telas de resumo (`encerramento`) casam o `assunto` com o nome do bloco (seção 9).

Estado "limpo" para entrega (`montar.py --final` reprova o resto): `brainstorming`, `anotacoes`, `propostas` e `progresso` **sem nenhuma linha**; `decisoes` só com as linhas-semente (`id` começando em `seed-`, `responsavel` e `prazo` vazios, `status` = aberto). Hoje são **9 sementes**, de uma a duas por assunto (versionamento 2 · pipeline 2 · operacao-inovacao 1 · ocorrencias 1 · review-dos-prs 1 · ferramentas-e-ia 2), conferidas contra `dados/decisoes.csv`:

| `id` | `assunto` | `item` (o que a sala vê no quadro de Compromissos) |
|---|---|---|
| `seed-a1-pipeline` | `versionamento` | Ajustar a pipeline ao novo padrão de versionamento |
| `seed-a1-repositorio` | `versionamento` | Ajustar o repositório ao novo padrão de versionamento |
| `seed-a2-dotnet` | `pipeline` | Fazer o upgrade do .NET Framework |
| `seed-a2-limpeza` | `pipeline` | Limpar resquícios de releases depreciadas do repositório |
| `seed-a3-fluxo` | `operacao-inovacao` | Colocar o novo fluxo em prática |
| `seed-a4-fluxo` | `ocorrencias` | Colocar em operação o novo fluxo de ocorrências e priorização |
| `seed-a5-review` | `review-dos-prs` | Colocar em prática o novo fluxo de review dos PRs |
| `seed-a7-acessos` | `ferramentas-e-ia` | Providenciar o GitHub pago e o plano individual do Claude de cada usuário |
| `seed-a7-pipeline` | `ferramentas-e-ia` | Deixar a conta de desenvolvimento logada na máquina da Pipeline |

Toda semente nasce com `responsavel` e `prazo` em branco e `status` = `aberto`; quem preenche é a sala, na tela de Compromissos do assunto. Nova semente = nova linha em `dados/decisoes.csv` com `id` `seed-…`; depois rode `python ferramentas/montar.py` (e `--final` antes de entregar) para que a base embutida no `index.html` a leve.

### 5.10 Privacidade

`dados/*.csv` guardam **participante, textos livres e críticas** (e responsáveis em `decisoes`). O `index.html` embute esses CSV como semente. O **GitHub Pages é público por padrão** — em repositório privado o site continua público, salvo planos com controle de acesso — e `dados/` está na raiz publicada. Portanto: não publique dados reais no Pages; no campo participante use **siglas** (P1, P2 — o placeholder do brainstorm já pede "Pessoa (sigla)"); versione os CSV reais só em repositório privado sem Pages. Rotina completa no `README.md`.

## 6. Padrão de assunto

Cada assunto da pauta é **um bloco** (`data-bloco="aN"`) com tempo dimensionado em **apresentação + definições**. Sequência de telas:

| # | tela | layout | papel |
|---|---|---|---|
| 1 | Abertura do assunto | `bloco` | horário, duração, **objetivo em uma frase**, "saímos daqui com", quem está na sala (manhã: DEV · QA · Tech Lead · Gestão; tarde: Suporte · CS · Comercial · Implantação · Gestão) |
| 2 | Condução | `dinamica` | passos com tempo e formato; soma = tempo do bloco; reserva repertório e votação |
| 3 | Repertório (1–n) | `conteudo` · `duas-colunas` · `linha-tempo` · `fluxo` · `ciclo` · `matriz` · `opcoes` · `numeros` · `destaque` | o material **antes** de pedir qualquer coisa; processo (quem faz o quê, em que ordem, o que fica registrado) = `fluxo`; ritmo que se repete = `ciclo`; quem recebe o quê = `matriz` |
| 4 | Registro (se houver) | `brainstorm` · `quadro` (anotações) | interação ao vivo → CSV |
| 5 | Proposta (se houver decisão) | `proposta` | aceitar · ajustar · recusar, declarando o que custa (Tempo · Esforço · Risco · Abre mão de) → CSV |
| 6 | Compromissos | `quadro` (compromissos) | **Ação · Responsável · Prazo**, responsável e prazo em branco; aviso de feriado/conflito → `decisoes.csv` |

Regras: todo assunto tem objetivo e saída; se gera ação, termina em **Compromissos**; ids de bloco: `abertura`, `a0` … `a7`, `intervalo`, `fechamento`, `almoco`, `fechamento-dia`; ids de tela `aN-<papel>` (ex.: `a1-proposta`). O **cronograma** é gerado a partir dos metadados dos blocos, então incluir um assunto = incluir suas telas com os `data-bloco-*` preenchidos. Quando o briefing não traz o dado de uma linha de "O que custa", a linha não some: **Tempo** "Prazo definido ainda hoje." · **Esforço** = a ação do assunto · **Risco** "Nenhum levantado: a sala aponta antes de votar." · **Abre mão de** "A definir com a sala." (nunca um custo, preço ou prazo inventado).

**Exceções ao padrão** (todas deliberadas):

- **Fechamento (11:55) e Fechamento do dia (16:55)**: blocos de **1 tela** (`encerramento`, variante `resumo`), sem repertório, sem proposta e sem Compromissos próprios; só **leem** os CSV.
- **a6 ShapeUp**: **sem `proposta` e sem Compromissos**. O assunto reforça que seguimos com o ShapeUp (ciclo de 6 semanas, cooldown de 2) e só registra dúvidas sobre o ritmo (`quadro` de anotações). Sem decisão, não há ação a cobrar.
- **a0 Brainstorming**: fecha na `nuvem` (a sala vota a criticidade) e não tem Compromissos; **a2 Pipeline** decide por anotações e duas frentes, sem tela `proposta`.
- **Abertura**: 2 telas (`capa` e `cronograma`), sem `bloco` nem `dinamica`; **Intervalo** e **Almoço**: 1 tela `pausa`.

### O deck real (55 telas, conferido contra `conteudo/slides/` com `montar.py --saida`)

A ordem das telas é a ordem alfabética dos arquivos de `conteudo/slides/` (prefixos `10-` … `99-`); o nº entre parênteses é a posição no deck hoje (`G` + nº + `Enter`; o endereço `index.html#<id>` vale em qualquer posição e não muda quando entra uma tela nova).

| bloco | telas (nº · id · layout) |
|---|---|
| Abertura (2) | 1 `abertura-capa` · capa → 2 `abertura-cronograma` · cronograma |
| a0 Brainstorming (5) | 3 `a0-bloco` · bloco → 4 `a0-dinamica` · dinamica → 5 `a0-eixos` · conteudo (lista) → 6 `a0-brainstorm` · brainstorm (`data-rodada="1"`, `data-meta="3"`) → 7 `a0-nuvem` · nuvem |
| a1 Versionamento (7) | 8 `a1-bloco` → 9 `a1-dinamica` → 10 `a1-hoje-novo` · duas-colunas (antes-depois) → 11 `a1-ciclo` · linha-tempo (duas-linhas) → 12 `a1-regras` · conteudo (com-nota) → 13 `a1-proposta` · proposta → 14 `a1-compromissos` · quadro |
| Intervalo (1) | 15 `intervalo-pausa` · pausa (cafe) |
| a2 Pipeline (6) | 16 `a2-bloco` → 17 `a2-dinamica` → 18 `a2-pipeline-hoje` · conteudo (com-nota) → 19 `a2-anotacoes` · quadro (anotações) → 20 `a2-frentes` · duas-colunas (60-40) → 21 `a2-compromissos` · quadro |
| Fechamento (1) | 22 `fechamento-encerramento` · encerramento (resumo da manhã, uma proposta) |
| Almoço (1) | 23 `almoco-pausa` · pausa (almoco) |
| a3 Operação Inovação (6) | 24 `a3-bloco` → 25 `a3-dinamica` → 26 `a3-funil` · fluxo (comparativo: HOJE com 5 entradas e o funil × NOVO sem entradas, 3 POs) → 27 `a3-pos` · conteudo (lista; cartões produto ou frente × PO) → 28 `a3-proposta` · proposta → 29 `a3-compromissos` · quadro |
| a4 Ocorrências · novo fluxo de ocorrências e priorização (7) | 30 `a4-bloco` → 31 `a4-dinamica` → 32 `a4-fluxo` · fluxo (colunas: 5 etapas) → 33 `a4-atores` · conteudo (lista, padrão; cartões por ator) → 34 `a4-anotacoes` · quadro (anotações) → 35 `a4-proposta` · proposta → 36 `a4-compromissos` · quadro |
| a5 Review dos PRs · novo fluxo de review dos PRs (7) | 37 `a5-bloco` → 38 `a5-dinamica` → 39 `a5-fluxo` · fluxo (colunas: 5 etapas; a decisão é de QAs + Tech Lead juntos) → 40 `a5-papeis` · conteudo (lista; Tech Lead × POs) → 41 `a5-anotacoes` · quadro (anotações) → 42 `a5-proposta` · proposta → 43 `a5-compromissos` · quadro |
| a6 ShapeUp (5) | 44 `a6-bloco` → 45 `a6-dinamica` → 46 `a6-diagrama` · ciclo (6 + 2 semanas) → 47 `a6-reforco` · destaque (afirmacao) → 48 `a6-anotacoes` · quadro (anotações) |
| a7 Ferramentas e IA (6) | 49 `a7-bloco` → 50 `a7-dinamica` → 51 `a7-matriz` · matriz (quem recebe o quê) → 52 `a7-contas` · duas-colunas (50-50; as 2 contas atuais) → 53 `a7-proposta` · proposta → 54 `a7-compromissos` · quadro |
| Fechamento do dia (1) | 55 `fechamento-dia-encerramento` · encerramento (resumo do dia, lista de propostas) |

Total: 2 + 5 + 7 + 1 + 6 + 1 + 1 + 6 + 7 + 7 + 5 + 6 + 1 = 55 telas, uma `<section>` por arquivo (conferido em 01/10/2026 com `montar.py --saida`: o build diz "OK — 55 telas" e `SUMMIT.total()` devolve 55). Os `data-min` das telas também fecham o bloco: **apresentação** = telas de repertório (Abertura: 3 + 12 · a0: 5 · a1: 10 + 3 + 2 · a2: 10 · a3: 8 + 7 · a4: 10 + 5 · a5: 10 + 5 · a6: 5 + 5 · a7: 6 + 4) e **definições** = registro + proposta + Compromissos (a0: 35 + 20 · a1: 15 + 15 · a2: 20 + 5 + 10 · a3: 15 + 10 · a4: 15 + 10 + 10 · a5: 10 + 5 + 10 · a6: 5 · a7: 10 + 10; Fechamento e Fechamento do dia: 5 cada). `bloco` (2) e `dinamica` (= tempo do bloco) são enquadramento e ficam fora dessa soma. O `montar.py` só confere a soma `apres + def = min` do bloco e a da dinâmica; a das telas é conferência manual ao mexer num assunto. Layouts em uso: capa 1 · cronograma 1 · bloco 8 · conteudo 6 · duas-colunas 3 · linha-tempo 1 · fluxo 3 · ciclo 1 · destaque 1 · matriz 1 · dinamica 8 · brainstorm 1 · nuvem 1 · proposta 5 · quadro 10 (6 de compromissos, 4 de anotações) · pausa 2 · encerramento 2 = 55 telas em 17 dos 19 layouts. `numeros` e `opcoes` existem no catálogo mas não são usados neste deck.

Variações do padrão (o que cada assunto tem de diferente da sequência acima):

- **a0** fecha na nuvem (onde a sala vota a criticidade) e não tem compromissos.
- **a1** decide por `proposta` e fecha em Compromissos.
- **a2** decide por anotações e duas frentes, sem tela `proposta`.
- **a3** decide por `proposta` depois de dois repertórios (`fluxo` comparativo e a tela dos POs); não tem tela de anotações. O comparativo mostra o funil de hoje (todos os assuntos passam pelo Gestor da Área) e, em NOVO, só os cartões produto ou frente × PO, **sem entradas nem setas**: o briefing diz quem é o PO de cada um, não que os assuntos passam a ir até ele.
- **a4** tem a ordem mais completa: `fluxo` (colunas) → quem faz o quê → anotações → `proposta` → Compromissos.
- **a5** (40 min: apresentação 15 + definições 25): `fluxo` (colunas, 5 etapas: Issue · Desenvolver · PR · Revisão · Decisão) → quem responde pelo quê (Tech Lead × POs) → anotações → `proposta` → Compromissos. No `fluxo` o Tech Lead aparece como ator `techlead` (seção 9, *fluxo*).
- **a6** (15 min: apresentação 10 + definições 5): exceção sem proposta e sem Compromissos (acima).
- **a7** (30 min: apresentação 10 + definições 20): `matriz` (quem recebe o quê) → `duas-colunas` (as 2 contas atuais) → `proposta` → Compromissos (2 sementes). A `matriz` só afirma o que o briefing afirma: o resto é "não informado".
- **Fechamento** (11:55, 5 min: apresentação 0 + definições 5) é uma **exceção de 1 tela**: só a tela `encerramento` (variante `resumo`, modo **único**: lê só a `a1-proposta`), que relê os CSV ao vivo (seção 9). Fecha a manhã (Abertura, a0, a1, a2); os assuntos 3 a 7 vêm depois do almoço.
- **Fechamento do dia** (16:55, 5 min: apresentação 0 + definições 5): outra **exceção de 1 tela**, `encerramento` `resumo` em modo **lista**: sem `data-proposta`, lista **todas** as propostas dos blocos anteriores (hoje 5) e cobra os compromissos de todos os assuntos (hoje 9 sementes). Termina o dia às 17:00 (o id da tela é `fechamento-dia-encerramento`; o do bloco, `fechamento-dia`).
- **Intervalo** (11:00, 10 min) e **Almoço** (12:00, 120 min) são blocos de uma tela `pausa`, com `data-bloco-tipo="pausa"`: não entram nas horas efetivas do cronograma. A volta (`data-volta`) é 11:10 e 14:00, iguais ao início do bloco seguinte.

### Cronograma vigente (proposta ajustável; conferido em 01/10/2026)

Conferido contra os `data-bloco-*` de `conteudo/slides/` e contra o `SUMMIT.blocos` de um build real (`montar.py --saida` aberto no Chrome). Dia 09:00–17:00 (8h): **5h50 de trabalho efetivo** (350 min) + **2h10 de pausa** (130 min). É o que o rodapé do cronograma mostra: "5h50 de trabalho efetivo · sem 130 min de pausa".

| bloco | horário | min | apresentação | definições |
|---|---|---|---|---|
| Abertura (título + cronograma) | 09:00–09:15 | 15 | 15 | 0 |
| a0 · Brainstorming | 09:15–10:15 | 60 | 5 | 55 |
| a1 · Versionamento | 10:15–11:00 | 45 | 15 | 30 |
| Intervalo (pausa) | 11:00–11:10 | 10 | — | — |
| a2 · Pipeline | 11:10–11:55 | 45 | 10 | 35 |
| Fechamento (encerramento) | 11:55–12:00 | 5 | 0 | 5 |
| Almoço (pausa) | 12:00–14:00 | 120 | — | — |
| a3 · Operação Inovação | 14:00–14:40 | 40 | 15 | 25 |
| a4 · Ocorrências | 14:40–15:30 | 50 | 15 | 35 |
| a5 · Review dos PRs | 15:30–16:10 | 40 | 15 | 25 |
| a6 · ShapeUp | 16:10–16:25 | 15 | 10 | 5 |
| a7 · Ferramentas e IA | 16:25–16:55 | 30 | 10 | 20 |
| Fechamento do dia (encerramento) | 16:55–17:00 | 5 | 0 | 5 |

A conta, para quem for conferir: efetivo = 15 + 60 + 45 + 45 + 5 + 40 + 50 + 40 + 15 + 30 + 5 = 350 min (apresentação 110 + definições 240); pausa = 10 + 120 = 130 min; 350 + 130 = 480 min = 09:00 → 17:00. Manhã (09:00–12:00): 170 min efetivos + 10 de intervalo; tarde (14:00–17:00): 180 min efetivos, sem pausa. Os 13 blocos põem o cronograma no modo `colunas` (10 ou mais blocos: duas colunas, manhã e tarde, com o almoço como faixa central; seção 9, *cronograma*). Nomes na moldura: `a4` aparece como "Ocorrências" (o `data-bloco-nome` e o `data-bloco-curto`; o `assunto` `ocorrencias` do CSV casa com ele; o título da própria tela de abertura é "Novo fluxo de ocorrências e priorização"); `a3` como "Operação Inovação" (nome curto "Inovação"); `a5` como "Review dos PRs" (curto "Review"); `a7` como "Ferramentas e IA" (curto "Ferramentas"); o último bloco como "Fechamento do dia" (curto "Fim do dia"). O deck termina às 17:00; um bloco posterior, se houver, entra como bloco novo, com os `data-bloco-*` na primeira tela. A pauta de 18/09 previa um **bloco final intocável**; hoje o horário é ocupado pelos **Assuntos 5 a 7** (a confirmar com o Wendel: README, *Checklist pré-evento*, item 12, alínea d) e nenhum bloco do deck usa `data-bloco-tipo="intocavel"` (a variante continua no layout `bloco`).

Mudou um horário ou uma duração? Altere os `data-bloco-*` da primeira tela do bloco (e o `data-min` da `dinamica`, o `data-volta` da pausa). Cada bloco declara o **próprio início**: mudar a duração de um deles exige acertar o início de todos os seguintes (o `montar.py` avisa a lacuna ou a sobreposição, e `--final` reprova). O cronograma, a trilha e as telas `bloco` se recalculam a partir daí, e o `montar.py` reprova a conta que não fecha (passos da dinâmica = tempo do bloco; apresentação + definições = tempo do bloco).

### Vocabulário das telas

O que está **projetado** segue este vocabulário (também nos textos de exemplo dos modelos); os nomes de classe e de coluna são identificadores técnicos e não precisam acompanhar.

| use na tela | não use | observação |
|---|---|---|
| **release stable** | "release oficial", "liberação oficial" | versão mensal. Formato `27.N.H`: **27 é o ano**, **N é a evolução da release stable** (uma por mês) e **H é o hotfix**, que é 0 na release stable (`27.1.0`) |
| **hotfix** | "liberação específica", "liberação intermediária" | sobe só o último número (`27.1.1`, `27.1.2`…) |
| **Responsável** | "Owner" (termo do cliente) | rótulo da coluna e dos campos; a coluna do CSV continua `responsavel` |
| **Melhorias** · **Customizações** · **Bugs** | — | os tipos de ocorrência: a IA avisa a Inovação das Melhorias e Customizações e o QA dos Bugs |
| **board de consulta** | — | o que a estimativa de liberação alimenta, para o Atendimento consultar |
| **Gestor da Área** · **PO** | — | do Assunto 3: hoje todos os assuntos passam pela validação do Gestor da Área (o funil); no novo fluxo cada produto ou frente de trabalho tem um PO. O que cada papel faz no novo fluxo está **a definir** (README, *Checklist pré-evento*, item 12, alínea a) |
| **Tech Lead** · **POs** · **QAs** | — | do Assunto 5: o Tech Lead é responsável pela atuação em demandas das camadas críticas (camadas de áudio e disparos de satélite); os POs, pela integridade das aplicações dentro de suas alçadas; QAs e Tech Lead decidem se o PR é aceito, com base na análise do Claude. Nome de pessoa só ligado ao papel |
| **issue** · **PR** · **review** | — | do Assunto 5: a issue é aberta no GitHub, o PR é anexado a ela e o **Claude** revisa o desenvolvimento feito (ator `ia` no `fluxo`, chip "Claude") |
| **ShapeUp** · **ciclo** · **cooldown** | — | do Assunto 6: ciclos de 6 semanas e cooldown de 2 semanas (uma volta de 8 semanas; o ritmo se repete) |
| **GitHub pago** · **plano individual do Claude** · **conta de Desenvolvimento** · **conta de Inovação** | — | do Assunto 7. Cada coisa só aparece na tela como o briefing a diz; o que o briefing não diz é "não informado" (de quais serviços são as 2 contas atuais e a leitura de "2 planos individuais": README, *Checklist pré-evento*, item 12, alíneas b e c) |
| Prazo · Ação · Status | — | cabeçalhos do quadro de compromissos |

As telas e os modelos de `linha-tempo` ainda usam os identificadores `lt-marco--oficial` e `--intermediario`: em tela, `--oficial` = release stable e `--intermediario` = hotfix.

## 7. Boas práticas de código

- **HTML**: semântico (`header`, `main`, `section`, `button`, `table`), `lang="pt-BR"`, sem estilo nem evento inline; `aria-label` em botões só-ícone; ids únicos.
- **CSS**: tokens em `:root` (`00-tokens.css`), sem valores soltos; layout escopado por `.slide[data-layout="x"]`; classes em português, prefixo do layout; `!important` só em utilitários e impressão; ordem de carga núcleo → layouts → impressão.
- **JS**: scripts clássicos `defer` (funcionam em `file://`), cada arquivo em IIFE com `'use strict'`; único global `window.SUMMIT`; sem `alert/confirm/prompt`; delegação de eventos; nada de `innerHTML` com texto digitado pelo usuário (use `textContent`); `try/catch` em armazenamento; não interceptar teclas com foco em campo editável.
- **Segurança**: CSP restritiva no `<meta>` (`default-src 'self'`; sem estilo inline — o JS só mexe em estilo pelo CSSOM); nenhum CDN; dados digitados nunca são interpretados como HTML; CSV protegido contra fórmula (5.8).
- **Versionamento**: `index.html` referencia `assets/…?v=<hash>` (cache-busting automático a cada build; hash calculado sobre o texto em LF, igual em Windows e Linux).
- **Validações do `montar.py`** (erro de build, ou aviso quando indicado): ids únicos e `data-layout` conhecido · `data-tabela` e `th data-campo` existentes em `dados/esquema.json` · `quadro` com `data-tabela` e `data-assunto` · `proposta` com `data-assunto` · `brainstorm` e `nuvem` com `data-rodada`, e toda nuvem com um brainstorm da mesma rodada e tabela · metadados do bloco só na primeira tela, com nome, início e duração; `apres + def = min`; passos da dinâmica e `data-min` da dinâmica iguais ao tempo do bloco · agenda encadeada (aviso; erro em `--final`) · `data-volta` da pausa igual ao início do bloco seguinte (aviso; erro em `--final`) · **`fluxo`**: variante `colunas` ou `comparativo`; colunas com 2 a 5 etapas de 1 a 3 nós; comparativo com 2 faixas (`hoje`, depois `novo`), HOJE com 2 a 6 entradas, NOVO **com** entradas **iguais às de HOJE** (texto e ordem) ou **sem** entradas e marcado `data-entradas="nenhuma"` (os dois lados da regra são erro), e 2 a 4 POs, um por destino; `data-modo` de `ul.fluxo-nos` fora de `sequencia`/`paralelo`/`alternativa` · **`encerramento` resumo**: `data-proposta` é **opcional** (se existir, é o id de uma tela `proposta`; sem ele a tela lista todas as propostas dos blocos anteriores), `data-referencia` é data válida, `data-assunto-sugestoes` (se existir) é o `data-assunto` de um quadro de anotações · `ciclo` e `matriz` estão registrados em `LAYOUTS` e **não têm validação própria** (o limite de semanas, linhas e colunas vive no modelo e na auditoria). Limite de **caracteres** não é validado: quem acusa estouro é a auditoria (`SUMMIT.auditar()`).
- **Testes**: `python ferramentas/montar.py --verificar` (index e catálogo em dia com as fontes) · `npm run capturar` (Chrome real) → PNG por tela + auditoria + violações de CSP · `python ferramentas/montar.py --final` antes de publicar.
- **Auditar com dados**: o `capturar` abre o deck com os CSV **limpos** (só a semente), então não exercita o que as telas fazem com dado: lista e densidade do `brainstorm`, termos da `nuvem`, linhas do `quadro`, selos da `proposta` e, principalmente, os **dois `encerramento` resumo** (Fechamento e Fechamento do dia), que só ganham forma (compromissos agrupados, lista de propostas, "+N abaixo", textos encurtados) quando há dado. Antes do evento, injete dados de ensaio (texto longo incluído), **percorra o deck** (cada tela precisa ser aberta ao menos uma vez: algumas, como a `dinamica`, só ajustam a fonte ao serem exibidas, e a auditoria sem a visita acusa problema que não existe) e rode `SUMMIT.auditar()`: no console do Chrome do deck (ou com um script `puppeteer` próprio sobre um build `--saida`, usando `SUMMIT.dados.tabela('…').adicionar({…})` e `SUMMIT.ir(i)` antes de auditar). `resumo.comProblema` tem de ser 0. O README (*Checklist pré-evento*, item 3) traz o trecho pronto para colar no console, com dados nas 5 tabelas e o percurso das 55 telas. Quem ensaia no navegador do evento desfaz tudo com **D › Zerar dados** (README, *Ensaio × evento*); em `file://` todas as páginas locais compartilham a mesma cópia local, então prefira um perfil de Chrome separado para o ensaio de auditoria.

## 8. Teclado

**Em qualquer tela** (não disparam com foco em campo editável; `Esc` sai do campo; com visão geral, ajuda, apagão ou painel D abertos, só as teclas deles valem):

| tecla | ação |
|---|---|
| `→` `PageDown` `Espaço` · `←` `PageUp` | próxima · anterior |
| `Home` `End` | primeira · última |
| `O` | visão geral (`← →` ±1 · `↑ ↓` ±4 · `Enter` abre · `Esc`/`O` fecha) |
| `F` | tela cheia |
| `T` | cronômetro: exibir/iniciar/pausar (1ª vez usa o `data-min` da tela; sem ele, 10 min) |
| `R` · `+` `-` · `Shift+T` | reiniciar no tempo com que partiu (passo ou tela) · ±1 min · ocultar (o tempo segue correndo; `T` reexibe) |
| `D` | painel da base de dados (CSV); `D` ou `Esc` fecha |
| `H` | relógio real |
| `B` | apagão com logo (`B` ou `Esc` volta) |
| `G` + nº + `Enter` | ir para a tela (até 3 dígitos; o painel "Ir para a tela: 14_" mostra o que foi digitado). `Esc` cancela; qualquer tecla que não seja dígito/`Enter` também cancela (e dispara o seu próprio atalho). **No modo G os dígitos são do G**: não disparam passos nem decisões |
| `?` | ajuda de atalhos |
| `Esc` | fecha visão, ajuda, apagão, modo G |

Endereço `#/N` ou `#id-da-tela` abre numa tela; sem hash, o deck reabre na última posição salva (por isso **Zerar** apaga a posição). Em toque, deslizar mais de 60 px navega.

**Por layout** (só com a tela ativa):

| layout | teclas |
|---|---|
| `dinamica` | `1`–`9` inicia o passo nº (cronômetro no tempo do passo; o passo em curso vira "feito"); no passo **já em curso** só pausa/retoma · `Shift+1`–`Shift+9` conclui o passo e pausa o tempo (repetir em passo feito desmarca) · botão **Desfazer** volta a última mudança · Tab + `Enter`/`Espaço` no passo = clique. Independem do layout do teclado (leem a tecla física) |
| `proposta` | `1` aceitar · `2` ajustar · `3` recusar (repetir desmarca; com `Shift`/`Ctrl`/`Alt` não dispara). `−`/`+` das mãos por clique ou Tab |
| `brainstorm` | `Enter` sem foco em campo leva à barra de entrada · `Enter` no participante vai ao apontamento · `Enter` no apontamento adiciona e mantém participante e tipo · `Esc` devolve o deck · **`V`** alterna "Ver todos" (volta com `V`, `Esc` ou `Enter`); em Ver todos `↑`/`↓` rolam as listas · edição inline: `Enter` salva, `Esc` cancela |
| `quadro` | `Enter` avança de célula (na última da última linha cria linha; pula o contador) · `Tab`/`Shift+Tab` trocam de campo · `Esc` tira o foco · prazo: `/` `.` `-` passam ao campo seguinte · opções: setas/`Home`/`End` trocam · contador: `+` e `−` votam (Enter não vota) · `Espaço` em botão: foco por teclado (Tab) aciona o botão; foco por mouse avança a tela (regra do núcleo) |
| `nuvem` | controle `1 · 2 · 3` de cada termo vermelho: Tab, `Enter`/`Espaço`; termos da nuvem são focáveis e mostram a dica ao focar |

**Caps Lock**: as teclas de letra (`T F O R H B G D V`) funcionam com Caps Lock ligado ou desligado; o `Shift` só conta em `Shift+T` e `Shift+1…9`. Mesmo assim, deixe-o desligado: digitar no brainstorm com Caps Lock projeta tudo em maiúsculas.

## 9. Catálogo de layouts

Extraído do comentário de ANATOMIA de cada `conteudo/modelos/*.html` e conferido contra `assets/js/layouts/`, `assets/css/layouts/` e `ferramentas/montar.py`. `catalogo.html` (gerado por `python ferramentas/montar.py --modelos`) mostra cada modelo renderizado (38 telas-modelo em 21 arquivos). São **19 layouts**, na ordem abaixo: capa · cronograma · bloco · conteudo · duas-colunas · numeros · destaque · fluxo · linha-tempo · ciclo · opcoes · matriz · proposta · dinamica · quadro · brainstorm · nuvem · pausa · encerramento. Deste deck, 17 estão em uso (`numeros` e `opcoes` só no catálogo). Atributos comuns a todos (`id`, `data-layout`, `data-bloco`, `data-min`, `data-modelo`, `data-chrome`) estão na seção 3; aqui só o que é específico.

Limites de texto valem para Chrome a 1920×1080 (e 1366×768: o palco escala, a proporção é a mesma). **O layout nunca reduz fonte sozinho** (exceto `dinamica`, `quadro` e `brainstorm`, que descem em degraus até um piso): estourou, `SUMMIT.auditar()` acusa — corte o texto, não a fonte.

### capa
- **Serve para**: abertura do evento — marca como protagonista, título e frase-guia. Uma por deck, a 1ª tela.
- **Atributos**: `data-chrome="off"` (esconde a moldura); leva os `data-bloco-*` do bloco de abertura. Sem variantes.
- **Classes-chave**: `.capa-marca` (logo 128 px) · `.cab.capa-titulo` (`.kicker`, `h1` com `<em>` laranja, `.sub`) · `.capa-rodape` (`.capa-frase`, `.capa-meta`) · `.capa-decor[data-decor]` + `.capa-arcos` (decoração ignorada pela auditoria).
- **CSV**: nenhuma (estática).
- **Limites**: título até ~34 caracteres em 2 linhas de 112 px (3 linhas só com subtítulo e frase de 1 linha) · subtítulo e frase-guia até 2 linhas · metadados: 3 itens curtos em uma linha.
- **Regras**: logo só via `<use href="#logo-informa">`; nunca inventar data, horário ou local.

### cronograma
- **Serve para**: a agenda do dia na tela. **Gerada** em runtime a partir dos `data-bloco-*` (`SUMMIT.blocos`), nunca digitada — não diverge do deck.
- **Atributos**: `data-origem="manual"` desliga a geração (aí o conteúdo de `.cronograma-lista` e `.cronograma-total` é escrito à mão). Escritos pelo JS: `data-densidade` e `data-linhas` (nº de blocos). **Três modos**: `amplo` (até 6 blocos) · `medio` (7–9), os dois em uma coluna, com a barra fina e os rótulos "Apresentação N min · Definições M min" por extenso abaixo dela · **`colunas` (10 ou mais blocos)**: **duas colunas, manhã à esquerda e tarde à direita**, com a pausa mais longa (a partir de 30 min: o almoço) como **faixa vertical** no meio; o `.sub` some, cada linha ganha duas fileiras (hora, nome e duração em cima; a barra embaixo) e os minutos vão **dentro** dos segmentos (quadrado = apresentação, círculo = definições; a legenda traz "Números em minutos"; o texto por extenso fica só para leitor de tela). Cada coluna tem cabeçalho com o período, a faixa de horas e as horas efetivas dela; o período vem do início do primeiro bloco (antes das 12:00 "Manhã", até as 18:00 "Tarde"). Sem pausa longa que deixe de 1 a 7 linhas de cada lado, o dia é cortado ao meio e as colunas viram "Parte 1" e "Parte 2". `data-cheio="sim"` na lista = 7 linhas numa coluna (linhas mais baixas); o aviso de horários que não encadeiam vai para o canto do cabeçalho. Por linha: `data-tipo="assunto|pausa|intocavel"`, `data-aviso="lacuna|sobreposicao"`. Fonte: `data-bloco-nome/-ini/-min/-apres/-def/-tipo` das telas de abertura de bloco e `data-variante="almoco"` da pausa (ícone talher; sem variante, o ícone é a xícara, e o nome do bloco com "almoço" também vira talher). **Horas efetivas** = soma dos blocos que não são `pausa` (Abertura e os dois Fechamentos contam); pausa aparece como "Pausa: fora das horas efetivas". No deck atual: **13 blocos**, modo `colunas`, **5h50 efetivas**, 130 min de pausa, dia 09:00 – 17:00 (manhã 09:00–12:00, 2h50 efetivas, 6 linhas · almoço na faixa central · tarde 14:00–17:00, 3h efetivas, 6 linhas).
- **Classes-chave**: `ol.cronograma-lista` > `li.cronograma-linha` (`.cronograma-hora` `.cronograma-nome` `.cronograma-divisao` `.cronograma-min`); no modo `colunas`, `li.cronograma-grupo` (`.cronograma-grupo-cab` com período, faixa de horas e horas efetivas · `ol.cronograma-grupo-lista`) e `li.cronograma-linha[data-faixa="central"]` · `footer.cronograma-total` (horas efetivas sem pausa, faixa do dia, legenda, aviso de horários).
- **CSV**: nenhuma.
- **Limites**: nomes de bloco até ~30 caracteres (em uma coluna quebram em 2 linhas) e até ~20 em `colunas` (corta com reticências e a auditoria acusa) · testado de 1 a 14 blocos (projeto: 13, em colunas); acima de 14 (7 por coluna) a área útil estoura e a auditoria acusa: use `data-origem="manual"` ou divida o dia · bloco sem `data-bloco-min` é ignorado · sem bloco algum a tela mostra aviso.

### bloco
- **Serve para**: abertura de um **assunto** — quando começa, quanto dura, para quê e o que sai dele. Sempre a 1ª tela do bloco; carrega os `data-bloco-*`.
- **Atributos**: `data-bloco-nome/-curto/-ini/-min/-apres/-def`; `apres + def = min` (o `montar.py` reprova). Variante **intocável**: `data-bloco-tipo="intocavel"` (cadeado, selo laranja, linha do porquê `.bloco-intocavel`, contorno laranja no card do horário; o porquê é obrigatório, até 3 linhas). O JS (`25-bloco.js`) preenche `[data-campo]` `inicio`, `fim` (= início + duração), `duracao`, `apres`, `def` e a largura das barras.
- **Classes-chave**: `.bloco-relogio` (`.bloco-hora` `.bloco-dados` `.bloco-divisao` `.bloco-barra` `.bloco-legenda`) · `.bloco-principal` (`.cab`, `.bloco-objetivo` `.bloco-objetivo-txt`, `.bloco-duas` com "Saímos daqui com" `.lista--numerada` e "Quem está na sala" `.bloco-perfis` de `.chip`).
- **CSV**: nenhuma.
- **Limites**: nome do assunto até ~24 caracteres numa linha · objetivo 1 frase (~110 caracteres) · 2 a 4 entregas de até ~70 caracteres · até 6 chips de perfil (genéricos, nunca nomes de pessoa).

### conteudo
- **Serve para**: a tela padrão — repertório, contexto, regras, passos. Só leitura.
- **Atributos**: `data-variante="lista"` (padrão, corpo a 34 px) · `numerada` (`.lista--numerada`) · `com-nota` (`.conteudo-grade`: lista a 30 px + `aside.conteudo-nota` com ícone de alerta, rótulo "Atenção" e texto — nunca só cor).
- **Classes-chave**: `.cab` · `.corpo` · `.lista` · `.fonte` · `.conteudo-grade` `.conteudo-nota` `.conteudo-nota-topo` `.conteudo-nota-ico`.
- **CSV**: nenhuma.
- **Limites**: título até 2 linhas (~44 caracteres/linha), sub até 2 linhas · lista/numerada: 3 a 4 itens de até 2 linhas (~60 caracteres/linha); 5 só se todos cabem em 1 linha e sem `.fonte` · com-nota: 3 a 4 itens (~38 caracteres/linha), nota com título de até 2 linhas + 4 linhas de texto · `.fonte` em uma linha (duas origens separadas por " · ").
- **Regras**: fato interno com número leva `.fonte` com origem e data.

### duas-colunas
- **Serve para**: comparar ou contrapor duas coisas (opções, lados, formatos, hoje × proposta). Só leitura.
- **Atributos**: `data-variante="50-50"` (dois `.card--destaque` iguais: `.rotulo` + `h3` + lista de 3) · `60-40` (`.duas-texto` com `h3` + `.corpo-txt` + lista, e `.card--forte` com o ponto central) · `antes-depois` (`.duas-lado` "Hoje" × `.duas-lado--proposta` "Proposta", `.duas-seta` no meio; cada lado: `.rotulo` + `.duas-trecho` grande em mono + `ul.duas-explica` com **exatamente 3** linhas).
- **Classes-chave**: `.duas-grade` `.duas-texto` `.duas-lado` `.duas-lado--proposta` `.duas-trecho` `.duas-explica` `.duas-seta`.
- **CSV**: nenhuma.
- **Limites**: título e sub até 2 linhas · 50-50 e 60-40: 3 itens por lista de até 2 linhas, `h3` em 1 linha (~28 caracteres) · antes-depois: trecho até ~48 caracteres, cada linha de explicação até 2 linhas (~34 caracteres/linha).
- **Regras**: em comparação de formatos o trecho é exemplo neutro, não dado real.

### numeros
- **Serve para**: painel de indicadores (KPIs) — 3 ou 4 tiles com número grande, rótulo, descrição e **origem**.
- **Atributos**: `data-n="3"` (número em 104 px) · `data-n="4"` (72 px). Unidade junto ao número: `<span class="numeros-unidade">`.
- **Classes-chave**: `.numeros-grade` · `.numeros-tile` (`.rotulo` + `p.num.numeros-valor` + `p.numeros-desc` + `p.fonte`) · `.numeros-unidade`.
- **CSV**: nenhuma.
- **Limites**: número até ~8 caracteres (em `data-n="4"` até 6; acima disso use 3) · rótulo até ~22 caracteres em 4 tiles · descrição até 3 linhas (~28 caracteres/linha em 4 tiles) · `.fonte` curta (quebra em 2 linhas).
- **Regra de ouro**: número sem origem não entra — todo tile leva `.fonte` ("Origem · dd/mm/aaaa"); nunca nome de pessoa junto de métrica nem nome de cliente. Valores do modelo são placeholders.

### destaque
- **Serve para**: frase-guia ou pergunta para a sala — quase só tipografia.
- **Atributos**: `data-variante="pergunta"` (frase a 80 px terminada em "?", filete horizontal e bloco opcional "Para pensar" com 2 ou 3 perguntas) · `afirmacao` (96 px, filete vertical; o modelo a mostra sem "Para pensar", mas o bloco opcional também renderiza nessa variante: `a6-reforco` o usa com 2 perguntas, sem problema na auditoria).
- **Classes-chave**: `.destaque-frase` (`<em>` itálico laranja) · `.destaque-filete` · `.destaque-pensar` · `.destaque-perguntas`.
- **CSV**: nenhuma.
- **Limites**: frase até ~110 caracteres (pergunta, 3 linhas) ou ~80 (afirmação, 4 linhas) · "Para pensar": cada pergunta até 2 linhas (~75 caracteres/linha).
- **Regras**: a pergunta só aparece depois do repertório; frase com número interno leva a origem numa tela anterior ou `.fonte`.

### fluxo
- **Serve para**: diagrama de processo — mostra **como algo anda**: quem faz o quê, em que ordem, o que fica registrado. É repertório: vem antes de qualquer pergunta à sala. Sem JS e sem CSV (o HTML já é o dado). Estilos em `37-fluxo.css`, escopados em `.slide[data-layout="fluxo"]`. Usado em `a3-funil` (comparativo) e em `a4-fluxo` e `a5-fluxo` (colunas).
- **Atributos**: `data-variante="colunas|comparativo"` (declare sempre; no CSS, `colunas` é o estilo-base e só o `comparativo` tem seletor próprio).
  - **colunas**: fluxo da esquerda para a direita, de **2 a 5 etapas**, cada uma com **1 a 3 nós** (ação · artefato · decisão), com ramificação (nós em paralelo), alternativa (um OU outro) e convergência (dois atores juntos).
  - **comparativo**: duas faixas, **HOJE** (várias entradas convergindo para **um** gargalo) × **NOVO**, que tem duas formas: **com entradas** (as mesmas entradas distribuídas para N POs em paralelo, cada um com a sua saída: o diagrama **afirma** o roteamento) e **sem entradas** (`data-entradas="nenhuma"` na faixa NOVO: só os cartões produto ou frente + PO lado a lado e a nota, sem entradas, barramento, seta nem saída). Use a forma sem entradas quando o briefing diz apenas **quem é** o PO de cada produto ou frente, e não que os assuntos passam a ir até ele (é o caso de `a3-funil`).
  - No `ul.fluxo-nos`: `data-modo="sequencia"` (padrão; seta para baixo entre os nós) · `paralelo` (ramificação, marcador "+"; `aria-label="Em paralelo"`) · `alternativa` (um OU outro, marcador "ou"; `aria-label="Um destes caminhos"`). No `div.fluxo-no`: `data-tipo="acao"` (padrão; barra lateral na cor do ator) · `artefato` (canto dobrado + rótulo "Artefato": o que **fica registrado** — relatório, card, board, tarefa) · `decisao` (hexágono achatado + rótulo "Decisão": o caminho depende de um critério). No `p.fluxo-atores`: `data-juntos` (os dois atores atuam **juntos**: "+" entre os chips).
  - **Atores** (`data-ator` no nó e no chip `.fluxo-ator`; a cor nunca é a única pista: todo chip leva ícone + nome): `ia` laranja · `i-play`; `qa` azul · `i-check`; `inovacao` verde-água · `i-alvo`; `dev` violeta · `i-seta`; `atendimento` · `i-pessoas`, `comercial` · `i-ajustar`, `gestor` · `i-cadeado` e `po` · `i-quadro` (estes quatro, neutros: distinguem-se só por ícone e nome) e **`techlead`** (neutro, um degrau acima dos outros: contorno `--ink` e fundo `--card-forte`; o sprite não tem ícone de liderança técnica, então o chip leva um SVG inline de colchetes de código `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 7l-5 5 5 5M15.5 7l5 5-5 5"/></svg>` e o rótulo livre "Tech Lead"; vale no chip do cabeçalho, no chip dentro do nó e na barra do nó; em `a5-fluxo` aparece na decisão, ao lado dos QAs, com `data-juntos`). Use sempre o mesmo par ator/ícone em todas as telas; evite `i-mais` em chip de ator (é o "+" do paralelo e da convergência).
  - **Quem é quem** (para o chip não mudar de sentido entre telas): chip no **cabeçalho** da etapa = quem **conduz** a etapa (a IA que avisa; QA e Inovação que estimam); chip **dentro do nó** = sempre quem **age** nesse nó. Se o destinatário é diferente de quem age, escreva-o no texto do nó ("Recebe o aviso dos Bugs"); nunca ponha no chip do nó o destinatário de uma ação de outro ator. `data-ator` num artefato = quem o produz e mantém; sem ele, o artefato é neutro.
- **Classes-chave** (colunas): `.cab` (kicker · h2 · .sub, cada um em 1 linha) · `ol.fluxo-etapas[aria-label]` > `li.fluxo-etapa` (2–5; a ordem do HTML é a ordem do fluxo) > `header.fluxo-etapa-cab` (`span.fluxo-num[aria-hidden]` · `h3.fluxo-titulo` com `sr-only` "Etapa N: " na frente · `p.fluxo-atores` opcional, 0 a 2 chips `span.fluxo-ator` = svg.ico + nome; sem chip, omita o `<p>`) + `ul.fluxo-nos` > `li.fluxo-no-item` > `div.fluxo-no` (`p.fluxo-no-tipo` só em artefato e decisão · `span.fluxo-ator` opcional dentro do nó · `p.fluxo-no-txt`, com `<b>` para destacar 1 expressão) · `ul.fluxo-legenda` opcional (`span.fluxo-amostra` `--artefato|--seta|--paralelo` + texto). **Comparativo**: `div.fluxo-comparativo` > 2 × `div.fluxo-faixa[data-faixa="hoje|novo"][role=group][aria-label]` (HOJE em cima; na forma sem entradas a faixa NOVO leva `data-entradas="nenhuma"`) com `div.fluxo-faixa-rotulo` (`span.fluxo-faixa-chip` + `p.fluxo-faixa-nota` opcional) · `ul.fluxo-entradas` > `li.fluxo-entrada` > `span.fluxo-entrada-txt` (2 a 6, **os mesmos nas duas faixas**) · `span.fluxo-ligacao[data-decor][aria-hidden]` · `ul.fluxo-destinos[aria-label]` > `li.fluxo-destino`: em HOJE, `div.fluxo-gargalo` (`p.fluxo-gargalo-tipo` com ícone de alerta + "Funil", chip `gestor` opcional, `p.fluxo-gargalo-txt`) e `p.fluxo-saida`; em NOVO, `div.fluxo-po[data-ator="po"]` (`p.fluxo-po-prod` = produto ou frente, em destaque · `p.fluxo-po-nome` = ícone + "PO · nome") e `p.fluxo-saida`; **na forma sem entradas** a faixa NOVO só tem o rótulo (chip + nota) e `ul.fluxo-destinos` > `li.fluxo-destino` > `div.fluxo-po`, **sem** `.fluxo-entradas`, `.fluxo-ligacao` nem `.fluxo-saida`. Barramentos, setas e a seta entre etapas são desenhados por CSS; nenhuma é glifo de texto.
- **CSV**: nenhuma.
- **Entradas animadas**: `.anim` `d1…d7` (cabeçalho d1–d3; etapas d3…d7 da esquerda para a direita; legenda d7).
- **Densidade** (automática, conta as etapas): texto dos nós 30 px (2–3 etapas) · 26 px (4) · 22 px (5); título da etapa 40 · 34 · 30 · 26 px (2 · 3 · 4 · 5 etapas); chip de ator 22 px com 2–4 etapas e 20 px com 5 (e no comparativo). O layout nunca reduz a fonte abaixo disso: estourou, a auditoria acusa — corte o texto.
- **Limites — colunas** (medidos a 1920×1080 e 1366×768 no pior caso: todas as colunas iguais, título da etapa de 2 linhas e 1 chip no cabeçalho): título e sub em 1 linha · 2 a 5 etapas (6 não é suportado: divida em duas telas) · 1 a 3 nós por etapa · 0 a 2 chips por etapa · título da etapa até 2 linhas (~14 caracteres por linha com 5 etapas; ~18 com 4; ~24 com 3; ~28 com 2). **O rótulo "Artefato" e o chip dentro do nó consomem uma linha cada**, então o limite do texto depende da composição do nó, e a coluna mais cheia manda para todas. Máximo de caracteres **por nó**:

  | composição do nó | etapas | 2 nós · com legenda | 2 nós · sem | 3 nós · com legenda | 3 nós · sem |
  |---|---|---|---|---|---|
  | **A** só ação (sem chip no nó, sem artefato) | 5 (22 px) | 100 | 140 | 65 | 85 |
  | | 4 (26 px) | 85 | 105 | 45 | 65 |
  | | 3 (30 px) | 85 | 110 | 60 | 60 |
  | | 2 (30 px) | 140 | 190 | 50 | 95 |
  | **B** com artefato (1 nas colunas de 2 nós; 2 nas de 3) | 5 | 90 | 120 | 40 | 60 |
  | | 4 | 85 | 105 | 25 | 45 |
  | | 3 | 85 | 110 | 30 | 55 |
  | | 2 | 95 | 140 | 50 | 50 |
  | **C** chip de ator dentro de todos os nós | 5 | 85 | 105 | 20 | 40 |
  | | 4 | 65 | 85 | 25 | 45 |
  | | 3 | 60 | 85 | não cabe | 30 |
  | | 2 | 95 | 140 | não cabe | 50 |

  Quando só **um** dos 3 nós da coluna é artefato (os outros dois, de ação): 5 etapas 40 · 65 (com · sem legenda), 4 etapas 40 · 65, 3 etapas 30 · 60, 2 etapas 50 · 95. Misturou composições (artefato e chip no mesmo nó)? Cada um custa uma linha: parta do caso C e confirme com `SUMMIT.auditar()`. Com 3 nós, cada passo de A para B e de B para C tira de 1/3 a 1/2 do texto (com 3 nós e legenda, não use chip dentro do nó). **Nós no total**: o teto é a altura, não uma contagem; referência de 12 nós (5 etapas, 3 + 3 + 2 + 2 + 2, 1 artefato por coluna) = ~40 caracteres por nó com legenda e ~65 sem. Legenda: até 4 itens de 1 linha; omita-a quando uma etapa tem 3 nós de 3 linhas ou mais.
- **Limites — comparativo**: título e sub em 1 linha · entradas: 2 a 6 (com 6 o chip cai de 46 para 40 px), texto do chip em 1 linha, até ~18 caracteres (o excedente vira reticências) · **HOJE**: 1 gargalo (rótulo "Funil" e ícone de alerta obrigatórios; texto até 2 linhas de ~34 caracteres), saída até 2 linhas (~22 caracteres por linha) · **NOVO**: 2 a 4 POs; produto ou frente em 1 linha (~30 caracteres com 2–3 POs; ~14 com 4), "PO · nome" em 1 linha (~38 com 2–3 POs; ~16 com 4), saída em 1 linha (~22 caracteres); com 4 POs o cartão vira uma linha só (produto à esquerda, PO à direita) · **NOVO sem entradas**: 2 a 4 cartões lado a lado, produto a 40 px (34 px com 4) e "PO · nome" a 26 px (22 px com 4), os dois em 1 linha; com 2–3 cartões o produto vai até ~20 caracteres e "PO · nome" até ~28, com 4 cartões ~14 e ~20 · nota da faixa até 4 linhas de ~15 caracteres. Estourou: produto, PO, saída e chip de entrada terminam em reticências (a auditoria acusa "recortado"); o resto não cresce.
- **Regras**: texto-modelo neutro (nome de pessoa, produto ou cliente real só na tela final, nunca no modelo); **um nó = uma ideia**, no máximo 3 linhas; ramificação (`paralelo`) só entre nós que de fato acontecem juntos e "ou" (`alternativa`) só quando é um OU o outro; mais de 5 etapas ou mais texto que os limites: divida em duas telas (sem rolagem e sem fonte menor: o excedente cai sobre a trilha do dia e a auditoria acusa `fora-da-area`); **o par HOJE × NOVO com entradas só vale se as entradas forem as mesmas nas duas faixas** (NOVO sem entradas é válido e declara `data-entradas="nenhuma"`); fato com número ou data reais leva `<p class="fonte">` (origem e data) no fim do `.corpo`; o nome de PO ligado ao produto ou frente, e o do Tech Lead ligado ao papel, sem métrica, são a exceção da seção 1; o rótulo do ator `ia` é livre (em `a5-fluxo` o chip diz "Claude").
- **Validação (`montar.py`, erro de build)**: `data-variante` ausente ou diferente de `colunas`/`comparativo` · `colunas`: 2 a 5 `li.fluxo-etapa`, cada uma com 1 a 3 `.fluxo-no-item`, e nenhuma `.fluxo-faixa` · `comparativo`: nenhuma `li.fluxo-etapa`; exatamente 2 `.fluxo-faixa` com `data-faixa` `hoje` e depois `novo`; HOJE com 2 a 6 `.fluxo-entrada`; NOVO **com** entradas (as mesmas de HOJE, **com o mesmo texto e na mesma ordem**) ou **sem** entradas e com `data-entradas="nenhuma"` (NOVO sem entradas e sem o atributo, ou com o atributo e com entradas, é erro; o único valor aceito é `nenhuma`); em NOVO, 2 a 4 `li.fluxo-destino` e 2 a 4 `.fluxo-po`, um PO por destino; `data-modo` do `ul.fluxo-nos` só `sequencia`, `paralelo` ou `alternativa`. O limite de **caracteres** (tabela acima) não é validado: a auditoria acusa o estouro.
- **No deck**: `a3-funil` é um `comparativo`: HOJE com 5 entradas ("Assunto A" a "Assunto E": placeholders neutros) convergindo para o funil do Gestor da Área e NOVO **sem entradas**, só com os 3 cartões produto ou frente × PO (InfoAudio · InfoRádio · SaaS); `a4-fluxo` são `colunas` com 5 etapas (Entrada · Coleta e análise · Aviso por tipo · Estimativa · Saídas) e 3 · 3 · 2 · 1 · 2 nós, sem legenda; `a5-fluxo` são `colunas` com 5 etapas (Issue · Desenvolver · PR · Revisão · Decisão) e 1 · 1 · 2 · 2 · 1 nós, com os atores `dev`, `ia` (chip "Claude"), `qa` e `techlead`. O `a4-fluxo` segue o briefing do cliente: a ocorrência entra pelo Atendimento, Comercial ou Inovação; a IA baixa as novas de um dia para o outro, analisa, gera o relatório e cria o card no board do GitHub; avisa a Inovação (Melhorias e Customizações) ou o QA (Bugs); QA e Inovação rodam o fluxo de estimativa de liberação, que alimenta o board de consulta do Atendimento, e atribuem a tarefa no GitHub ao desenvolvedor.

### linha-tempo
- **Serve para**: como um esquema se comporta ao longo do tempo — sequência com dois tipos de marco (caso típico: versionamento, uma **release stable** por período e **hotfixes** numerados entre elas). É repertório: vem antes de qualquer pergunta.
- **Atributos**: `data-variante="uma-linha"` (padrão) · `duas-linhas` (release stable em cima, hotfixes embaixo; exige os dois `p.lt-faixa`). No marco: `.lt-marco--oficial|--intermediario` (identificadores técnicos: `--oficial` = release stable, `--intermediario` = hotfix) e `data-periodo="N"`. No período: `data-de="<coluna inicial>"` e `data-n="<nº de marcos>"` (1 a 10); a soma dos `data-n` = nº de marcos.
- **Classes-chave**: `.lt-quadro` · `ol.lt-marcos` > `li.lt-marco` (`.lt-versao` `.lt-no` `.lt-rotulo` `.lt-chamada`) · `ol.lt-periodos` > `li.lt-periodo` · `.lt-faixa` · `ul.lt-legenda` (forma + rótulo, nunca só cor).
- **CSV**: nenhuma.
- **Limites**: 4 a 10 marcos (fora disso divida em duas telas; com 7+ os textos descem um degrau) · título e sub em 1 linha (sub com 2 em uma-linha) · `.lt-versao` uma linha, até 9 caracteres (até 6 marcos) ou 8 (7 a 10) · `.lt-rotulo` até 3 linhas em uma-linha (~22 caracteres/linha com 6 marcos; ~14 com 10); em duas-linhas só a release stable tem rótulo (até 2 linhas; o hotfix leva texto só para leitor de tela) · `.lt-chamada` até 2 linhas (~60 caracteres), no máximo 2 por tela e nunca em marcos vizinhos · período em uma linha.
- **Regras**: número/data real na linha do tempo leva `<p class="fonte">`.

### ciclo
- **Serve para**: o ritmo de uma volta de N semanas em dois períodos (ciclo · cooldown), com o laço "volta ao início": mostra **quanto dura** cada período e que o ritmo **se repete**, com números grandes, uma barra de semanas numeradas e a seta de retorno. É repertório: vem antes de qualquer pergunta. Sem JS e sem CSV. Estilos em `39-ciclo.css`, escopados em `.slide[data-layout="ciclo"]`. Usado em `a6-diagrama` (ShapeUp: 6 semanas de ciclo e 2 de cooldown).
- **Atributos**: sem variantes. `data-de` e `data-n` em cada faixa (`data-de` = coluna inicial; `data-n` = quantas semanas cobre, de 1 a 9): a soma dos `data-n` é o nº de `<li>` de `.ciclo-semanas` e a 1ª faixa começa em 1. O nº de colunas nasce de `:has()` contando as semanas.
- **Classes-chave**: `.cab` (kicker · `h2` cujo `<em>` é o 2º período, pintado na cor do cooldown · `.sub`) · `.ciclo-quadro` > `.ciclo-faixas` (2 × `div.ciclo-faixa.ciclo-faixa--ciclo|--cooldown`, cada uma com `b.num.ciclo-num`, e `p.ciclo-faixa-txt` com `.ciclo-faixa-rot` = ícone + rótulo e `.ciclo-un` = "semanas") · `ol.ciclo-semanas` > `li.ciclo-sem--ciclo|--cooldown` (`.ciclo-sem-rot` "Semana" · `.ciclo-sem-num` · `sr-only` com o nome do período) · `.ciclo-volta` (laço de retorno desenhado por CSS, com `p.ciclo-volta-rot`) · `ul.ciclo-legenda` (`.ciclo-amostra--cooldown|--volta`: forma + rótulo).
- **Daltonismo**: ciclo = bloco **cheio** laranja, borda contínua, ícone play; cooldown = bloco **listrado** azul-água, borda tracejada, cantos mais redondos, ícone pause; rótulo em texto em toda faixa e na legenda. Nunca só cor.
- **CSV**: nenhuma. Entradas `.anim d1…d7` (cabeçalho d1–d3; quadro d4; legenda d5).
- **Limites**: **4 a 10 semanas** (fora disso, divida em duas telas) · título e sub em 1 linha (sub até ~60 caracteres) · número da faixa com 1 ou 2 algarismos e unidade de uma palavra ("semanas") · rótulo da faixa até ~12 caracteres (com mais de 8 semanas a faixa curta fica estreita: confira) · rótulo da semana: uma palavra curta + nº de 1 a 2 algarismos · frase do laço até ~36 caracteres, 1 linha · legenda de 2 a 3 itens de 1 linha.
- **Regras**: o nº de semanas e as durações declarados vêm do briefing; **não descreva etapas internas de nenhum método** neste layout (`a6-diagrama` mostra só 6 + 2 e o laço "Novo ciclo: volta à semana 1"); texto-modelo neutro no catálogo.

### opcoes
- **Serve para**: repertório pronto — 2 a 4 opções lado a lado para comparar **antes** de decidir. Vem sempre antes de `proposta`; nenhuma opção vem marcada como recomendada.
- **Atributos**: `data-n="2|3|4"` (nº de cartões; define o tamanho do corpo: 30 px em 2, 26 px em 3 e 4).
- **Classes-chave**: `.opcoes-grade` (subgrid) > `article.card.opcoes-card` (`.opcoes-topo` com `.opcoes-letra` e `.opcoes-desc` · `.opcoes-bloco--pros` / `--contras` com `.lista--pros`/`--contras` · `.opcoes-quando` obrigatório · `.opcoes-custo` opcional) · `.opcoes-leitura` (rodapé opcional).
- **CSV**: nenhuma.
- **Limites**: n=2: até 3 prós e 3 contras lado a lado (itens de até 2 linhas, ~40 caracteres), "quando faz sentido" até 2 linhas (~70), custo 1 linha (~30) · n=3: até 3 cada, empilhados, itens de 1 linha (~30) · n=4: até 2 cada, "quando" até 3 linhas (~55), sem custo · nome da opção até ~20 caracteres (n=3/4) ou ~34 (n=2); descrição 1 linha (n=2/3) ou 2 (n=4) · mais de 4 opções: duas telas · não repetir itens entre prós e contras.

### matriz
- **Serve para**: tabela de dupla entrada, com LINHAS (quem ou o quê) × COLUNAS (o que se recebe, usa ou mantém) e um **estado** em cada célula: mostra de uma vez "quem tem o quê". É repertório: vem antes de qualquer pergunta. Sem JS e sem CSV (o HTML já é o dado). Estilos em `41-matriz.css`, escopados em `.slide[data-layout="matriz"]`. Usado em `a7-matriz` (GitHub e Claude por usuário · conta de Inovação e conta de Desenvolvimento · cada usuário, time de Inovação e máquina da Pipeline).
- **Atributos**: sem variantes. A tabela vai dentro de `div.anim[data-sangra]` (**`data-sangra` é obrigatório**: a tabela tem margem negativa de 12 px para que as bordas das células alinhem com o título). Estado em `data-estado` do `td.matriz-celula`: **`sim`** (check no selo verde, borda contínua, rótulo com o **verbo**: "Recebe", "Usa", "Fica logada", até ~14 caracteres) · **`nao`** (x no selo vazado, borda tracejada, "Não recebe") · **`nd`** (traço desenhado em `span.matriz-traco[aria-hidden]`, borda pontilhada, **sem rótulo visível**: o texto "não informado" fica em `sr-only`). A cor nunca é a única pista.
- **Classes-chave**: `caption.sr-only` (obrigatória) · `colgroup` (`col.matriz-col-linha` + 1 `<col>` por coluna) · `thead` (linha 1 opcional: `td.matriz-canto[rowspan=2]` e 1 a 2 `th.matriz-grupo[scope=colgroup][colspan]`, `--destaque` com filete e rótulo laranja; linha 2: `th.matriz-col[scope=col]` = `.matriz-col-nome` + `.matriz-col-nota` opcional) · `tbody` > `th.matriz-linha[scope=row]` (`.matriz-linha-txt` = ícone + nome) + `td.matriz-celula` > `.matriz-conteudo` (`.matriz-ico` + `.matriz-rotulo`) · `ul.matriz-legenda` (obrigatória: um item por estado usado, forma + rótulo).
- **CSV**: nenhuma. Entradas `.anim d1…d5` (cabeçalho d1–d3; tabela d4; legenda d5).
- **Limites**: **1 a 5 linhas × 1 a 5 colunas** (a altura da célula se ajusta ao nº de linhas: até 3 linhas 124 px · 4 linhas 104 px · 5 linhas 84 px, com o selo proporcional; é altura de **linha**, não de fonte) · com 4 linhas o `.sub` tem até 1 linha, com 5 linhas não há `.sub` · título e `.sub` em 1 linha · nome de linha e de coluna até ~24 caracteres (2 linhas) · nota de coluna até ~18 (1 linha) · célula: ícone + rótulo de 1 linha a 26 px · grupo de colunas: até 2, com rótulo curto.
- **Regras**: a tabela **só afirma o que a fonte afirma; o resto é `nd`**, nunca palpite; sem número, preço ou nome de pessoa nas células; sem destaque por hover ou foco (tela projetada, sem interação); mantenha os 3 estados. No `a7-matriz` os traços `nd` marcam o que o briefing não informa (README, *Checklist pré-evento*, item 12, alíneas b e c).

### proposta
- **Serve para**: a "proposta na mesa" — toda decisão chega pronta para **aceitar**, **ajustar** ou **recusar**. Vem depois do repertório; nenhuma decisão aparece marcada de fábrica (o estado vive no CSV).
- **Atributos**: `data-assunto` (obrigatório) · `data-tabela="propostas"` · `data-sala="N"` (opcional: mostra "0 de N" e avisa se as mãos passarem de N; `12` no modelo é valor-modelo). O `id` da `<section>` é a chave da linha no CSV.
- **Classes-chave**: `h2.proposta-enunciado` · `.proposta-muda` ("O que muda", 2 a 4 itens) · `.proposta-custa` (**obrigatório**, `dl.proposta-custa-lista` com 4 linhas fixas: Tempo · Esforço · Risco · Abre mão de) · `.proposta-barra` (`.proposta-estado` `.proposta-aviso` `.proposta-aviso-maioria`) · `.proposta-acao[data-acao="aceitar|ajustar|recusar"]` (`.proposta-botao[aria-pressed]` + `.proposta-tecla` + `.proposta-maos` − / n / +) · `.proposta-ajuste` (`.proposta-ajuste-texto`) · `.proposta-total`.
- **CSV**: `propostas` — **uma linha por tela** (upsert), criada na 1ª interação. `decisao` alterna ao clicar ou teclar `1`/`2`/`3` (repetir desmarca); mãos 0–99 por ação; "Ajuste acordado" é texto livre (a linha-exemplo cinza nunca vai ao CSV). Avisos discretos, nunca bloqueiam: mais mãos que pessoas (com `data-sala`) e decisão que diverge da maioria das mãos (empate não avisa). `SUMMIT.propostas.dados()` devolve as linhas.
- **Limites**: enunciado no máximo 2 linhas a 56 px (~110 caracteres) · "O que muda" 2 a 4 itens de 1 linha (~44) · "O que custa" 4 linhas de 1 linha (~36; escreva "nenhum", nunca apague a linha) · a tela aguenta **uma** linha extra no conjunto · "Ajuste acordado": 2 linhas (~140 caracteres; medido em 1920×1080: 140 cabe, 160 já passa de 2 linhas) — o campo aceita 400, mas acima disso o texto rola por dentro, não aparece inteiro na projeção e a auditoria acusa `recortado` (só com dado: o `capturar` não vê) · sem nome de pessoa no enunciado (responsáveis e prazos vão para Compromissos; **exceção hoje**: o enunciado e o "O que muda" de `a5-proposta` citam o Tech Lead pelo nome, ligado ao papel e sem métrica: README, *Checklist pré-evento*, item 13) · uma tela por decisão. Quando o briefing não dá o dado de "O que custa": Tempo "Prazo definido ainda hoje." · Esforço = a ação do assunto · Risco "Nenhum levantado: a sala aponta antes de votar." · Abre mão de "A definir com a sala." (seção 6).

### dinamica
- **Serve para**: conduzir uma atividade cronometrada inteira na tela projetada — objetivo, passos com tempo e formato, "pronto quando" e condução. É a tela 2 de cada assunto.
- **Atributos**: `data-min` da seção = minutos do bloco; a **soma** dos `.passo[data-min]` tem de ser igual (o `montar.py` reprova; o JS mostra `Σ soma de alvo min` com check ou alerta "a conta não fecha: faltam/sobram N min"). Escritos só pelo JS: `data-estado="feito|em-curso"` e `data-pausa` no passo; `data-ajuste-passo` e `data-ajuste-apoio` na tela (degraus de fonte). Não aninhe `<section>`.
- **Classes-chave**: `.dinamica-cab-topo` `.dinamica-dica` `.dinamica-desfazer` · `.dinamica-objetivo` `.dinamica-frase` · `.dinamica-colunas` (`.dinamica-esq`: `.dinamica-resumo` `.dinamica-total` `.dinamica-barra` `ol.dinamica-passos` > `li.passo` > `button.passo-ac` (`.passo-num` `.passo-txt` `.passo-nome` `.passo-detalhe` `.chip--individual|--subgrupos|--plenaria` `.passo-tempo`) · `.dinamica-dir`: `.dinamica-pronto` `.dinamica-criterios` · `.dinamica-conducao` `.dinamica-etapas` com Abrir · Se travar · Fechar).
- **CSV**: `progresso` — uma linha por passo com estado (`slide` = id da seção · `passo` 1..n · `estado`); desmarcar remove a linha. Clicar ou teclar `1`–`9` inicia o passo (cronômetro no tempo dele) e o anterior vira "feito"; no passo já em curso só pausa/retoma; `Shift` conclui; **Desfazer** volta a última mudança; o mesmo passo acionado de novo em menos de 0,6 s conta como uma ação. Após F5 o passo "em curso" volta como "em curso (pausado)" com o tempo do passo.
- **Limites**: objetivo UMA frase (~85 caracteres em 1 linha) · 3 a 6 passos; nome até ~28 caracteres (2 linhas só com até 4 passos); `.passo-detalhe` só com até 5 passos, 1 linha (~30) — com 6 omita · "Pronto quando": 2 a 4 critérios objetivos de até ~48 caracteres · Abrir e Fechar até 2 linhas (~80) · Se travar: 2 a 3 alavancas de 1 linha (~42; com 4 critérios, 2 alavancas) · fontes: passo 30 px, apoio 26 px, pisos 28 e 24 px.
- **Regras**: a plenária decide a espinha, os subgrupos detalham; **sempre** reserve passo de repertório e passo de votação ("propostas na mesa"); a soma dos passos é exatamente o tempo do bloco.

### quadro
- **Serve para**: tabela editável ao vivo, **ligada a uma tabela CSV** — a sala decide, o facilitador digita na tela projetada. Duas variantes-modelo: **compromissos** (`decisoes`: Ação · Responsável · Prazo · Status; telas `a1-`, `a2-`, `a3-`, `a4-`, `a5-` e `a7-compromissos`) e **anotações** (`anotacoes`: Anotação · Tipo · Votos; telas `a2-anotacoes`, `a4-anotacoes`, `a5-anotacoes` e `a6-anotacoes`).
- **Atributos da seção**: `data-tabela` (**obrigatório**) · `data-assunto` (**obrigatório**: o quadro mostra, cria e limpa só as linhas desse assunto) · `data-referencia="AAAA-MM-DD"` (data do evento: base do "D+N" do prazo) · `data-ordenar="<campo>"` (liga "Ordenar por votos": só a ordem na tela, nunca a do CSV) · `data-exemplo` · `data-vazio`. **Colunas**: um `<th scope="col" data-campo="…">` por coluna do CSV (o `montar.py` reprova campo que não exista na tabela), com `data-tipo="texto|data|opcoes|contador"`, `data-dica`, `data-exemplo`, `data-largura="estreita"`, `data-opcoes`/`data-rotulos`/`data-compacto`/`data-padrao` (opções) e `th.quadro-col-num` / `th.quadro-col-acoes`.
- **Classes-chave**: `.quadro` > `.quadro-rolagem` > `table.quadro-tabela` (`tbody` **nasce vazio**; linhas, exemplo e convite são gerados) · `.quadro-sobre` (gerado: "+N linhas abaixo", "Desfazer") · `footer.quadro-rodape` (`.quadro-contador` `.quadro-gravacao` `.quadro-dica` `.quadro-btn`).
- **CSV**: `decisoes` (compromissos) ou `anotacoes`. Texto grava ~0,35 s depois de digitar e ao sair do campo. **Prazo**: dia/mês/ano (ISO no CSV) com "D+N", dia da semana e aviso de fim de semana ou **feriado nacional** (2026–2027, lista em `SUMMIT.quadro.FERIADOS`; o aviso não bloqueia). **Limpar quadro**: 1º toque arma (4 s), 2º apaga só as linhas do assunto. Remover linha e Limpar: "… removida(s) · **Desfazer**" por 6 s. Contador (`votos`): inteiro 0–999, um toque = uma gravação. Linha em branco é descartada ao sair dela.
- **Limites**: cabem 8 linhas de 1 linha sem rolar (sub de até 2 linhas); acima disso a densidade cai (64→56 px de linha, 26→24 px de texto) e aparece "+N linhas abaixo" · ação/anotação até ~80 caracteres por linha (quebra sozinha) · responsável ~24 caracteres · sub até ~100 caracteres por linha · texto colado é cortado em 300 caracteres.
- **Regras**: o responsável nasce em branco (cabeçalho "Responsável", nunca "Owner"); linha-exemplo e placeholders neutros; a linha-exemplo nunca é dado.

### brainstorm
- **Serve para**: tabela de brainstorming projetada, preenchida ao vivo pelo facilitador — cada ouvinte fala N práticas boas e N a melhorar; a tela `nuvem` lê os mesmos dados.
- **Atributos**: `data-rodada="1"` (grava na coluna `rodada` e mostra só as linhas dela; padrão `1`; **obrigatório** para o `montar.py`) · `data-meta="3"` (apontamentos esperados por pessoa e por tipo; padrão 3) · `data-tabela="brainstorming"` (informativo: a tabela é sempre `brainstorming`). Uma tela por rodada: duplique a `<section>` com outro `id` e outro `data-rodada`. Ganchos do JS (não digite): `[data-brainstorm-rodada]` `[data-brainstorm-meta]` `[data-brainstorm-resumo]`. Modo Ver todos escreve `data-todos` na seção; a densidade escreve `data-densidade="0…4"` em `.brainstorm-colunas`.
- **Classes-chave**: `.brainstorm-topo` (`.brainstorm-instrucao`) · `.brainstorm-progresso` > `.brainstorm-chips` > `.brainstorm-pessoa` (botão; só nome + estado: check = completo, anel vazio = em andamento — **nunca número por pessoa**) · `.brainstorm-colunas` > `.brainstorm-col[data-tipo="bom|melhorar"]` (`.brainstorm-lista`, `.brainstorm-item`, `.brainstorm-item--exemplo`, `.brainstorm-mais`) · `form.brainstorm-entrada` (participante com datalist · Bom/Melhorar · apontamento · criticidade 1–3 só em Melhorar).
- **CSV**: `brainstorming`. `bom` grava `criticidade` vazia; `melhorar`, 1–3 (padrão 2). Dados limpos para a nuvem: espaços colapsados, sem quebra de linha, texto até 160 caracteres, participante reaproveita a grafia já gravada ("joao" vira "João" se "João" já falou). Clicar num item abre edição inline (Enter salva, Esc cancela; **Remover** pede 2 cliques). Re-renderiza quando o CSV muda, sem tirar o foco de quem digita. O placeholder do participante é "Pessoa (sigla)" — o nome completo fica projetado para a sala.
- **Limites**: título (`h2`) até ~30 caracteres em 1 linha · nome de participante até ~14 caracteres (acima: reticências, nome completo no `title`) · apontamento de 1 a 2 linhas · **densidade adaptativa** (1 coluna → 2 → 3 só em Ver todos; texto de 26 a 22 px, nunca menos) e o excedente rola com "+N mais abaixo" · chips: 3 linhas visíveis (~30 participantes); acima de 8 participantes ficam compactos · 45 itens por coluna cabem em Ver todos com texto curto (~35 caracteres).
- **Cores**: bom = `--bom` (azul), melhorar = `--melhorar` (vermelho), sempre com ícone (check/alerta) e rótulo.

### nuvem
- **Serve para**: mostrar à sala, de uma vez, o que fazemos bem (**azul**) e o que podemos melhorar (**vermelho**); tamanho e destaque dizem "quanto apareceu" e "quão crítico é". Vem depois do `brainstorm` e é onde a sala **vota a criticidade**.
- **Atributos**: `data-rodada="1"` (filtra a coluna `rodada`; ausente ou `todas` = todas; **obrigatório** para o `montar.py`, que também exige um `brainstorm` da mesma rodada e da mesma tabela) · `data-tabela="brainstorming"`. Gerados pelo JS: `.nuvem-termo[data-lado="bom|melhorar"][data-nivel="0|1|2|3"]`.
- **Classes-chave**: `.nuvem-topo` (`.nuvem-stats` `.nuvem-alterna` Palavras | Frases) · `.nuvem-area` (`.nuvem-termos[role=list]` `.nuvem-vazio` `.nuvem-dica` `.nuvem-medida`) · `.nuvem-legenda` · `.nuvem-rank` > `.nuvem-rank-lista[data-lado]` > `li.nuvem-rank-item` (`.nuvem-rank-termo` `.nuvem-rank-meta`; vermelhos trazem `.nuvem-crit` com 3 `.nuvem-crit-btn[data-valor]`) · `.nuvem-rank-escala`.
- **CSV**: lê `brainstorming`; o **único ponto de escrita** é o controle 1·2·3, que aplica a criticidade a **todos** os apontamentos `melhorar` que contêm o termo (no modo Frases, à frase) via `tabela.atualizar`; a nuvem se redesenha na hora. Botão marcado = todas as ocorrências têm o valor; nenhum marcado = valores mistos.
- **Regras de cálculo** (as mesmas impressas na legenda): peso = soma das citações (1 por apontamento); `bom` ×1; `melhorar` pela criticidade 1→×1 · 2→×2 · 3→×4 · tamanho = raiz do peso entre 24 px e um teto (150 px em palavras, 72 px em frases; o teto só desce — 150…64 — quando há termos demais) · vermelho sublinhado; criticidade média 2–3 ganha peso 700, traço grosso, brilho e barras · a mesma palavra nos dois lados vira duas entradas · siglas de 2 letras (CI, QA…) e termos como `.NET`, `C#` sobrevivem; stopwords caem; plurais agrupam; até 150 termos, posição determinística (mesmos dados, mesma nuvem).
- **Limites**: título até ~36 caracteres em 1 linha (2 linhas comprimem nuvem e ranking sem estourar) · ranking de 5 + 5 termos (cai para 3 + 3 em tela baixa; nunca rola) · na prática cabem ~12 termos de 87–150 px com poucos apontamentos e ~30–48 de 24–80 px com dezenas; o rodapé informa "Na nuvem: X de Y termos" · frases com mais de 90 caracteres são abreviadas com "…" (texto completo no `aria-label`).

### pausa
- **Serve para**: intervalo (café ou almoço) — "Voltamos às HH:MM" enorme e contagem regressiva ao vivo.
- **Atributos**: `data-volta="HH:MM"` (horário de retorno; sem ele usa `data-bloco-ini` + `data-bloco-min`) · `data-variante="cafe|almoco"` (ícone; o cronograma herda) · `data-lado="off"` (sem a coluna da direita, hero centralizado) · metadados do bloco com `data-bloco-tipo="pausa"`. Escrito pelo JS: `data-estado="contando|final|acabou"` (final = último minuto). Relógio: `SUMMIT.agoraFn()` (padrão `new Date()`; substituível em testes).
- **Classes-chave**: `.pausa-palco` > `.pausa-hero` (`.pausa-topo` `h2.pausa-titulo` `em.pausa-hora` `.pausa-contagem[role=timer]` `.pausa-tempo`) · `aside.pausa-lado` ("Na volta" e um segundo card: "Antes de sair" com lembretes nos modelos, ou "Depois" com o assunto seguinte na tela `almoco-pausa`). No deck: `intervalo-pausa` (`cafe`, volta 11:10, 10 min) e `almoco-pausa` (`almoco`, volta 14:00, 120 min; "Na volta" = Assunto 3 · Operação Inovação, "Depois" = Assunto 4). A contagem usa o **relógio do notebook** (confira data e hora antes do evento; em teste, `SUMMIT.agoraFn`).
- **CSV**: nenhuma (conta só com a tela ativa e não grava estado). Ao zerar mostra "Hora de voltar" e permanece.
- **Limites**: "Na volta" 1 título + até 2 linhas · "Antes de sair" 1 a 2 lembretes de até 2 linhas (o card "Depois" do almoço leva 1 frase) · sem JS a contagem mostra `--:--`. A contagem de 120 min do almoço passa de 1 hora: o formato vira `h:mm:ss` (ex.: `1:59:59`).

### encerramento
- **Serve para**: fecho do evento — marca e contato, mais uma de duas leituras: **padrão** (mensagem final e próximos passos com dono e prazo a preencher; só no catálogo) ou **resumo** (a do deck de 02/10, usada **duas vezes**: Fechamento da manhã às 11:55 e Fechamento do dia às 16:55; **relê os CSV ao vivo** e mostra o que foi decidido e o que ainda falta). Só leitura: o resumo nunca grava.
- **Atributos**: `data-bloco` do último bloco (`final` no modelo; `fechamento` e `fechamento-dia` no deck real, com os `data-bloco-*` na própria tela: 11:55 e 16:55 · 5 min · apres 0 + def 5) · `data-variante="resumo"` (sem ele, a padrão) · só no resumo: `data-referencia="AAAA-MM-DD"` (base do "D+N" do prazo, como no quadro) · `data-proposta="<id da tela proposta>"` (**opcional**) · `data-assunto-sugestoes="<assunto>"` (opcional; anotações lidas) ou `"todos"` (agrega as anotações de **todos** os assuntos de blocos anteriores; card "Dúvidas e sugestões do dia", 3 mais votadas com o assunto de cada uma). **Com `data-proposta`** a tela lê só aquela linha de `propostas` (modo **único**: card com veredito grande, mãos e ajuste; é o do Fechamento das 11:55, `a1-proposta`). **Sem `data-proposta`** ela lista **todas** as telas de layout `proposta` de blocos **anteriores** ao dela, na ordem do deck (modo **lista**: uma linha por proposta, com selo, nome do bloco, veredito, mãos e ajuste; é o do Fechamento do dia, hoje 5 propostas: Versionamento · Operação Inovação · Ocorrências · Review dos PRs · Ferramentas e IA). A descoberta é automática: proposta nova no deck entra sozinha. Escritos pelo JS: `data-modo` (`unico|lista|nenhum`) no card das decisões e na coluna esquerda · `data-estado` (`aceitar|ajustar|recusar|vazio` no modo único e em cada linha da lista; `completo|pendente` na lista; `ok|pendente` nas conferências e no contador) · `data-densidade` na lista (`sem-maos`, `minima`) e `data-itens` (2|1) no card das sugestões (degraus da coluna esquerda quando 5 propostas com mãos e ajuste não cabem: 3 → 2 → 1 sugestão, depois sem mãos, depois sem ajuste) · `data-densidade="compacta"` no card dos compromissos · `data-mais-baixo` e `data-rolagem` na tabela · `data-medindo` (a tela é exibida sem pintar só durante a medida).
- **Classes-chave**: padrão — `.encerramento-fecho` (`.cab` com `h1` serif, `.sub`, `.encerramento-assinatura` com logo e `address`) · `.encerramento-passos` > `ol.encerramento-lista` > `.encerramento-passo` (`.encerramento-acao`, `.encerramento-campos` com dois `.encerramento-traco`: Responsável · Prazo, **em branco**). Resumo — `.encerramento-resumo` > `.encerramento-topo` (`.cab` + `.encerramento-assinatura`: `.encerramento-marca` com logo e `address.encerramento-contato`, `.encerramento-frase`) e `.encerramento-corpo` em 2 colunas: `.encerramento-esq` (`.encerramento-versao`, o card das decisões, que traz os **dois modos** no HTML e o JS escolhe: `.encerramento-topo-card` com `h2.rotulo[data-campo="decisao-rotulo"]` e `p.encerramento-decididas` "N de M com decisão" (só na lista) · modo único `.encerramento-unica` (`.encerramento-veredito` `.encerramento-maos` `.encerramento-ajuste` `.encerramento-dica`) · modo lista `ul.encerramento-props` > `li.encerramento-prop` (`.encerramento-selo` `.encerramento-prop-nome` `.encerramento-prop-veredito` `.encerramento-prop-maos` `.encerramento-prop-ajuste`) · `.encerramento-brain`: `.encerramento-total` `.encerramento-lados` `.encerramento-crit` · `.encerramento-sug`: `.encerramento-sug-lista`) e `.encerramento-dir` (`.encerramento-comp`: `.encerramento-contador` `.encerramento-mais` `.encerramento-tabela` > `table.encerramento-tab` com linhas `.encerramento-grupo` e `.encerramento-linha` · `.encerramento-antes`: `ul.encerramento-checks` > `.encerramento-check[data-check="compromissos|propostas|csv"]`). Ganchos do JS: `[data-campo]`.
- **CSV**: nenhuma é escrita. O resumo **lê** `propostas` (decisão, mãos e ajuste, por proposta), `decisoes` (as linhas dos assuntos de **blocos anteriores** ao bloco da tela, agrupadas por assunto, com o que falta (sem responsável ou prazo) primeiro em cada assunto; Ação · Responsável · Prazo com D+N; `status` ignorado; completo = responsável **e** prazo), `anotacoes` (assunto de `data-assunto-sugestoes`: total e as 3 mais votadas, empate pela ordem de registro; sem votos, as 3 primeiras) e `brainstorming` (só contagens: apontamentos, bem, melhorar e melhorias com criticidade 3 — **nunca** participante nem nada por pessoa), além de `SUMMIT.dados.estado()` para "Dados gravados em CSV" (pasta conectada e nenhuma tabela `sujo`/`conflito`/`falhou`; senão alerta com "tecle D"). Atualiza ao abrir a tela (`summit:slide`), no `summit:pronto` e a cada `tabela.on()`/`SUMMIT.dados.aoMudar()`; guarda uma assinatura por região e só mexe no DOM quando ela muda. Quem assume um compromisso continua registrando na tela de Compromissos (`quadro` → `decisoes.csv`).
- **Escopo da leitura** (conferido em Chrome com dados de ensaio, build `--saida`, em 01/10/2026): a tela só considera propostas e assuntos cujo **bloco vem antes do bloco dela** na ordem do deck. **11:55 (Fechamento)**: `versionamento` (a1) e `pipeline` (a2), as 4 sementes da manhã; as **5 sementes da tarde** (`operacao-inovacao`, `ocorrencias`, `review-dos-prs` e as 2 de `ferramentas-e-ia`) **não** entram na tabela, no contador nem na conferência, de modo que o Fechamento da manhã não cobra os compromissos da tarde; a proposta lida é só a `a1-proposta`; sugestões = `pipeline`. Com o CSV limpo: "0 de 4 compromissos completos", compromissos "Faltam 4", propostas "Sem decisão" e "Antes de sair" em "1 de 3 prontos" (o item ok é o **CSV**: "CSV baixado", sem pasta mas também sem nada por exportar). **16:55 (Fechamento do dia)**: os 6 assuntos com Compromissos (versionamento 2 · pipeline 2 · operacao-inovacao 1 · ocorrencias 1 · review-dos-prs 1 · ferramentas-e-ia 2 = 9 sementes) e as 5 propostas; sugestões = `todos` (as 3 mais votadas de qualquer assunto: Pipeline, Ocorrências, Review dos PRs, ShapeUp). Com o CSV limpo: "0 de 9 compromissos completos", compromissos "Faltam 9", propostas "0 de 5 com decisão" e "Faltam 5" e "1 de 3 prontos". Assim que algo é registrado sem pasta conectada, o CSV vira pendente ("Tecle D: conectar pasta ou Baixar CSV") até a pasta estar conectada e gravada ou o CSV baixado. Com tudo preenchido e decidido e sem pasta conectada: às 11:55 "4 de 4 compromissos completos", proposta "Aceita" e "2 de 3 prontos"; às 16:55 "9 de 9 compromissos completos", propostas "Pronto" e "2 de 3 prontos" (o CSV é o que falta). Um `assunto` que **não casa com nenhum bloco** continua aparecendo (o JS prefere mostrar a pendência a escondê-la). O casamento ignora acento, caixa e hífen ou sublinhado: `operacao-inovacao` casa com "Operação Inovação", `ocorrencias` com "Ocorrências", `review-dos-prs` com "Review dos PRs", `ferramentas-e-ia` com "Ferramentas e IA". Consequência para quem monta o deck: uma tela de resumo posta **depois** de um assunto passa a cobrá-lo.
- **Limites**: padrão — mensagem até ~40 caracteres (3 linhas a 80 px) · recapitulação até 2 linhas · 3 a 5 passos de até ~60 caracteres (com 5, uma linha cada). Resumo — leitura corrente a 26 px (24 px na densidade compacta), rótulos a 22 px e só selos/etiquetas (votos, tipo, "Ajuste") a 20 px; o texto lido é encurtado com "…" até caber (ajuste em 2 linhas no modo único e 1 na lista, sugestão em 1; na tabela: ação em 2 linhas, responsável em 1); lista de propostas: até 5 linhas (nome do bloco em 1 linha, até ~24 caracteres); com muitas mãos e ajustes a coluna esquerda desce de degrau em vez de estourar (piso 22 px; selos e "Ajuste" a 20 px); cabem ~4 compromissos de 2 linhas em uma coluna; com mais de ~6 linhas (assuntos incluídos) a tela passa a **DUAS COLUNAS** de assuntos (`data-comp-colunas`) e os 9 compromissos do dia aparecem de uma vez, sem rolar; grupos com pendência vêm primeiro; acima do que cabe, a densidade fica compacta, a tabela rola por dentro (região focável) e o botão "+N abaixo" mostra o que está fora da vista; 3 sugestões; 3 conferências; na impressão/PDF a tabela mostra todos os compromissos, sem rolagem. Conferido em 01/10/2026 com dados de ensaio nas 5 tabelas (27 compromissos, 5 propostas decididas): `SUMMIT.auditar()` sem problema nas duas telas, a 1920×1080 e 1366×768.
- **Validação (`montar.py`, `validar_encerramentos`, só no resumo)**: `data-proposta`, se presente, igual ao `id` de uma tela de layout `proposta` · `data-referencia` obrigatória, data válida `AAAA-MM-DD` · `data-assunto-sugestoes`, se presente, igual ao `data-assunto` de algum `quadro` com `data-tabela="anotacoes"` (comparação sem acento e sem caixa) ou o valor especial `"todos"`. O escopo por bloco **não** é validado: é resolvido pelo JS na ordem dos blocos.
- **Regras**: contato institucional (site e telefone) é fato da marca; nenhum nome de pessoa, cliente ou prazo inventado na tela. No resumo, responsável e prazo vêm só do CSV e nascem em branco ("a definir" com ícone de alerta, nunca só cor); estados vazios ("Sem decisão" com destaque de atenção, "Nenhum compromisso registrado", "Nenhuma sugestão registrada") nunca quebram a tela; a frase de fechamento não afirma fato novo (da manhã: "Obrigado pela manhã de trabalho."; do dia, a despedida do evento: "Obrigado por participar do 1º Informa DEV Summit.", só no último bloco).
