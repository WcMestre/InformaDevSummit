/* capturar.cjs — captura cada tela em PNG e roda SUMMIT.auditar() num Chrome real.
 *
 *   npm i puppeteer-core            (uma vez, em qualquer pasta; aponte NODE_PATH para o node_modules)
 *   node ferramentas/capturar.cjs --out <pasta> [--viewport 1920x1080,1366x768] [--telas 1,4,7] [--pdf] [--html <arquivo>]
 *
 * Saídas em --out:  tela-NN-<layout>-<WxH>.png · auditoria-<WxH>.json · (opcional) deck.pdf
 * Código de saída: 0 sempre que capturou; o veredito está no JSON (resumo.comProblema).
 * CSP: o teste de violações vem de graça — o resumo traz violacoesCSP (eventos securitypolicyviolation de toda a captura)
 * e cspAtiva. Só vale para HTML com a meta CSP: o index.html/catalogo.html de `montar.py` tem; um build --saida NÃO tem
 * (cspAtiva:false), então violacoesCSP vazio ali não prova nada.
 */
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');

const arg = (n, def) => { const i = process.argv.indexOf('--' + n); return i < 0 ? def : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const html = path.resolve(arg('html', path.join(__dirname, '..', 'index.html')));
const out = path.resolve(arg('out', path.join(process.cwd(), 'capturas')));
const vps = String(arg('viewport', '1920x1080')).split(',').map(v => v.split('x').map(Number));
const only = arg('telas', null) ? String(arg('telas')).split(',').map(Number) : null;
const chrome = arg('chrome', ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(fs.existsSync));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox', '--font-render-hinting=none'] });
  const resumo = [];
  for (const [w, h] of vps) {
    const page = await browser.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erros.push('console.error: ' + m.text()); });
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    page.on('requestfailed', r => erros.push('requestfailed: ' + r.url().slice(0, 120)));
    // CSP: registra toda violação (estilo inline, imagem data:/blob:, script...) desde o primeiro byte da página
    await page.evaluateOnNewDocument(() => {
      window.__cspViolacoes = [];
      document.addEventListener('securitypolicyviolation', e => window.__cspViolacoes.push(e.violatedDirective + ' bloqueou ' + (e.blockedURI || 'inline') + (e.sample ? ' [' + e.sample.slice(0, 60) + ']' : '')));
    });
    await page.goto('file:///' + html.replace(/\\/g, '/') + '#/1', { waitUntil: 'load' });
    // sem <style> inline: a CSP do index.html (style-src 'self') bloquearia addStyleTag; folha construída via CSSOM não é bloqueada
    await page.evaluate(() => { const f = new CSSStyleSheet(); f.replaceSync('*{transition:none !important}'); document.adoptedStyleSheets = [...document.adoptedStyleSheets, f]; });
    await page.evaluate(() => document.fonts.ready);
    const total = await page.evaluate(() => SUMMIT.total());
    const lista = only || Array.from({ length: total }, (_, i) => i + 1);
    for (const n of lista) {
      const layout = await page.evaluate(i => { SUMMIT.ir(i); const s = SUMMIT.slides[i]; document.getElementById('stage').classList.add('sem-anim'); document.getElementById('dica').classList.add('some'); return s.dataset.layout; }, n - 1);
      await new Promise(r => setTimeout(r, 120));
      await page.screenshot({ path: path.join(out, `tela-${String(n).padStart(2, '0')}-${layout}-${w}x${h}.png`) });
    }
    await page.evaluate(() => document.getElementById('stage').classList.remove('sem-anim'));
    const aud = await page.evaluate(() => SUMMIT.auditar());
    fs.writeFileSync(path.join(out, `auditoria-${w}x${h}.json`), JSON.stringify(aud, null, 2));
    const csp = await page.evaluate(() => ({ ativa: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'), violacoes: window.__cspViolacoes || [] }));
    resumo.push({ viewport: `${w}x${h}`, ...aud.resumo, cspAtiva: csp.ativa, violacoesCSP: csp.violacoes, errosPagina: erros });
    if (arg('pdf', false) && w === 1920) {
      await page.emulateMediaType('print');
      await page.pdf({ path: path.join(out, 'deck.pdf'), width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
    }
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify(resumo, null, 2));
})().catch(e => { console.error('FALHA:', e); process.exit(2); });
