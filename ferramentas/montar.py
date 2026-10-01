# -*- coding: utf-8 -*-
"""
montar.py — gera o index.html do 1º Informa DEV Summit a partir dos fragmentos em conteudo/.

O resultado é um site estático convencional (HTML + CSS + JS em arquivos separados), pronto para o GitHub Pages:
o index.html só referencia assets/css/*.css e assets/js/*.js; não há CSS nem JS inline.

  python ferramentas/montar.py            deck real  (conteudo/slides/)  -> index.html    (+ .nojekyll, dados/*.csv)
  python ferramentas/montar.py --modelos  catálogo   (conteudo/modelos/) -> catalogo.html
  python ferramentas/montar.py --final    entrega: sobra de data-modelo, marcador [[...]], aviso, agenda quebrada
                                          ou dado de ensaio em dados/*.csv vira ERRO
  python ferramentas/montar.py --verificar  monta em memória e compara com index.html e catalogo.html (exit 1 se defasados)
  python ferramentas/montar.py --saida X  grava em outro caminho (testes; usa <base> p/ achar os assets)
  python ferramentas/montar.py --so a,b   só os layouts a,b (+ núcleo) — trabalho em paralelo

Estrutura:  assets/{css,js,fontes,img} · conteudo/{slides,modelos} · dados/{esquema.json,*.csv} · docs/ · ferramentas/
Convenção:  css/js do núcleo = assets/{css,js}/NN-nome.ext ;  de layout = assets/{css,js}/layouts/NN-<layout>[-x].ext
            ordem de carga: núcleo (<90) → layouts → 90+ (auditoria, impressão, iniciar)
Saída:      sempre em LF (mesmo no Windows) e ?v= calculado sobre o conteúdo normalizado para LF — o mesmo commit gera
            o mesmo index.html em qualquer sistema.
"""
import argparse, csv, datetime, fnmatch, hashlib, io, json, re, sys, unicodedata
from html.parser import HTMLParser
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
FERR = Path(__file__).resolve().parent
RAIZ = FERR.parent
ASSETS, CONTEUDO, DADOS = RAIZ / "assets", RAIZ / "conteudo", RAIZ / "dados"
BOM = "﻿"

# Layouts reconhecidos (data-layout). Novo layout = nova linha aqui + assets/css/layouts/NN-nome.css + modelo em conteudo/modelos/.
LAYOUTS = {
    "capa", "cronograma", "bloco", "conteudo", "duas-colunas", "numeros", "destaque", "linha-tempo", "fluxo", "ciclo", "matriz",
    "opcoes", "proposta", "dinamica", "quadro", "brainstorm", "nuvem", "pausa", "encerramento",
}
TITULO = "Informa DEV Summit · 1º Summit · 02.10.2026"
# CSP do <meta>. Apertada de propósito; cada afrouxamento abaixo tem motivo, e o que não tem motivo ficou de fora:
#  - style-src 'self' (sem 'unsafe-inline'): o deck não usa estilo inline — nenhum style="" no HTML, nenhum <style>, nenhum
#    setAttribute('style')/innerHTML com style=; o JS só mexe em estilo pelo CSSOM (el.style.x = ...), que a CSP permite.
#  - img-src 'self' data: (sem blob:): o favicon (casca.html) é um data:image/svg+xml — ícone laranja sobre azul — e o
#    favicon passa por img-src; nenhuma imagem da página é data: nem blob:. "Baixar CSV" usa <a download href=blob:>, que é
#    download/navegação e não depende de img-src (testado em http e file://). Se o favicon virar arquivo (assets/img/),
#    troque por img-src 'self'.
#  - fontes vêm de font-src 'self'; tudo o mais é 'self'.
# Antes de afrouxar qualquer diretiva, rode o teste de violações (capturar.cjs lista violacoesCSP).
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
       "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'")

HHMM = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
ID_BLOCO = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
META_BLOCO = ("data-bloco-nome", "data-bloco-curto", "data-bloco-ini", "data-bloco-min",
              "data-bloco-apres", "data-bloco-def", "data-bloco-tipo")
TIPOS_BLOCO = {"pausa", "intocavel"}
TEXTO_LF = {".css", ".js", ".svg", ".html", ".json", ".txt"}     # arquivos cujo hash ignora CRLF/LF
# Tabelas cujo CSV não pode ter nenhuma linha no momento da entrega (toda linha é dado de ensaio).
TABELAS_VAZIAS = ("brainstorming", "anotacoes", "propostas", "progresso")
DICA_ZERAR = "zere a base (tecla D › Zerar) e regrave os CSV"


# ---------------------------------------------------------------- leitura dos slides
class LerSlides(HTMLParser):
    """Extrai, de cada <section class="slide">, os atributos, os .passo[data-min], os th[data-campo], os
    controles (input/select/textarea) com data-campo e a contagem do layout fluxo (etapas, nós, faixas, entradas, POs)."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.slides, self.atual, self.fundo = [], None, 0
        self.entrada = False                                 # dentro de um li.fluxo-entrada (captura o texto)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        classes = (a.get("class") or "").split()
        if tag == "section" and "slide" in classes and self.atual is None:
            # fluxo: "etapas" = nº de .fluxo-no-item de cada li.fluxo-etapa; "faixas" = uma por .fluxo-faixa, na ordem do HTML
            self.atual = {"attrs": a, "passos": [], "ths": [], "controles": [], "fluxo": {"etapas": [], "faixas": [], "modos": []}}
            self.fundo = 0
            self.slides.append(self.atual)
            return
        if self.atual is None:
            return
        if tag == "section":
            self.fundo += 1                                  # <section> aninhada não fecha o slide
        if "passo" in classes and a.get("data-min") is not None:
            self.atual["passos"].append(a.get("data-min"))
        fx = self.atual["fluxo"]
        if tag == "li" and "fluxo-etapa" in classes:
            fx["etapas"].append(0)
        elif "fluxo-no-item" in classes and fx["etapas"]:
            fx["etapas"][-1] += 1
        elif "fluxo-faixa" in classes:
            fx["faixas"].append({"faixa": (a.get("data-faixa") or "").strip(), "entradas": [], "pos": 0, "destinos": 0,
                                 "sem_entradas": a.get("data-entradas")})
        elif fx["faixas"]:
            f = fx["faixas"][-1]
            if tag == "li" and "fluxo-entrada" in classes:
                f["entradas"].append("")
                self.entrada = True
            elif "fluxo-po" in classes:
                f["pos"] += 1
            elif tag == "li" and "fluxo-destino" in classes:
                f["destinos"] += 1
        if tag == "ul" and "fluxo-nos" in classes and a.get("data-modo") is not None:
            fx["modos"].append(a["data-modo"].strip())
        if tag == "th" and a.get("data-campo") is not None:
            self.atual["ths"].append(a)
        elif tag in ("input", "select", "textarea") and a.get("data-campo") is not None:
            self.atual["controles"].append(a)

    def handle_data(self, data):
        if self.entrada and self.atual is not None and self.atual["fluxo"]["faixas"]:
            self.atual["fluxo"]["faixas"][-1]["entradas"][-1] += data

    def handle_endtag(self, tag):
        if tag == "li":
            self.entrada = False
        if tag == "section" and self.atual is not None:
            if self.fundo:
                self.fundo -= 1
            else:
                self.atual = None


def para_int(v):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def para_min(hhmm):
    """'09:15' -> 555 (minutos desde 00:00)."""
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def ler(p: Path) -> str:
    return p.read_text(encoding="utf-8")


# ---------------------------------------------------------------- arquivos por layout
def layout_do_arquivo(p: Path):
    """'25-bloco-b1.html' -> 'bloco' · '32-duas-colunas.css' -> 'duas-colunas' · '10-nucleo.js' -> None"""
    resto = re.sub(r"^\d+-", "", p.stem)
    for lay in sorted(LAYOUTS, key=len, reverse=True):
        if resto == lay or resto.startswith(lay + "-"):
            return lay
    return None


def passa(p: Path, so) -> bool:
    """--so restringe arquivos de LAYOUT; núcleo e demais sempre entram."""
    if not so:
        return True
    lay = layout_do_arquivo(p)
    return lay is None or lay in so


def ordenar(pasta: Path, ext: str, so=None) -> list[Path]:
    """núcleo (<90) → layouts → 90+."""
    nucleo = sorted(p for p in pasta.glob(f"*.{ext}") if p.name < "90")
    layouts = sorted(p for p in (pasta / "layouts").glob(f"*.{ext}") if passa(p, so))
    final = sorted(p for p in pasta.glob(f"*.{ext}") if p.name >= "90")
    return nucleo + layouts + final


def versao(p: Path) -> str:
    """Cache-busting: muda só quando o arquivo muda. Texto é normalizado para LF, então o hash é o mesmo num
    checkout CRLF (Windows, autocrlf) e num LF (Linux, GitHub)."""
    b = p.read_bytes()
    if p.suffix.lower() in TEXTO_LF:
        b = b.replace(b"\r\n", b"\n")
    return hashlib.md5(b).hexdigest()[:8]


def href(p: Path) -> str:
    return f"{p.relative_to(RAIZ).as_posix()}?v={versao(p)}"


def miolo_svg(p: Path) -> str:
    """Conteúdo de dentro do <svg> do sprite (os <symbol>)."""
    return re.sub(r"^\s*<svg[^>]*>|</svg>\s*$", "", ler(p).strip()).strip()


# ---------------------------------------------------------------- base de dados (CSV)
def cabecalho(colunas):
    return ["id"] + colunas + ["atualizado_em"]


def delimitador(lin: str):
    for d in (";", ",", "\t"):
        if d in lin:
            return d
    return None


def primeira_linha_csv(txt: str):
    txt = txt.lstrip(BOM)
    lin = txt.split("\n", 1)[0].strip("\r")
    d = delimitador(lin)
    if d:
        return [c.strip() for c in lin.split(d)]
    return [lin.strip()] if lin.strip() else []


def linhas_csv(txt: str):
    """Linhas de dados do CSV (RFC 4180, aspas e quebras dentro do campo) como lista de dicts; ignora linhas vazias."""
    txt = txt.lstrip(BOM)
    d = delimitador(txt.split("\n", 1)[0].strip("\r")) or ";"
    leitor = csv.reader(io.StringIO(txt, newline=""), delimiter=d)
    cab = None
    saida = []
    for lin in leitor:
        if cab is None:
            cab = [c.strip() for c in lin]
            continue
        if any(c.strip() for c in lin):
            saida.append(dict(zip(cab, lin)))
    return saida


def linhas_de_ensaio(nome: str, txt: str) -> int:
    """Quantas linhas do CSV são dado de ensaio (não pertencem ao CSV entregue no evento).
    brainstorming/anotacoes/propostas/progresso nascem vazios: qualquer linha é ensaio.
    decisoes nasce com as linhas-semente (id 'seed-…', owner/prazo em branco, status aberto): é ensaio a linha que não é
    semente ou que tem responsavel/prazo preenchido ou status diferente de 'aberto'."""
    linhas = linhas_csv(txt)
    if nome in TABELAS_VAZIAS:
        return len(linhas)
    if nome == "decisoes":
        return sum(1 for l in linhas
                   if not (l.get("id") or "").startswith("seed-")
                   or (l.get("responsavel") or "").strip() or (l.get("prazo") or "").strip()
                   or (l.get("status") or "").strip() not in ("", "aberto"))
    return 0


def carregar_esquema(erros):
    arq = DADOS / "esquema.json"
    if not arq.exists():
        return None
    try:
        esq = json.loads(ler(arq))
        esq["tabelas"].items()
        return esq
    except (ValueError, KeyError, AttributeError) as e:
        erros.append(f"dados/esquema.json inválido: {e}")
        return None


def preparar_dados(esquema, erros, avisos, criar: bool, final: bool = False):
    """Valida/cria dados/*.csv conforme dados/esquema.json e devolve {tabela: csv}.
    Dado de ensaio nos CSV é ERRO em --final (iria para o GitHub Pages) e aviso no build comum."""
    sementes = {}
    for nome, cfg in esquema["tabelas"].items():
        esperado = cabecalho(cfg["colunas"])
        arq = DADOS / f"{nome}.csv"
        if not arq.exists():
            if criar:
                arq.write_bytes((BOM + ";".join(esperado) + "\r\n").encode("utf-8"))
                avisos.append(f"dados/{nome}.csv criado (vazio, só cabeçalho)")
            else:
                sementes[nome] = ";".join(esperado) + "\r\n"
                continue
        txt = arq.read_bytes().decode("utf-8-sig")
        cab = primeira_linha_csv(txt)
        if cab != esperado:
            erros.append(f"dados/{nome}.csv: cabeçalho {cab} difere do esquema {esperado}")
        else:
            n = linhas_de_ensaio(nome, txt)
            if n:
                (erros if final else avisos).append(f"dados/{nome}.csv: {n} linha(s) de dados de ensaio — {DICA_ZERAR} antes de publicar")
        # CRLF fixo: o texto embutido não depende do sistema em que o repositório foi clonado
        sementes[nome] = txt.replace("\r\n", "\n").replace("\n", "\r\n")
    extras = [p.name for p in DADOS.glob("*.csv") if p.stem not in esquema["tabelas"]]
    if extras:
        avisos.append(f"dados/: CSV sem tabela no esquema (ignorados): {extras}")
    return sementes


def validar_sementes_decisoes(todos, sementes, erros, avisos, final: bool):
    """Todo quadro de COMPROMISSOS (data-tabela="decisoes") precisa de ao menos uma linha-semente do seu data-assunto em
    dados/decisoes.csv; senão a tela nasce só com a linha-exemplo e a ação do assunto some (ERRO em --final, aviso no build comum)."""
    txt = sementes.get("decisoes")
    if txt is None:
        return
    linhas = txt.splitlines()[1:]
    com_semente = {sem_acento((l.split(";") + ["", ""])[1]) for l in linhas if l.strip()}
    vistos = set()
    for s in todos:
        a = s["attrs"]
        if a.get("data-layout") != "quadro" or (a.get("data-tabela") or "").strip() != "decisoes":
            continue
        ass = sem_acento(a.get("data-assunto"))
        if not ass or ass in vistos:
            continue
        vistos.add(ass)
        if ass not in com_semente:
            (erros if final else avisos).append(
                f'{s["arquivo"]}: o quadro de compromissos do assunto "{a.get("data-assunto")}" não tem linha-semente em dados/decisoes.csv '
                f'(a ação do assunto não apareceria na tela; adicione "seed-…;{a.get("data-assunto")};<ação>;;;aberto;;")')


def json_seguro(obj) -> str:
    """JSON para dentro de <script type=application/json>: impede '</script' e '<!--' de fecharem o bloco."""
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/").replace("<!--", "<\\!--")


# ---------------------------------------------------------------- contrato das telas
def validar_telas(todos, esquema, erros):
    """Contrato por tela (PADROES.md §3 e §5): o que uma tela interativa precisa declarar para funcionar ao vivo."""
    tabelas = esquema["tabelas"] if esquema else None

    def tabela_existe(nome, attr, tabela):
        if tabelas is not None and tabela not in tabelas:
            erros.append(f'{nome}: {attr}="{tabela}" não existe em dados/esquema.json (tabelas: {", ".join(sorted(tabelas))})')
            return False
        return tabelas is not None

    for n, s in enumerate(todos, 1):
        a, nome = s["attrs"], f'{s["arquivo"]} (tela {n})'
        lay = a.get("data-layout")
        tab = (a.get("data-tabela") or "").strip()
        if lay == "quadro":
            if not tab:
                erros.append(f"{nome}: quadro sem data-tabela (tabela CSV em que grava)")
            if not (a.get("data-assunto") or "").strip():
                erros.append(f"{nome}: quadro sem data-assunto (sem ele as telas do quadro dividem as mesmas linhas)")
            if not s["ths"]:
                erros.append(f"{nome}: quadro sem colunas — declare ao menos um <th data-campo=\"...\">")
            if tab and tabela_existe(nome, "data-tabela", tab):
                cols = tabelas[tab]["colunas"]
                for th in s["ths"]:
                    if th["data-campo"] not in cols:
                        erros.append(f'{nome}: th data-campo="{th["data-campo"]}" não é coluna de "{tab}" (colunas: {", ".join(cols)})')
        elif lay == "proposta":
            if not (a.get("data-assunto") or "").strip():
                erros.append(f"{nome}: proposta sem data-assunto")
            if tab:
                tabela_existe(nome, "data-tabela", tab)
        elif lay in ("brainstorm", "nuvem"):
            if not (a.get("data-rodada") or "").strip():
                erros.append(f"{nome}: {lay} sem data-rodada")
            if tab and tabela_existe(nome, "data-tabela", tab) and lay == "brainstorm":
                cols = tabelas[tab]["colunas"]
                for c in s["controles"]:
                    if c["data-campo"] not in cols:
                        erros.append(f'{nome}: campo data-campo="{c["data-campo"]}" não é coluna de "{tab}" (colunas: {", ".join(cols)})')
        for attr in ("data-bloco-ini", "data-volta"):
            if a.get(attr) is not None and not HHMM.match(a[attr].strip()):
                erros.append(f'{nome}: {attr}="{a[attr]}" não está no formato HH:MM')
        if a.get("data-bloco-tipo") is not None and a["data-bloco-tipo"] not in TIPOS_BLOCO:
            erros.append(f'{nome}: data-bloco-tipo="{a["data-bloco-tipo"]}" inválido (válidos: {", ".join(sorted(TIPOS_BLOCO))})')
        if a.get("data-bloco") and not ID_BLOCO.match(a["data-bloco"]):
            erros.append(f'{nome}: data-bloco="{a["data-bloco"]}" — id de bloco só com minúsculas, dígitos e hífen (ex.: a1)')


VARIANTES_FLUXO = ("colunas", "comparativo")
MODOS_FLUXO = ("sequencia", "alternativa", "paralelo")


def validar_fluxos(todos, erros):
    """Layout fluxo (modelo 37-fluxo.html, LIMITES): o diagrama só fecha com a quantidade certa de peças; fora dela o CSS não avisa
    (6 etapas quebram o diagrama, entradas diferentes entre HOJE e NOVO desmentem a comparação).
      · data-variante ∈ {colunas, comparativo};
      · colunas: 2 a 5 li.fluxo-etapa, cada uma com 1 a 3 .fluxo-no-item;
      · ul.fluxo-nos data-modo ∈ {sequencia, alternativa, paralelo} (outro valor cairia em silêncio em "sequência");
      · comparativo: exatamente 2 .fluxo-faixa (data-faixa hoje, depois novo); HOJE com 2 a 6 .fluxo-entrada; NOVO com os MESMOS textos
        (quando as duas faixas têm entradas) ou SEM entradas, marcado com data-entradas="nenhuma" (só os cartões produto/frente + PO,
        sem sugerir roteamento); em NOVO, 2 a 4 li.fluxo-destino e 2 a 4 .fluxo-po (um PO por destino)."""
    for s in todos:
        a = s["attrs"]
        if a.get("data-layout") != "fluxo":
            continue
        nome = f'{s["arquivo"]} ({a.get("id") or "?"})'
        var, fx = (a.get("data-variante") or "").strip(), s["fluxo"]
        if var not in VARIANTES_FLUXO:
            dado = f'"{var}"' if var else "ausente"
            erros.append(f'{nome}: fluxo com data-variante {dado} — use data-variante="colunas" ou "comparativo"')
            continue
        for m in fx["modos"]:
            if m not in MODOS_FLUXO:
                erros.append(f'{nome}: ul.fluxo-nos com data-modo="{m}" — use {", ".join(MODOS_FLUXO)} (outro valor cairia em silêncio em "sequencia")')
        if var == "colunas":
            n = len(fx["etapas"])
            if not 2 <= n <= 5:
                erros.append(f'{nome}: fluxo "colunas" com {n} li.fluxo-etapa — são 2 a 5 etapas (6 quebram o diagrama: divida em duas telas)')
            for i, nos in enumerate(fx["etapas"], 1):
                if not 1 <= nos <= 3:
                    erros.append(f'{nome}: etapa {i} do fluxo com {nos} .fluxo-no-item — cada etapa tem 1 a 3 nós')
            if fx["faixas"]:
                erros.append(f'{nome}: fluxo "colunas" com .fluxo-faixa — faixas são do "comparativo"')
            continue
        faixas = fx["faixas"]
        if fx["etapas"]:
            erros.append(f'{nome}: fluxo "comparativo" com li.fluxo-etapa — etapas são das "colunas"')
        if len(faixas) != 2:
            erros.append(f'{nome}: fluxo "comparativo" com {len(faixas)} .fluxo-faixa — são exatamente 2 (data-faixa="hoje" e "novo")')
            continue
        rot = [f["faixa"] for f in faixas]
        if rot != ["hoje", "novo"]:
            erros.append(f'{nome}: as faixas do comparativo precisam ser data-faixa="hoje" e depois "novo", na ordem de leitura (achei: {rot})')
        for f in faixas:
            n = len(f["entradas"])
            if f["faixa"] == "novo" and n == 0:
                continue                                      # NOVO sem entradas: validado abaixo
            if not 2 <= n <= 6:
                erros.append(f'{nome}: faixa "{f["faixa"]}" com {n} .fluxo-entrada — são 2 a 6 entradas')
        hoje, novo = faixas[0], faixas[1]
        if novo["sem_entradas"] is not None and novo["sem_entradas"].strip() != "nenhuma":
            erros.append(f'{nome}: faixa "novo" com data-entradas="{novo["sem_entradas"]}" — o único valor é "nenhuma"')
        elif novo["sem_entradas"] is not None and novo["entradas"]:
            erros.append(f'{nome}: faixa "novo" com data-entradas="nenhuma" mas com {len(novo["entradas"])} .fluxo-entrada — tire o atributo ou as entradas')
        elif novo["sem_entradas"] is None and not novo["entradas"]:
            erros.append(f'{nome}: faixa "novo" sem .fluxo-entrada — declare data-entradas="nenhuma" para a forma só de cartões (sem entradas, barramento e saída)')
        elif novo["entradas"] and hoje["entradas"]:
            txt = [[" ".join(t.split()) for t in f["entradas"]] for f in (hoje, novo)]
            if txt[0] != txt[1]:
                erros.append(f'{nome}: as entradas de HOJE e NOVO precisam ser as MESMAS, no mesmo texto e na mesma ordem — HOJE {txt[0]} × NOVO {txt[1]}')
        if not 2 <= novo["destinos"] <= 4:
            erros.append(f'{nome}: faixa "novo" com {novo["destinos"]} li.fluxo-destino — são 2 a 4 destinos (POs)')
        if not 2 <= novo["pos"] <= 4:
            erros.append(f'{nome}: faixa "novo" com {novo["pos"]} .fluxo-po — são 2 a 4 POs')
        elif novo["pos"] != novo["destinos"]:
            erros.append(f'{nome}: faixa "novo" com {novo["destinos"]} li.fluxo-destino e {novo["pos"]} .fluxo-po — um PO por destino')


def validar_nuvens(todos, esquema, erros):
    """Toda nuvem lê uma rodada: precisa existir um brainstorm da mesma rodada (e da mesma tabela) no deck."""
    def rod(s):
        return (s["attrs"].get("data-rodada") or "").strip()

    def tab(s):
        return (s["attrs"].get("data-tabela") or "").strip() or "brainstorming"

    brains = [s for s in todos if s["attrs"].get("data-layout") == "brainstorm"]
    for s in todos:
        if s["attrs"].get("data-layout") != "nuvem" or not rod(s):
            continue
        nome = f'{s["arquivo"]} ({s["attrs"].get("id")})'
        mesmos = [b for b in brains if rod(b) == rod(s)]
        if not mesmos:
            erros.append(f'{nome}: nuvem da rodada "{rod(s)}" sem nenhum brainstorm com data-rodada="{rod(s)}" no deck — ela nasceria vazia')
        elif not any(tab(b) == tab(s) for b in mesmos):
            erros.append(f'{nome}: nuvem lê "{tab(s)}", mas o brainstorm da rodada "{rod(s)}" grava em "{tab(mesmos[0])}"')


def validar_blocos(todos, erros, avisos, final: bool, ilustrativo: bool = False):
    """Blocos e agenda: cada data-bloco tem UMA tela com metadados, e é a primeira do bloco; a agenda encadeia
    (ini + min = ini do próximo); a dinâmica dura o que o bloco dura. No catálogo de modelos (ilustrativo) só a
    estrutura dos blocos é conferida: tempos e horários dos modelos não formam uma agenda."""
    ordem, por_bloco = [], {}
    for s in todos:
        b = s["attrs"].get("data-bloco")
        if not b:
            continue
        if b not in por_bloco:
            por_bloco[b] = []
            ordem.append(b)
        por_bloco[b].append(s)

    def nome_de(s):
        return f'{s["arquivo"]} ({s["attrs"].get("id") or "?"})'

    def tem_meta(s):
        return any(m in s["attrs"] for m in META_BLOCO)

    cab = {}                                                  # bloco -> attrs da tela de metadados
    for b in ordem:
        telas = por_bloco[b]
        com = [s for s in telas if tem_meta(s)]
        if not com:
            erros.append(f'bloco "{b}" ({nome_de(telas[0])}): nenhuma tela declara os metadados do bloco '
                         f'(data-bloco-nome, data-bloco-ini, data-bloco-min…) — coloque-os na primeira tela do bloco')
            continue
        if len(com) > 1:
            erros.append(f'bloco "{b}": {len(com)} telas declaram metadados ({", ".join(nome_de(s) for s in com)}) — só a primeira do bloco deve declará-los')
        if com[0] is not telas[0]:
            erros.append(f'bloco "{b}": os metadados estão em {nome_de(com[0])}, mas a primeira tela do bloco é {nome_de(telas[0])} — mova-os para ela')
        a = com[0]["attrs"]
        faltam = [m for m in ("data-bloco-nome", "data-bloco-ini", "data-bloco-min") if not (a.get(m) or "").strip()]
        if faltam:
            erros.append(f'bloco "{b}" ({nome_de(com[0])}): faltam {", ".join(faltam)}')
        cab[b] = a

    if not ilustrativo:
        for s in todos:
            a = s["attrs"]
            if a.get("data-layout") != "dinamica" or a.get("data-bloco") not in cab:
                continue
            tot, mine = para_int(cab[a["data-bloco"]].get("data-bloco-min")), para_int(a.get("data-min"))
            if tot is not None and mine is not None and mine != tot:
                erros.append(f'{nome_de(s)}: dinâmica com data-min={mine}, mas o bloco "{a["data-bloco"]}" tem data-bloco-min={tot} — devem ser iguais')

    # agenda encadeada (só entre blocos com horário e duração válidos)
    cadeia = [] if ilustrativo else [(b, cab[b]) for b in ordem if b in cab
              and HHMM.match((cab[b].get("data-bloco-ini") or "").strip()) and para_int(cab[b].get("data-bloco-min")) is not None]
    for (b1, a1), (b2, a2) in zip(cadeia, cadeia[1:]):
        fim = para_min(a1["data-bloco-ini"].strip()) + para_int(a1["data-bloco-min"])
        ini2 = para_min(a2["data-bloco-ini"].strip())
        if fim != ini2:
            hh = f"{fim // 60:02d}:{fim % 60:02d}"
            dif = ini2 - fim
            rel = f"lacuna de {dif} min" if dif > 0 else f"sobreposição de {-dif} min"
            (erros if final else avisos).append(
                f'agenda: bloco "{b1}" ({a1["data-bloco-ini"]} + {a1["data-bloco-min"]} min) termina às {hh}, mas "{b2}" começa às {a2["data-bloco-ini"]} ({rel})')


def sem_acento(s) -> str:
    """Minúsculas, sem acento e sem espaços nas pontas: a mesma comparação de assunto que o JS faz (semAcento)."""
    d = unicodedata.normalize("NFD", str(s or "").strip())
    return "".join(c for c in d if not unicodedata.combining(c)).lower()


def data_iso_valida(v) -> bool:
    """AAAA-MM-DD de calendário (2000–2099, como o JS do layout encerramento)."""
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", v or ""):
        return False
    try:
        d = datetime.date.fromisoformat(v)
    except ValueError:
        return False
    return 2000 <= d.year <= 2099


def validar_encerramentos(todos, erros):
    """Tela encerramento data-variante="resumo" (lê os CSV ao vivo): o que ela aponta precisa existir no deck, senão nasce vazia.
      · data-proposta  = (opcional) id de uma tela de layout "proposta"; sem ele, lista todas as propostas dos blocos anteriores;
      · data-referencia = AAAA-MM-DD válida (base do D+N dos prazos);
      · data-assunto-sugestoes (se houver) = data-assunto de alguma tela "quadro" com data-tabela="anotacoes", ou "todos" (agrega os assuntos de blocos anteriores)."""
    por_id = {s["attrs"].get("id"): s for s in todos if s["attrs"].get("id")}
    assuntos = {sem_acento(s["attrs"].get("data-assunto")) for s in todos
                if s["attrs"].get("data-layout") == "quadro" and (s["attrs"].get("data-tabela") or "").strip() == "anotacoes"
                and (s["attrs"].get("data-assunto") or "").strip()}
    for s in todos:
        a = s["attrs"]
        if a.get("data-layout") != "encerramento" or a.get("data-variante") != "resumo":
            continue
        nome = f'{s["arquivo"]} ({a.get("id") or "?"})'
        prop = (a.get("data-proposta") or "").strip()
        # data-proposta é OPCIONAL: sem ele a tela lista TODAS as propostas dos blocos anteriores a ela (automático).
        if prop and prop not in por_id:
            erros.append(f'{nome}: data-proposta="{prop}" não é o id de nenhuma tela do deck — a decisão da proposta nunca apareceria')
        elif prop and por_id[prop]["attrs"].get("data-layout") != "proposta":
            erros.append(f'{nome}: data-proposta="{prop}" aponta para uma tela de layout "{por_id[prop]["attrs"].get("data-layout")}", não "proposta"')
        ref = (a.get("data-referencia") or "").strip()
        if not ref:
            erros.append(f'{nome}: encerramento resumo sem data-referencia (AAAA-MM-DD; base do D+N dos prazos)')
        elif not data_iso_valida(ref):
            erros.append(f'{nome}: data-referencia="{ref}" não é uma data válida no formato AAAA-MM-DD (entre 2000 e 2099)')
        if a.get("data-assunto-sugestoes") is not None:
            ass = a["data-assunto-sugestoes"].strip()
            if not ass:
                erros.append(f'{nome}: data-assunto-sugestoes vazio — informe o data-assunto da tela quadro de anotações (ou remova o atributo)')
            elif sem_acento(ass) != "todos" and sem_acento(ass) not in assuntos:
                lista = ", ".join(sorted(assuntos)) or "nenhum quadro com data-tabela=\"anotacoes\""
                erros.append(f'{nome}: data-assunto-sugestoes="{ass}" não corresponde ao data-assunto de nenhuma tela quadro com data-tabela="anotacoes" (existem: {lista}) — as sugestões ficariam vazias')


def validar_pausas(todos, erros, avisos, final: bool):
    """data-volta da pausa (horário projetado do retorno) precisa bater com o início do próximo bloco da agenda.
    Aviso no build comum; ERRO em --final."""
    ordem, ini = [], {}
    for s in todos:
        a = s["attrs"]
        b = a.get("data-bloco")
        if not b:
            continue
        if b not in ordem:
            ordem.append(b)
        if b not in ini and HHMM.match((a.get("data-bloco-ini") or "").strip()):
            ini[b] = a["data-bloco-ini"].strip()
    for s in todos:
        a = s["attrs"]
        if a.get("data-layout") != "pausa" or a.get("data-volta") is None:
            continue
        volta, b = a["data-volta"].strip(), a.get("data-bloco")
        if not HHMM.match(volta) or b not in ordem:
            continue                                         # formato inválido já é erro em validar_telas
        seguintes = [x for x in ordem[ordem.index(b) + 1:] if x in ini]
        if not seguintes:
            continue
        prox = seguintes[0]
        if volta != ini[prox]:
            (erros if final else avisos).append(
                f'{s["arquivo"]} ({a.get("id") or "?"}): pausa com data-volta="{volta}", mas o próximo bloco "{prox}" começa às {ini[prox]} — '
                f'a tela projetaria um retorno diferente da agenda')


# ---------------------------------------------------------------- montagem
def construir(*, modelos=False, final=False, so=None, pads=None, teste=False, criar_dados=False):
    """Monta o HTML em memória. Devolve (erros, avisos, html|None, n_telas)."""
    erros, avisos = [], []
    parcial = bool(so or pads)                                # deck incompleto: não dá para validar blocos/agenda/nuvens

    pasta_slides = CONTEUDO / ("modelos" if modelos else "slides")
    arquivos = sorted(p for p in pasta_slides.glob("*.html") if passa(p, so))
    if pads:
        arquivos = [p for p in arquivos if any(fnmatch.fnmatch(p.name, pad) for pad in pads)]
    if not arquivos and not (modelos or so):
        avisos.append("conteudo/slides/ está vazio — o deck sairá sem telas")
    if not arquivos and (modelos or so):
        erros.append(f"nenhum arquivo em conteudo/{pasta_slides.name}/")
    partes, todos = [], []
    for arq in arquivos:
        html = ler(arq)
        p = LerSlides(); p.feed(html)
        if not p.slides:
            erros.append(f"{arq.name}: nenhuma <section class=\"slide\"> encontrada")
        for s in p.slides:
            s["arquivo"] = arq.name
            todos.append(s)
        if "[[" in html:
            (erros if final else avisos).append(f"{arq.name}: sobrou marcador [[...]]")
        partes.append(f"<!-- ▼ conteudo/{pasta_slides.name}/{arq.name} -->\n{html.strip()}\n")

    ids, n_modelos = {}, 0
    for n, s in enumerate(todos, 1):
        a, nome = s["attrs"], f'{s["arquivo"]} (tela {n})'
        for req in ("id", "data-layout", "data-bloco"):
            if not a.get(req):
                erros.append(f"{nome}: falta o atributo {req}")
        if a.get("id"):
            if a["id"] in ids:
                erros.append(f'{nome}: id "{a["id"]}" duplicado (já em {ids[a["id"]]})')
            ids[a["id"]] = nome
        lay = a.get("data-layout")
        if lay and lay not in LAYOUTS:
            erros.append(f'{nome}: data-layout "{lay}" desconhecido (válidos: {", ".join(sorted(LAYOUTS))})')
        for attr in ("data-min", "data-bloco-min", "data-bloco-apres", "data-bloco-def"):
            if a.get(attr) is not None and (para_int(a[attr]) is None or para_int(a[attr]) < 0):
                erros.append(f'{nome}: {attr}="{a[attr]}" não é número inteiro de minutos')
        if "data-modelo" in a:
            n_modelos += 1
        # assunto = apresentação + definições deve fechar a duração do bloco
        if a.get("data-bloco-apres") is not None or a.get("data-bloco-def") is not None:
            tot, ap_, df = para_int(a.get("data-bloco-min")), para_int(a.get("data-bloco-apres")) or 0, para_int(a.get("data-bloco-def")) or 0
            if tot is None:
                erros.append(f"{nome}: data-bloco-apres/def sem data-bloco-min")
            elif ap_ + df != tot:
                erros.append(f"{nome}: apresentação {ap_} + definições {df} = {ap_ + df} min, mas o bloco tem {tot} min — a conta precisa fechar")
        # a conta das dinâmicas precisa fechar
        if lay == "dinamica":
            esperado = para_int(a.get("data-min"))
            soma = sum(para_int(x) or 0 for x in s["passos"])
            if esperado is None:
                erros.append(f"{nome}: dinâmica sem data-min (tempo do bloco)")
            elif not s["passos"]:
                erros.append(f"{nome}: dinâmica sem .passo[data-min]")
            elif soma != esperado:
                erros.append(f"{nome}: os passos somam {soma} min, mas a dinâmica tem {esperado} min — a conta precisa fechar")

    if final and n_modelos:
        erros.append(f"{n_modelos} tela(s) ainda marcadas data-modelo — remova o atributo ao inserir o conteúdo real")
    elif n_modelos and not modelos:
        avisos.append(f"{n_modelos} tela(s) em modo modelo (data-modelo)")

    for req in ("ferramentas/casca.html", "dados/esquema.json", "assets/img/sprite-logo.svg", "assets/img/sprite-icones.svg",
                "assets/img/logo-informa-branco.svg", "assets/fontes/fontes.css"):
        if not (RAIZ / req).exists():
            erros.append(f"arquivo obrigatório ausente: {req}")

    # contrato das telas interativas e da agenda (precisa do esquema)
    esquema = carregar_esquema(erros)
    validar_telas(todos, esquema, erros)
    validar_fluxos(todos, erros)
    if not parcial:
        validar_nuvens(todos, esquema, erros)
        # no catálogo de modelos a agenda e os tempos são ilustrativos: só a estrutura dos blocos é conferida
        validar_blocos(todos, erros, avisos, final, ilustrativo=modelos)
        if not modelos:
            validar_encerramentos(todos, erros)
            validar_pausas(todos, erros, avisos, final)
    if erros:
        return erros, avisos, None, len(todos)

    sementes = preparar_dados(esquema, erros, avisos, criar=criar_dados, final=final)
    if erros:
        return erros, avisos, None, len(todos)
    if not modelos:
        validar_sementes_decisoes(todos, sementes, erros, avisos, final)
        if erros:
            return erros, avisos, None, len(todos)

    css_links = "\n".join(f'<link rel="stylesheet" href="{href(p)}">' for p in ordenar(ASSETS / "css", "css", so))
    js_scripts = "\n".join(f'<script defer src="{href(p)}"></script>' for p in ordenar(ASSETS / "js", "js", so))
    sprite = miolo_svg(ASSETS / "img/sprite-logo.svg") + "\n" + miolo_svg(ASSETS / "img/sprite-icones.svg")
    # build de teste fora da raiz: <base> para achar assets; sem CSP (base-uri 'self' bloquearia)
    valores = {
        "CSP": "" if teste else f'<meta http-equiv="Content-Security-Policy" content="{CSP}">',
        "BASE": f'<base href="{RAIZ.as_uri()}/">' if teste else "",
        "TITULO": TITULO + (" · catálogo de modelos" if modelos else ""),
        "CSS_LINKS": css_links,
        "SPRITE": sprite,
        "SLIDES": "\n".join(partes),
        "DADOS_ESQUEMA": json_seguro({"tabelas": esquema["tabelas"]}),
        "DADOS_SEMENTES": json_seguro(sementes),
        "JS_SCRIPTS": js_scripts,
    }
    casca = ler(FERR / "casca.html")
    # UMA passada sobre a casca: o texto injetado (slides, CSV) nunca é re-lido como marcador, então um CSV ou slide
    # contendo "{{JS_SCRIPTS}}" não quebra o build.
    desconhecidos = sorted({m for m in re.findall(r"\{\{([A-Z_]+)\}\}", casca) if m not in valores})
    if desconhecidos:
        return [f"casca.html: placeholders sem valor: {['{{' + d + '}}' for d in desconhecidos]}"], avisos, None, len(todos)
    html = re.sub(r"\{\{([A-Z_]+)\}\}", lambda m: valores[m.group(1)], casca)
    return [], avisos, html, len(todos)


def bytes_saida(html: str) -> bytes:
    """Saída sempre em LF, UTF-8 sem BOM."""
    return html.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8")


def verificar(final: bool):
    """Monta deck e catálogo em memória e compara com index.html e catalogo.html; exit 1 se defasados."""
    defasados, todos_erros = [], []
    for modelos, alvo, cmd in ((False, RAIZ / "index.html", "python ferramentas/montar.py"),
                               (True, RAIZ / "catalogo.html", "python ferramentas/montar.py --modelos")):
        erros, avisos, html, n = construir(modelos=modelos, final=final and not modelos)
        for a in avisos:
            print("  aviso:", a)
        if erros:
            todos_erros += [f"{alvo.name}: {e}" for e in erros]
            continue
        novo = bytes_saida(html)
        if not alvo.exists():
            defasados.append(f"{alvo.name} não existe — rode {cmd}")
            continue
        atual = alvo.read_bytes().replace(b"\r\n", b"\n")      # CRLF de checkout não conta como defasagem
        if atual == novo:
            print(f"  ok   : {alvo.name} em dia com as fontes ({n} telas)")
            continue
        a_, n_ = atual.decode("utf-8", "replace").split("\n"), novo.decode("utf-8", "replace").split("\n")
        dif = next((i for i, (x, y) in enumerate(zip(a_, n_)) if x != y), min(len(a_), len(n_)))
        total = sum(1 for x, y in zip(a_, n_) if x != y) + abs(len(a_) - len(n_))
        trecho = (n_[dif] if dif < len(n_) else "(fim)")[:110]
        defasados.append(f"{alvo.name} defasado ({total} linha(s) diferentes; 1ª na linha {dif + 1}: {trecho.strip()}…) — rode {cmd}")
    for e in todos_erros:
        print("  ERRO :", e)
    for d in defasados:
        print("  DEFASADO:", d)
    if todos_erros or defasados:
        print(f"\nFALHOU — {len(todos_erros)} erro(s), {len(defasados)} arquivo(s) defasado(s). Rode: python ferramentas/montar.py "
              f"(e python ferramentas/montar.py --modelos).")
        sys.exit(1)
    print("\nOK — index.html e catalogo.html correspondem às fontes.")
    sys.exit(0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--final", action="store_true")
    ap.add_argument("--modelos", action="store_true")
    ap.add_argument("--verificar", action="store_true", help="monta em memória e compara com index.html e catalogo.html (exit 1 se defasados)")
    ap.add_argument("--saida")
    ap.add_argument("--so", help="layouts separados por vírgula (+ núcleo); para trabalho em paralelo")
    ap.add_argument("--arquivos", help="padrões glob (vírgula) dos arquivos de conteudo/slides a incluir, ex.: '2*,30-*' — para teste isolado")
    args = ap.parse_args()
    so = {x.strip() for x in args.so.split(",")} if args.so else None
    if so and args.final:
        sys.exit("--so não combina com --final")
    if args.modelos and args.final:
        sys.exit("--modelos não combina com --final")
    if so and not so <= LAYOUTS:
        sys.exit(f"--so: layout(s) desconhecido(s): {sorted(so - LAYOUTS)}")
    if args.arquivos and args.final:
        sys.exit("--arquivos não combina com --final")
    if args.verificar and (args.saida or so or args.arquivos or args.modelos):
        sys.exit("--verificar não combina com --saida, --so, --arquivos nem --modelos (ele confere index.html e catalogo.html)")
    if args.verificar:
        return verificar(args.final)
    pads = [x.strip() for x in args.arquivos.split(",") if x.strip()] if args.arquivos else None

    erros, avisos, html, n = construir(modelos=args.modelos, final=args.final, so=so, pads=pads, teste=bool(args.saida),
                                       criar_dados=not (args.saida or so or args.modelos))
    if erros:
        return sair(erros, avisos, None)

    if args.saida:
        destino = Path(args.saida)
    else:
        destino = RAIZ / ("catalogo.html" if args.modelos else "index.html")
        if not args.modelos:
            (RAIZ / ".nojekyll").touch()
    destino.parent.mkdir(parents=True, exist_ok=True)
    dados = bytes_saida(html)
    destino.write_bytes(dados)
    return sair([], avisos, (destino, n, len(dados)))


def sair(erros, avisos, ok):
    for a in avisos:
        print("  aviso:", a)
    for e in erros:
        print("  ERRO :", e)
    if erros:
        print(f"\nFALHOU — {len(erros)} erro(s).")
        sys.exit(1)
    destino, n, tam = ok
    print(f"OK — {n} telas · index {tam/1024:.0f} KB · {destino}")
    sys.exit(0)


if __name__ == "__main__":
    main()
