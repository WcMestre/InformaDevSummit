# 1º Informa DEV Summit · apresentação de facilitação

Site estático (HTML + CSS + JS em arquivos separados) que conduz o 1º Informa DEV Summit, em **02/10/2026**: **47 telas** em **13 blocos** (8 assuntos, do 0 ao 7, mais Abertura, Intervalo, Almoço e dois Fechamentos), das 09:00 às 17:00. **Há um só cronograma do dia, no 2º slide**, gerado dos blocos; os assuntos não têm tela de agenda própria: cada um abre direto pela dinâmica.

- **Manhã (09:00–12:00):** Abertura · Assunto 0 Brainstorming · Assunto 1 Versionamento · Intervalo de 10 min · Assunto 2 Pipeline · **Fechamento** (tela de Encerramento, 11:55).
- **Almoço (12:00–14:00).**
- **Tarde (14:00–17:00):** Assunto 3 Operação Inovação (o funil de hoje × um PO por produto ou frente) · Assunto 4 Ocorrências (o novo fluxo de ocorrências e priorização) · Assunto 5 Review dos PRs (15:30) · Assunto 6 ShapeUp (16:10) · Assunto 7 Ferramentas e IA (16:25) · **Fechamento do dia** (tela de Encerramento, 16:55, até 17:00).

São **5h50 de trabalho efetivo** e **2h10 de pausa** (10 min de intervalo + 2h de almoço).

Toda interação da sala é gravada em **CSV** (`dados/`), que é a base de dados da apresentação. Pode ser publicado no **GitHub Pages**, mas **no dia roda por `file://`** (veja *Privacidade* e *No dia*).

Contrato de conteúdo, dados, teclado e catálogo de layouts: [`docs/PADROES.md`](docs/PADROES.md).

## Requisitos

- **Python 3.9+** para o build (`ferramentas/montar.py`; só biblioteca padrão).
- **Chrome ou Edge** para projetar: só eles deixam conectar a pasta `dados/` e gravar os CSV sozinhos. Em outro navegador o deck funciona, mas os dados só saem por **Baixar CSV**.
- **Node + `npm i`** só para `npm run capturar` (PNG + auditoria). Não é necessário para apresentar.

## Estrutura

```
index.html                 gerado por ferramentas/montar.py — não editar à mão
catalogo.html              gerado — telas-modelo dos 19 layouts (revisão de design)
assets/
  css/                     00-tokens · 10-palco · 20-moldura · 25-dados · 30-componentes · 90-impressao
  css/layouts/             um arquivo por layout, 19 no total  (NN-<layout>.css)
  js/                      10-nucleo · 20-dados · 90-auditoria · 99-iniciar
  js/layouts/              um arquivo por layout com comportamento, 9 no total  (NN-<layout>.js); os outros 10 (capa, conteudo, fluxo, ciclo, matriz…) são só HTML + CSS
  fontes/  img/            fontes woff2 + fontes.css (offline) · logo e ícones SVG
conteudo/
  slides/                  as 47 telas do deck real (fragmentos HTML, 1 <section class="slide"> por arquivo; a ordem é a ordem alfabética dos arquivos)
  modelos/                 uma ou mais telas-modelo por layout (21 arquivos, 39 telas), com o comentário de ANATOMIA (vira catalogo.html)
dados/                     esquema.json + um CSV por tabela: anotacoes · brainstorming · decisoes · progresso · propostas
docs/PADROES.md            contrato: princípios, anatomia de tela, componentes, dados, teclado, padrão de assunto, catálogo de layouts
ferramentas/               montar.py (build + validações) · casca.html (molde do index) · capturar.cjs (PNG + auditoria em Chrome)
.nojekyll · .gitattributes · .editorconfig · .gitignore · package.json
```

## Comandos

Rode da raiz do projeto.

| comando | o que faz |
|---|---|
| `python ferramentas/montar.py` | `conteudo/slides` → **`index.html`** (+ `.nojekyll`). Valida as telas (ids, layouts, conta dos passos, apresentação + definições, agenda, tabelas e colunas dos quadros, nuvem × brainstorm, **diagramas de `fluxo`** — variante, 2 a 5 etapas de 1 a 3 nós nas `colunas`; no `comparativo`, 2 faixas HOJE × NOVO, com NOVO tendo as **mesmas entradas** de HOJE ou, marcado `data-entradas="nenhuma"`, nenhuma, e 2 a 4 POs — e o **resumo do Encerramento**: `data-referencia`, `data-proposta` (opcional: sem ele a tela lista todas as propostas dos blocos anteriores) e `data-assunto-sugestoes`), confere os cabeçalhos de `dados/*.csv` e **cria os CSV que faltam**. Dado de ensaio em `dados/` vira aviso |
| `python ferramentas/montar.py --modelos` | `conteudo/modelos` → **`catalogo.html`** (39 telas-modelo) |
| `python ferramentas/montar.py --final` | modo de entrega: também grava o `index.html`, mas **reprova** sobra de `data-modelo`, marcador `[[...]]`, agenda quebrada (lacuna ou sobreposição entre blocos) e **dado de ensaio em `dados/*.csv`** (veja *Ensaio × evento*). Não combina com `--so`, `--modelos` nem `--arquivos` |
| `python ferramentas/montar.py --verificar` | **não grava nada**: monta em memória e compara com `index.html` e `catalogo.html`; sai com código 1 se algum estiver defasado. Aceita `--final` |
| `python ferramentas/montar.py --saida <arquivo>` | grava em outro caminho (teste; sem CSP, não cria `dados/*.csv`, não toca no `index.html`). `--so a,b` (só os CSS/JS dos layouts `a`, `b`, além do núcleo) e `--arquivos '2*,30-*'` (só esses arquivos de slide) servem para trabalho isolado |
| `npm i` · `npm run capturar` | abre o `index.html` no Chrome/Edge real e salva em `capturas/` (ignorada pelo git) um PNG por tela em 1920×1080 e 1366×768, `auditoria-<WxH>.json` (legibilidade, contraste, estouro de área) e, no console, o resumo com `comProblema` e as violações de CSP. Usa o Chrome/Edge de `C:\Program Files…`; em outro caminho ou sistema: `npm run capturar -- --chrome "<caminho>"`. Outras opções: `--telas 1,4,7` · `--pdf` · `--html <arquivo>` · `--out <pasta>`. **Atenção: o `capturar` audita com os CSV limpos (só a semente do build).** Telas que dependem de dado (Encerramento, nuvem, quadros, proposta) só mostram o pior caso com dado de ensaio: veja o item 3 do *Checklist pré-evento* (há um trecho pronto para colar no console) |
| `npm run servir` (ou `python -m http.server 8080`) | serve a raiz em `http://localhost:8080` para ver como no Pages |

Atalhos npm equivalentes: `npm run montar` · `montar:catalogo` · `montar:final` · `verificar`.
Editou qualquer arquivo de `conteudo/` ou `assets/`? Rode `montar.py` de novo — o `index.html` referencia os assets com `?v=<hash>`, então o navegador nunca serve versão velha.

## Dados em CSV

Toda tela interativa lê e grava por `SUMMIT.dados.tabela('nome')`. Formato: UTF-8 com BOM, separador `;` (abre no Excel pt-BR), CRLF. Todas as tabelas têm `id` (1ª coluna) e `atualizado_em` (última); contrato completo em `docs/PADROES.md` §5.9. Colunas de negócio de hoje (de `dados/esquema.json`):

| tabela | colunas | quem grava |
|---|---|---|
| `brainstorming` | `rodada` · `participante` · `tipo` · `texto` · `criticidade` | Assunto 0: tela de brainstorm; a nuvem só ajusta `criticidade` |
| `anotacoes` | `assunto` · `tipo` · `texto` · `votos` | quadros de anotações (Assuntos 2, 4, 5 e 6); `votos` = mãos levantadas |
| `propostas` | `assunto` · `proposta` · `enunciado` · `decisao` · `votos_aceitar` · `votos_ajustar` · `votos_recusar` · `ajuste` | telas de proposta (Assuntos 1, 3, 4, 5 e 7) |
| `decisoes` | `assunto` · `item` · `responsavel` · `prazo` · `status` · `observacao` | quadros de Compromissos (Assuntos 1 a 5 e 7; o 6 não tem) |
| `progresso` | `slide` · `passo` · `estado` | telas de condução (um passo por linha) |

`decisoes` nasce com **9 linhas-semente** (responsável e prazo em branco, status `aberto`): `seed-a1-pipeline` e `seed-a1-repositorio` (assunto `versionamento`), `seed-a2-dotnet` e `seed-a2-limpeza` (`pipeline`), `seed-a3-fluxo` (`operacao-inovacao`), `seed-a4-fluxo` (`ocorrencias`), `seed-a5-review` (`review-dos-prs`) e `seed-a7-acessos` e `seed-a7-pipeline` (`ferramentas-e-ia`). As outras quatro tabelas nascem **vazias**.

O navegador **não grava no servidor**; ele grava (a) na **cópia local** do navegador, sempre, e (b) no **arquivo CSV da pasta conectada**, quando houver.

### No dia — fluxo de dados

1. Abra `index.html#/1` no **Chrome/Edge do notebook que vai projetar** (duplo clique no arquivo, endereço `file:///…/index.html#/1`). O Pages fica como plano B.
2. Tecle **D** (na capa a moldura está oculta, mas o atalho funciona) → **Conectar pasta dados/**: escolha a pasta `dados/` **do projeto** e aceite o pedido de "editar arquivos". O Chrome pode recusar pastas de sistema (Documentos, Desktop): escolha a subpasta do projeto.
3. Confira o **chip** no canto superior direito: deve ficar verde, `CSV · gravado em dados/`. A partir daí cada interação grava sozinha (~0,5 s depois).
4. Durante o evento, **uma aba só**. Não recarregue sem ver o chip verde.
5. Olhe o chip de vez em quando:

| chip | o que fazer |
|---|---|
| `CSV · gravado em dados/` (verde) | nada |
| `CSV · salvando…` | aguardar um instante |
| `CSV · sem pasta (tecle D)` | D › Conectar pasta dados/ |
| `CSV · reconectar pasta (D)` | o Chrome pediu a permissão de novo (reinício): D › **Reautorizar pasta** *antes* de registrar; o que já foi digitado é **mesclado**, não perdido |
| `CSV · conflito (D)` | o arquivo da pasta difere da tela; nada é gravado até resolver: D › **Mesclar** (recomendado: junta os dois lados pelo id, sem duplicar, vale o mais recente; o CSV não guarda exclusões, então uma linha removida na tela pode reaparecer se ainda estiver no arquivo — remova-a de novo). *Usar arquivo* descarta a tela; *Manter local* sobrescreve o arquivo |
| `CSV · falha ao gravar (D)` | depois de 3 tentativas automáticas: feche o CSV se estiver aberto no Excel e D › **Gravar agora** |
| `CSV · difere do repo (D)` | a cópia do navegador é diferente do repositório (CSV baixado e sem commit, ou o repositório mudou). Seus dados estão guardados: *Manter local* ou *Usar repositório* quando puder |
| `CSV · só download (D)` | navegador sem acesso a pastas: use **Baixar** |
| `CSV · navegador não guarda (D)` | janela anônima ou armazenamento bloqueado: use uma janela normal |

6. **Baixar / importar** (painel D): *Baixar* exporta uma tabela (ou *Baixar todos os CSV*); *Importar* **substitui** os dados da tabela por um CSV — só aceita UTF-8 com cabeçalho idêntico ao esperado; arquivo inválido não altera nada e a mensagem diz o motivo.
7. **Zerar dados (novo evento)** (painel D, toque duplo): apaga a cópia local e a posição do deck, volta as tabelas à base embutida no build e, com pasta conectada, **regrava os CSV**. Veja *Ensaio × evento* antes de usar.

Proteções embutidas: a cópia local **sempre volta** no F5; o CSV do servidor nunca atropela a pasta; células que começam com `= + - @` ganham um apóstrofo no CSV (injeção de fórmula no Excel) e o perdem ao ler; o navegador avisa antes de fechar a aba com dado que ainda não está em arquivo.

### Roteiro do dia (grade vigente, conferida em 01/10/2026)

O deck é um só, aberto numa aba só, **do começo ao fim do dia**: das 09:00 às 17:00 são 5h50 de trabalho efetivo e 2h10 de pausa (10 min de intervalo + 2h de almoço). Horários e tempos saem dos metadados dos blocos (`docs/PADROES.md` §6); o nº da tela é a posição no deck hoje (`G` + nº + `Enter`) e o endereço `index.html#<id>` funciona mesmo que entre uma tela nova. **O cronograma do dia é o 2º slide** (versão simples: horário · assunto · minutos); ele **não** tem uma tela por assunto. Cada assunto abre pela **dinâmica** (objetivo, passos com tempo e formato, "pronto quando", condução), que é a "tela de entrada" da tabela.

| horário | bloco | tela de entrada | observação |
|---|---|---|---|
| 09:00 | Abertura (15 min) | 1 · `abertura-capa` | 2 telas: a capa e o **cronograma do dia** (2 · `abertura-cronograma`: 13 linhas em duas colunas, manhã e tarde, com o almoço ao centro; gerado dos blocos) |
| 09:15 | Assunto 0 · Brainstorming (60) | 3 · `a0-dinamica` | siglas no campo participante; a nuvem fecha o assunto |
| 10:15 | Assunto 1 · Versionamento (45) | 7 · `a1-dinamica` | proposta e Compromissos gravam em `propostas` e `decisoes` |
| 11:00 | Intervalo (10) | 13 · `intervalo-pausa` | contagem até 11:10 pelo relógio do notebook |
| 11:10 | Assunto 2 · Pipeline (45) | 14 · `a2-dinamica` | anotações com votos e Compromissos |
| 11:55 | Fechamento (5) | 19 · `fechamento-encerramento` | tela de **Encerramento** (resumo da manhã): relê os CSV ao vivo, não grava (veja abaixo) |
| 12:00 | Almoço (120) | 20 · `almoco-pausa` | contagem até 14:00; mantenha a aba e o chip verde |
| 14:00 | Assunto 3 · Operação Inovação (40: 15 apresentação + 25 definições) | 21 · `a3-dinamica` | diagrama do funil de hoje × POs, tela dos POs, proposta e Compromissos |
| 14:40 | Assunto 4 · Ocorrências (50: 15 + 35) | 26 · `a4-dinamica` | o assunto é o "Novo fluxo de ocorrências e priorização" (é assim que o almoço o anuncia); diagrama do fluxo, quem faz o quê, anotações, proposta e Compromissos |
| 15:30 | Assunto 5 · Review dos PRs (40: 15 + 25) | 32 · `a5-dinamica` | o assunto é o novo fluxo de review dos PRs; diagrama da issue à decisão sobre o PR, quem responde pelo quê (Tech Lead e POs), anotações, proposta e Compromissos |
| 16:10 | Assunto 6 · ShapeUp (15: 10 + 5) | 38 · `a6-dinamica` | diagrama do ciclo (6 semanas + 2 de cooldown), reforço e anotações de dúvidas; **sem proposta e sem Compromissos** |
| 16:25 | Assunto 7 · Ferramentas e IA (30: 10 + 20) | 42 · `a7-dinamica` | quadro de quem recebe o quê, as 2 contas atuais, proposta e Compromissos (2 sementes) |
| 16:55 | Fechamento do dia (5) | 47 · `fechamento-dia-encerramento` | tela de **Encerramento** (resumo do dia): última tela do deck; fim às 17:00 |

**Incluir um assunto novo no cronograma.** Não se cria tela de cronograma: basta que a **primeira tela do assunto** (a dinâmica) traga `data-bloco="aN"` e `data-bloco-nome`, `data-bloco-curto`, `data-bloco-ini` (`HH:MM`) e `data-bloco-min` (mais `data-bloco-apres` e `data-bloco-def`, se quiser a divisão; a soma tem de dar `data-bloco-min`, e os passos da dinâmica também). O slide 2 se gera sozinho, na ordem do deck. Cada bloco declara o próprio início: ao encaixar o assunto, acerte o início dos seguintes (o `montar.py` avisa lacuna ou sobreposição; `--final` reprova). Contrato completo: `docs/PADROES.md` §6 (*Como inserir um assunto novo*).

**Fechamento (11:55).** Antes de chegar nele, confira o chip verde: a tela lê os CSV, e "Dados gravados em CSV" é uma das três conferências de *Antes de sair*. Ela mostra a decisão da proposta de versionamento (só `a1-proposta`), os números agregados do brainstorming (nunca por pessoa), as sugestões de pipeline mais votadas e a tabela de Compromissos agrupada por assunto, com o que falta em primeiro lugar. **Ela só cobra os assuntos dos blocos anteriores a ela** (Versionamento e Pipeline, 4 linhas-semente): as **5 sementes da tarde** (Assuntos 3, 4, 5 e 7) não aparecem às 11:55. *Antes de sair* tem 3 conferências: compromissos, propostas (aqui, a decisão do versionamento) e CSV. Com o dia limpo ela abre em "0 de 4 compromissos completos" e "1 de 3 prontos" (só o CSV está ok, porque ainda não há nada por exportar); ao registrar qualquer dado sem pasta conectada, o item de CSV vira "Tecle D: conectar pasta ou Baixar CSV". Com os 4 compromissos da manhã preenchidos e a proposta decidida, mostra "4 de 4" e "Aceita" (ou o veredito) e, sem pasta, "2 de 3 prontos". Detalhes: `docs/PADROES.md` §9, layout `encerramento`.

**Fechamento do dia (16:55).** Mesma tela, em **modo lista**: sem `data-proposta`, ela descobre sozinha todas as propostas dos blocos anteriores e mostra uma linha por proposta (hoje 5: Versionamento, Operação Inovação, Ocorrências, Review dos PRs e Ferramentas e IA), com veredito, mãos e ajuste; os números agregados do brainstorming (nunca por pessoa); o card **Dúvidas e sugestões do dia**: as 3 mais votadas de **qualquer assunto** dos blocos anteriores (Pipeline, Ocorrências, Review dos PRs, ShapeUp e o que vier), cada uma com o assunto; e a tabela de Compromissos de **todos os assuntos** (as 9 sementes: com o dia limpo, "0 de 9 compromissos completos" e "1 de 3 prontos"). Com os 9 preenchidos e as 5 propostas decididas: "9 de 9", "Pronto" e, sem pasta, "2 de 3 prontos". Antes de fechar o navegador, confira o chip verde (*Checklist pós-evento*).

**Almoço (12:00–14:00).** Não zere dados e não feche o navegador. Se aparecer `CSV · reconectar pasta`, siga a *Retomada* abaixo antes de qualquer registro. Sugestão: use o almoço para copiar a pasta `dados/` (cópia de segurança da manhã).

### Ensaio × evento

O que o ensaio deixa para trás: linhas nos CSV de `dados/` (se a pasta estava conectada), cópia local no navegador e a **posição do deck** (o deck reabre na última tela vista). **Cada endereço tem a sua cópia**: `http://localhost:8080` e o endereço do Pages não compartilham dados entre si — ensaie e apresente na **mesma URL**, no mesmo perfil do navegador. **Atenção em `file://`:** o Chrome trata todos os arquivos locais como uma origem só, então `index.html`, `catalogo.html` e qualquer outra cópia do projeto aberta do disco **compartilham a mesma cópia local** (abrir o catálogo de modelos não separa os dados do deck).

Do ensaio para o evento:

1. Com a pasta conectada e o chip verde, guarde o ensaio se quiser (**D › Baixar todos os CSV** ou copie a pasta `dados/`).
2. **D › Zerar dados (novo evento)** (2 toques). Isso limpa o navegador, apaga a posição e **regrava os CSV da pasta** com a base limpa.
3. Confirme no painel: todas as tabelas com **0 linhas** — exceto `decisoes`, que volta com as **9 linhas-semente** (responsável e prazo em branco).
4. `python ferramentas/montar.py --final` — deve terminar em `OK`; se acusar "dados de ensaio", o `dados/` ainda está sujo: zere de novo.
5. Reabra o deck em `index.html#/1` (Zerar não muda a tela em que você está; a posição salva só some no próximo carregamento). Alternativa sem Zerar: perfil novo do Chrome ou *Configurações › Privacidade › Dados do site* da URL do deck.

Com `git` instalado, `git checkout dados/` também devolve os CSV ao estado do último commit.

### Retomada após reiniciar o Chrome

O navegador lembra qual é a pasta, mas pede a permissão de novo. O painel D abre sozinho (uma vez) e o chip diz `CSV · reconectar pasta (D)`: clique **Reautorizar pasta** e confirme "editar arquivos". As edições feitas nesse meio-tempo foram guardadas na cópia local e são **mescladas** com o arquivo. Se o painel não abrir, tecle **D**. Reautorize *antes* de registrar qualquer coisa nova.

### Se a internet cair

O deck não depende de rede: fontes (`assets/fontes/*.woff2`), logo e ícones estão no repositório, a CSP só aceita `'self'` e por `file://` nem a leitura do CSV do servidor acontece. Com o `index.html` aberto do disco, **nada muda**. Se estiver usando o Pages, a aba já carregada continua funcionando, mas **não recarregue**; abra o `index.html` do clone local. O `git push` de depois do evento é que precisa de rede — pode esperar.

## Privacidade

- **O site do GitHub Pages é público por padrão** — mesmo com repositório privado, salvo planos com controle de acesso — e `dados/` fica na raiz publicada.
- `dados/*.csv` guardam **participante, críticas em texto livre e responsáveis**; e o `index.html` embute esses CSV como base inicial. Publicar `dados/` com dado real no Pages é publicar isso para qualquer pessoa.
- Portanto: **não publique dados reais no Pages.** Use **repositório privado e mantenha o Pages desligado** (o evento roda por `file://`) ou publique no Pages **só o deck limpo**, com `dados/` zerado (`--final` garante).
- No campo **participante** use **siglas** (P1, P2, iniciais): o que se digita é projetado para a sala e vai para o CSV. O campo já traz o placeholder "Pessoa (sigla)". Nome de pessoa nunca fica junto de métrica.
- Versionar os CSV do evento: só em repositório privado sem Pages.

## Publicação (GitHub Pages)

Esta pasta ainda não é um repositório git. Para publicar o deck **limpo**:

```bash
git init && git add . && git commit -m "Deck do 1º Informa DEV Summit"
git remote add origin <url-do-repositório> && git push -u origin main
```

*Settings → Pages → Deploy from a branch → `main` / `(root)`.* O `.nojekyll` já está na raiz e o `index.html` usa só caminhos relativos. Antes de publicar: `python ferramentas/montar.py --final`. O Pages pode levar alguns minutos e o navegador guarda cache (~10 min): depois de publicar, **Ctrl+F5**.

## Checklist pré-evento

1. `python ferramentas/montar.py --final` termina em `OK` (sem marcador, sem `data-modelo`, agenda fechando, `dados/` limpo) e `python ferramentas/montar.py --verificar` também. Se o `--final` acusar dado de ensaio, conecte a pasta e zere (item 6) e rode de novo.
2. `npm run capturar` (ele percorre as 47 telas): conferir que `capturas/auditoria-1920x1080.json` (e o de 1366×768) tem `resumo.comProblema` = 0 e que `violacoesCSP` está vazio no resumo do console. **Essa auditoria roda com os CSV vazios**: ela não vê o que o dado faz com a tela.
3. **Auditar COM dados** (o `capturar` não faz isso). Num Chrome com perfil de ensaio (em `file://` todas as páginas locais compartilham a mesma cópia local; não suje o perfil do evento), abra o deck e injete dados de ensaio realistas e **com texto longo nas 5 tabelas** — `brainstorming` (dezenas de apontamentos), `anotacoes` (assuntos `pipeline`, `ocorrencias`, `review-dos-prs` e `shapeup`, com votos), `propostas` (as cinco: `a1-`, `a3-`, `a4-`, `a5-` e `a7-proposta`, com decisão e ajuste), `decisoes` (responsável e prazo nos seis assuntos com Compromissos) e `progresso` (passos feitos nas 8 dinâmicas) — **percorra o deck** e audite. O trecho abaixo faz as três coisas; cole no console (F12), com o deck aberto. Ele devolve `SUMMIT.auditar().resumo`, e `comProblema` tem de ser 0. **O percurso das 47 telas é parte da conta**: cada tela precisa ser exibida ao menos uma vez antes de auditar, porque algumas (a `dinamica`, por exemplo) só ajustam a fonte ao serem exibidas; sem o percurso a auditoria acusa problema que não existe (foi o que se viu nas telas de condução `a2-dinamica` e `a3-dinamica`). Alternativa: `npm run capturar`, que já percorre as telas (mas só audita com os CSV limpos).

   ```js
   (() => {
     const T = n => SUMMIT.dados.tabela(n);
     const frase = 'texto de ensaio bem longo para forçar quebra de linha e corte na tela projetada';
     for (let i = 1; i <= 40; i++) T('brainstorming').adicionar({ rodada: '1', participante: 'P' + (1 + i % 14), tipo: i % 2 ? 'bom' : 'melhorar', texto: frase.slice(0, 20 + (i * 7) % 60) + ' ' + i, criticidade: i % 2 ? '' : String(1 + i % 3) });
     for (const assunto of ['pipeline', 'ocorrencias', 'review-dos-prs', 'shapeup']) for (let i = 1; i <= 8; i++) T('anotacoes').adicionar({ assunto, tipo: ['sugestao', 'duvida', 'risco'][i % 3], texto: frase + ' (' + assunto + ' ' + i + ')', votos: String(i % 5) });
     for (const [assunto, proposta] of [['versionamento', 'a1-proposta'], ['operacao-inovacao', 'a3-proposta'], ['ocorrencias', 'a4-proposta'], ['review-dos-prs', 'a5-proposta'], ['ferramentas-e-ia', 'a7-proposta']]) T('propostas').adicionar({ assunto, proposta, enunciado: frase, decisao: 'ajustar', votos_aceitar: '3', votos_ajustar: '5', votos_recusar: '1', ajuste: frase.slice(0, 120) });
     for (const assunto of ['versionamento', 'pipeline', 'operacao-inovacao', 'ocorrencias', 'review-dos-prs', 'ferramentas-e-ia']) for (let i = 1; i <= 3; i++) T('decisoes').adicionar({ assunto, item: frase + ' ' + i, responsavel: 'Responsável com nome longo ' + i, prazo: '2026-10-' + (10 + i), status: 'aberto', observacao: '' });
     for (const slide of ['a0-dinamica', 'a1-dinamica', 'a2-dinamica', 'a3-dinamica', 'a4-dinamica', 'a5-dinamica', 'a6-dinamica', 'a7-dinamica']) for (let p = 1; p <= 3; p++) T('progresso').adicionar({ slide, passo: String(p), estado: 'feito' });
     for (let i = 0; i < SUMMIT.total(); i++) SUMMIT.ir(i);   // percorre o deck: cada tela é exibida uma vez antes de auditar
     return SUMMIT.auditar().resumo;
   })()
   ```

   O ajuste da proposta está em 120 caracteres de propósito: o campo "Ajuste acordado" mostra 2 linhas (~140 caracteres); acima disso o texto rola por dentro, não aparece inteiro na projeção e a auditoria acusa `recortado` (o campo aceita 400). O que só aparece com dado: lista e densidade do brainstorm, nuvem, linhas e "+N abaixo" do quadro, selos da proposta e, sobretudo, os **dois Encerramentos** (item 4). Depois, descarte o perfil de ensaio; se usou o perfil do evento, **D › Zerar dados** (item 6). Sem dados (`npm run capturar` / `--saida`), o deck de 47 telas fecha em `comProblema` = 0 a 1920×1080 e 1366×768. A conferência **com dados** (este trecho) foi feita em 01/10/2026 no deck anterior, de 55 telas; **refaça-a** no deck de 47 antes do evento.
4. **Ensaiar os dois Fechamentos** (a tela de Encerramento aparece duas vezes) com esses dados. **Fechamento da manhã (11:55)**: ir à tela 19 (`G` `1` `9` `Enter`, ou `index.html#fechamento-encerramento`) e conferir (a) a decisão do versionamento (só `a1-proposta`) e as mãos; (b) os números do brainstorming; (c) as 3 sugestões mais votadas do pipeline; (d) a tabela de Compromissos agrupada por assunto, com a densidade compacta e o botão "+N abaixo" quando passa de ~4 compromissos de 2 linhas (grupos incluídos); (e) o cartão *Antes de sair* (3 conferências, incluindo o chip de CSV). Confirme também que as **cinco sementes da tarde** (Assuntos 3, 4, 5 e 7) **não** aparecem nela (veja *Roteiro do dia*) e que o contador e a conferência contam só os assuntos da manhã. **Fechamento do dia (16:55)**: ir à tela 47 (`G` `4` `7` `Enter`, ou `index.html#fechamento-dia-encerramento`) e conferir (a) a **lista de 5 propostas** (Versionamento, Operação Inovação, Ocorrências, Review dos PRs, Ferramentas e IA), cada uma com selo, veredito, mãos e ajuste, e "N de 5 com decisão"; (b) os números do brainstorming; (c) o card **Dúvidas e sugestões do dia** (3 mais votadas de qualquer assunto); (d) a tabela de Compromissos dos **seis assuntos** (as 9 sementes entram; em dia limpo, "0 de 9"); (e) *Antes de sair* com as 3 conferências. Nada nessas telas grava.
5. Abrir `index.html#/1` por `file://` no Chrome/Edge do notebook, **uma aba só**, projetor em 1920×1080, **F** (tela cheia); Caps Lock desligado; **data e hora do notebook certas** (as contagens do Intervalo e do Almoço usam o relógio dele).
6. **D › Conectar pasta dados/** (a do projeto), aceitar "editar arquivos" e ver o chip verde `gravado em dados/` **antes** de a sala entrar. Se já ensaiou: **D › Zerar dados (novo evento)** — *com a pasta já conectada*, para que os CSV sejam regravados limpos — e conferir **0 linhas** em todas as tabelas (`decisoes` com as 9 sementes). Zerar antes de conectar não limpa o arquivo da pasta: ao conectar, o ensaio voltaria. Rode de novo `python ferramentas/montar.py --final` (item 1).
7. Teclas: `T` (cronômetro), `1`–`6` (passos da dinâmica, até 6 por tela), `G`+nº+`Enter`, `O`, `Esc`. Cursor visível; relógio real (`H`) se a sala quiser.
8. Ensaio de 2 minutos (no navegador do evento, depois zerar): 1 apontamento no brainstorm, nuvem, mãos na proposta, 1 compromisso com prazo; abrir os CSV da pasta para ver a gravação; **zerar de novo** (item 6) e fechar os CSV no Excel.
9. Combinar quem digita e quem conduz; preparar papel e canetas para o passo "Pensar e anotar 3 + 3"; combinar **siglas** (P1, P2…) para o campo participante.
10. Plano B: segundo notebook com o clone do projeto e o Chrome, e **Baixar todos os CSV** testado (permitir downloads múltiplos). Pages só como último recurso.
11. Se aparecer `CSV · reconectar pasta` depois de reiniciar o navegador (ou ao voltar do almoço): **D › Reautorizar pasta** antes de registrar qualquer coisa.
12. **Confirmar com o Wendel — pendências de conteúdo** (não de código; as telas não afirmam o que o briefing não disse):
    - **(a) Mecanismo do novo fluxo da Operação Inovação (Assunto 3).** A tela mostra o funil de hoje (todos os assuntos passam pela validação do Gestor da Área) contra um PO por produto ou frente, e a proposta (`a3-proposta`) deixa os **papéis do PO e do Gestor da Área "a definir"** (confira o texto vigente da tela). O que o PO passa a fazer e o que muda para o Gestor da Área **não foi informado**. Confirmar antes do evento e, havendo resposta, ajustar `a3-funil` e `a3-proposta` (e o texto de `a3-dinamica` que cite o papel do PO).
    - **(b) De quais serviços são as 2 contas atuais (Assunto 7).** As telas dizem só que a conta de Desenvolvimento fica logada na máquina da Pipeline e que a de Inovação é usada pelo time de Inovação; em `a7-matriz`, o que o briefing não informa está como "não informado" (traço). Confirmar a que serviço cada conta se refere (GitHub, Claude ou outro) e, havendo resposta, completar as células da matriz e o texto de `a7-contas`.
    - **(c) A leitura de "2 planos individuais".** O briefing fala em "2 planos individuais"; as telas dizem "plano individual do Claude" para **cada usuário** (`a7-proposta`, `a7-matriz`) e "as 2 contas atuais" (Desenvolvimento e Inovação). Confirmar se são dois planos individuais à parte, se são essas mesmas duas contas, ou outra coisa, antes de a sala votar a proposta do Assunto 7 (`a7-matriz`, `a7-contas`, `a7-proposta`).
    - **(d) O horário das 17:00 e a substituição do bloco final.** O deck termina às 17:00 (Fechamento do dia 16:55–17:00). A pauta de 18/09 previa um **bloco final intocável**; hoje o horário é ocupado pelos **Assuntos 5 a 7** (Review dos PRs, ShapeUp, Ferramentas e IA). Confirmar o término às 17:00 e que o bloco intocável foi mesmo substituído por eles (nenhum bloco do deck usa `data-bloco-tipo="intocavel"`).
13. **Conferir a grafia dos nomes** (já confirmados com nome completo): POs — **Francisco Meneghetti** (InfoAudio) · **Gustavo Dias** (InfoRádio) · **Felipe Sanches** (SaaS) — nas telas `a3-funil`, `a3-pos` e `a5-papeis`; Tech Lead — **Adriano Ribeiro**, em `a5-papeis` (e "Adriano", só pelo primeiro nome, no enunciado e no "O que muda" de `a5-proposta`; as regras da tela de proposta pedem enunciado sem nome de pessoa: decidir se mantém ou troca por "Tech Lead"). Confirmar também o nome do produto ou da frente (como estão escritos: "InfoAudio", "InfoRádio", "SaaS"). Nome de pessoa só aparece ligado a papel ou produto, nunca junto de número.

14. **Conferir o slide 2 (cronograma) contra a grade.** Abra `index.html#abertura-cronograma` e compare, linha a linha, com a grade vigente (tabela do *Roteiro do dia*): 13 linhas, manhã à esquerda (Abertura 09:00 · Brainstorming 09:15 · Versionamento 10:15 · Intervalo 11:00 · Pipeline 11:10 · Fechamento 11:55), almoço 12:00–14:00 ao centro, tarde à direita (Operação Inovação 14:00 · Ocorrências 14:40 · Review dos PRs 15:30 · ShapeUp 16:10 · Ferramentas e IA 16:25 · Fechamento do dia 16:55) e o rodapé "Dia 09:00 – 17:00". Não pode haver ícone de alerta nem o aviso de horários que não encadeiam (lacuna ou sobreposição). Como a tela é gerada, um horário errado aqui é `data-bloco-ini` ou `data-bloco-min` errado na **primeira tela** do bloco, não na tela do cronograma. Mudou a grade? Acerte os metadados, rode `python ferramentas/montar.py --final` e confira de novo.

## Checklist pós-evento

1. Só feche o navegador depois de ver `CSV · gravado em dados/` (nada de `salvando…`). Sem pasta conectada: **D › Baixar todos os CSV**.
2. Conferir os 5 CSV em `dados/` (Excel: importar como UTF-8, `;`; ou editor de texto): cabeçalhos intactos, número de linhas plausível (`brainstorming` ≈ pessoas × 6; `decisoes` com `responsavel` e `prazo` preenchidos nos compromissos assumidos, inclusive as sementes dos Assuntos 3, 4, 5 e 7; `propostas` com `decisao` e votos nas 5 propostas — `a1-`, `a3-`, `a4-`, `a5-` e `a7-proposta`; `anotacoes` com os assuntos `pipeline`, `ocorrencias`, `review-dos-prs` e `shapeup`). Feche os arquivos no Excel.
3. Guardar uma cópia fora do projeto (pasta do evento). **Não use *Zerar* antes disso**: com a pasta conectada, ele regrava os CSV limpos por cima dos dados do evento.
4. Conferir a privacidade (participante só com siglas) e **onde** vai o commit: repositório privado sem Pages (veja *Privacidade*).
5. Commit e push dos dados: `git add dados && git commit -m "Dados do Summit" && git push`.
6. Rebuild é opcional e normalmente desnecessário: o deck continua limpo e, em `http(s)`, lê `dados/*.csv` direto do servidor. Se rodar `python ferramentas/montar.py` com os dados reais, eles passam a ser a base embutida no `index.html` (o aviso de "dados de ensaio" é esperado) e `--final` passa a reprovar — para voltar ao deck limpo, zere os CSV e rode `--final`.
7. Depois de arquivar tudo: **D › Zerar dados** (deixa o notebook limpo para o próximo uso).

## Teclado

`→ ← Espaço` navegar · `O` visão geral · `T` cronômetro (`R` reinicia, `+ -` ±1 min, `Shift+T` oculta) · `D` dados CSV · `F` tela cheia · `B` apagão · `H` relógio · `G`+nº+`Enter` ir para a tela · `?` ajuda · `Esc`.
Por layout: dinâmica `1`–`9` (passo) e `Shift+1`–`9` (concluir) · proposta `1` `2` `3` (aceitar, ajustar, recusar) · brainstorm `Enter` (entrada) e `V` (Ver todos). Tabela completa: `docs/PADROES.md` §8.
