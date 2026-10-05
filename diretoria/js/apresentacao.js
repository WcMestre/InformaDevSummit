/* Apresentação para a diretoria — navegação, escala do palco e medidas dos gráficos.
   Script clássico (funciona por file://). Estilo só pelo CSSOM, que a CSP permite. */
(function () {
  'use strict';

  var stage = document.getElementById('stage');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var elAtual = document.querySelector('[data-moldura-atual]');
  var elTotal = document.querySelector('[data-moldura-total]');
  var elProgresso = document.querySelector('[data-moldura-progresso]');
  var elFonte = document.querySelector('[data-moldura-fonte]');
  var fontePadrao = elFonte.textContent;
  var atual = 0;

  /* O palco tem 1920×1080 fixos; a escala o encaixa em qualquer janela. */
  function ajustarEscala() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.setProperty('--s', String(s));
  }

  /* Gráficos: as larguras vêm dos data-* do HTML, para o HTML ser a única fonte dos números.
     <ol data-max> define o fundo de escala; <div.barra data-total> a barra; <i.seg data-valor> o segmento. */
  function medirGraficos() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-max]'), function (grafico) {
      var max = Number(grafico.getAttribute('data-max'));
      Array.prototype.forEach.call(grafico.querySelectorAll('.barra'), function (barra) {
        var total = Number(barra.getAttribute('data-total'));
        barra.style.setProperty('--v', String((total / max) * 100));
        Array.prototype.forEach.call(barra.querySelectorAll('.seg'), function (seg) {
          seg.style.setProperty('--n', seg.getAttribute('data-valor'));
        });
      });
    });
  }

  function ir(n) {
    atual = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach(function (s, i) { s.classList.toggle('ativo', i === atual); });
    elAtual.textContent = String(atual + 1);
    elFonte.textContent = slides[atual].getAttribute('data-fonte') || fontePadrao;
    elProgresso.style.setProperty('--p', String(((atual + 1) / slides.length) * 100));
    try { history.replaceState(null, '', '#' + (atual + 1)); } catch (e) { /* file:// restrito: ignora */ }
  }

  function lerHash() {
    var n = parseInt(location.hash.slice(1), 10);
    return isNaN(n) ? 0 : n - 1;
  }

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
        e.preventDefault(); ir(atual + 1); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); ir(atual - 1); break;
      case 'Home': ir(0); break;
      case 'End': ir(slides.length - 1); break;
      case 'f': case 'F':
        if (document.fullscreenElement) { document.exitFullscreen(); }
        else if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen(); }
        break;
    }
  });

  /* clique: metade direita avança, esquerda volta */
  stage.addEventListener('click', function (e) {
    if (e.target.closest('[data-interativo]')) return;
    var r = stage.getBoundingClientRect();
    ir(e.clientX - r.left > r.width / 2 ? atual + 1 : atual - 1);
  });

  window.addEventListener('resize', ajustarEscala);
  window.addEventListener('hashchange', function () { ir(lerHash()); });

  elTotal.textContent = String(slides.length);
  ajustarEscala();
  medirGraficos();
  ir(lerHash());
})();
