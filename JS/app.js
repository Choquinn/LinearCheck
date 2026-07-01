// app.js
// Liga a interface (textarea, chave, botões) à lógica pura de solver.js.

(function () {
  'use strict';

  var equationsEl = document.getElementById('equations');
  var braceWrap = document.querySelector('.brace-wrap');
  var braceSvg = document.getElementById('brace');
  var bracePath = braceSvg.querySelector('path');

  var solveBtn = document.getElementById('solveBtn');
  var clearBtn = document.getElementById('clearBtn');
  var showStepsCheckbox = document.getElementById('showSteps');

  var errorMsg = document.getElementById('errorMsg');
  var resultsEl = document.getElementById('results');
  var variablesListEl = document.getElementById('variablesList');
  var initialMatrixEl = document.getElementById('initialMatrix');
  var stepsBlockEl = document.getElementById('stepsBlock');
  var stepsListEl = document.getElementById('stepsList');
  var solutionEl = document.getElementById('solution');

  var lastData = null;

  // ---------- Textarea que cresce sozinha ----------

  function autoResizeTextarea() {
    equationsEl.style.height = 'auto';
    equationsEl.style.height = (equationsEl.scrollHeight + 2) + 'px';
  }

  // ---------- Chave em SVG, redesenhada conforme a altura ----------

  var BRACE_WIDTH = 24; // precisa bater com o viewBox e o CSS de .brace

  function buildBracePath(height) {
    var inset = 2;
    var top = inset;
    var bottom = height - inset;
    var mid = height / 2;

    var rightX = BRACE_WIDTH - inset; // 22
    var leftX = inset;                // 2
    var midX = 11;                    // Eixo principal vertical da chave

    // "q" define o raio/comprimento das curvas. Aumentado para até 24px
    // para dar um visual super elegante, alongado e contínuo
    var q = Math.min(24, (mid - top) / 2);

    return (
      // Curva superior (usando Cubic Bezier 'C' para transição perfeita de tangentes)
      'M ' + rightX + ',' + top + ' ' +
      'C ' + midX + ',' + top + ' ' + midX + ',' + (top + q * 0.6) + ' ' + midX + ',' + (top + q) + ' ' +
      
      // Linha reta do meio, se houver espaço
      'L ' + midX + ',' + (mid - q) + ' ' +
      
      // Bico central superior
      'C ' + midX + ',' + (mid - q * 0.3) + ' ' + leftX + ',' + (mid - q * 0.2) + ' ' + leftX + ',' + mid + ' ' +
      
      // Bico central inferior
      'C ' + leftX + ',' + (mid + q * 0.2) + ' ' + midX + ',' + (mid + q * 0.3) + ' ' + midX + ',' + (mid + q) + ' ' +
      
      // Linha reta de baixo
      'L ' + midX + ',' + (bottom - q) + ' ' +
      
      // Curva inferior
      'C ' + midX + ',' + (bottom - q * 0.6) + ' ' + midX + ',' + bottom + ' ' + rightX + ',' + bottom
    );
  }

  function updateBrace() {
    // Usa a altura da textarea 
    var height = equationsEl.offsetHeight;
    if (height <= 0) return;
    
    // Iguala a altura do container da chave e do SVG ao da textarea
    braceWrap.style.height = height + 'px';
    braceSvg.style.height = height + 'px';
    
    braceSvg.setAttribute('viewBox', '0 0 ' + BRACE_WIDTH + ' ' + height);
    bracePath.setAttribute('d', buildBracePath(height));
  }

  function refreshInputSize() {
    autoResizeTextarea();
    updateBrace();
  }

  equationsEl.addEventListener('input', refreshInputSize);

  // Reage também a redimensionamentos que não vêm do "input" (zoom, fonte, janela)
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(updateBrace).observe(braceWrap);
  } else {
    window.addEventListener('resize', updateBrace);
  }

  window.addEventListener('load', refreshInputSize);
  // Garante uma primeira chamada mesmo se 'load' já tiver passado.
  refreshInputSize();

  // Atalho: Ctrl+Enter (ou Cmd+Enter no Mac) resolve o sistema.
  equationsEl.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      solveBtn.click();
    }
  });

  // ---------- Helpers de exibição ----------

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatCell(n) {
    var r = LinearSolver.formatNumber(n);
    if (Number.isInteger(r)) return String(r);
    return r.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }

  function matrixToHTML(matrix, variables) {
    var cols = variables.length + 1;
    var html = '<div class="matrix-grid" style="grid-template-columns: repeat(' + cols + ', auto);">';
    variables.forEach(function (v) {
      html += '<div class="matrix-head">' + escapeHtml(v) + '</div>';
    });
    html += '<div class="matrix-head matrix-head--const">=</div>';
    matrix.forEach(function (row) {
      row.forEach(function (val, i) {
        var isLast = i === row.length - 1;
        html += '<div class="matrix-cell' + (isLast ? ' matrix-cell--const' : '') + '">' +
          formatCell(val) + '</div>';
      });
    });
    html += '</div>';
    return html;
  }

  function stepLabel(step) {
    if (step.type === 'swap') {
      return 'Troca a linha ' + step.rowA + ' com a linha ' + step.rowB + ' (maior pivô)';
    }
    if (step.type === 'normalize') {
      return 'Divide a linha ' + step.row + ' por ' + step.factor;
    }
    return 'Linha ' + step.row + ' = Linha ' + step.row + ' \u2212 (' + step.factor + ') \u00d7 Linha ' + step.base;
  }

  function stepsToHTML(steps, variables) {
    return steps.map(function (step, i) {
      return (
        '<div class="step">' +
        '<p class="step__label"><span class="step__index">' + (i + 1) + '.</span> ' +
        escapeHtml(stepLabel(step)) + '</p>' +
        matrixToHTML(step.matrix, variables) +
        '</div>'
      );
    }).join('');
  }

  function solutionToHTML(result, variables) {
    if (result.type === 'impossivel') {
      return '<p class="solution__msg solution__msg--impossivel">' +
        'O sistema não tem solução: as linhas ficaram inconsistentes depois do escalonamento.' +
        '</p>';
    }

    if (result.type === 'unica') {
      var items = variables.map(function (v) {
        return '<li><span class="var">' + escapeHtml(v) + '</span> = <span class="val">' +
          formatCell(result.values[v]) + '</span></li>';
      }).join('');
      return '<p class="solution__msg solution__msg--unica">Solução única:</p>' +
        '<ul class="solution__list">' + items + '</ul>';
    }

    // infinitas
    var rows = variables.map(function (v) {
      if (result.expressions[v] !== undefined) {
        return '<li><span class="var">' + escapeHtml(v) + '</span> = ' +
          escapeHtml(result.expressions[v]) + '</li>';
      }
      return '<li><span class="var">' + escapeHtml(v) + '</span> = <span class="free">livre</span></li>';
    }).join('');

    return '<p class="solution__msg solution__msg--infinitas">' +
      'O sistema tem infinitas soluções. Variável(is) livre(s): ' +
      escapeHtml(result.freeVariables.join(', ')) + '.</p>' +
      '<ul class="solution__list">' + rows + '</ul>';
  }

  // ---------- Renderização principal ----------

  function renderResults(data) {
    variablesListEl.textContent = data.variables.join(', ');
    initialMatrixEl.innerHTML = matrixToHTML(data.matrix, data.variables);
    stepsListEl.innerHTML = stepsToHTML(data.steps, data.variables);
    solutionEl.innerHTML = solutionToHTML(data.result, data.variables);

    stepsBlockEl.hidden = !showStepsCheckbox.checked;
    resultsEl.hidden = false;
  }

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.hidden = false;
    resultsEl.hidden = true;
  }

  function clearError() {
    errorMsg.hidden = true;
  }

  // ---------- Eventos ----------

  solveBtn.addEventListener('click', function () {
    clearError();
    try {
      lastData = LinearSolver.solve(equationsEl.value);
      renderResults(lastData);
    } catch (err) {
      lastData = null;
      showError(err.message);
    }
  });

  clearBtn.addEventListener('click', function () {
    equationsEl.value = '';
    refreshInputSize();
    clearError();
    resultsEl.hidden = true;
    lastData = null;
    equationsEl.focus();
  });

  showStepsCheckbox.addEventListener('change', function () {
    if (!lastData) return;
    stepsBlockEl.hidden = !showStepsCheckbox.checked;
  });
})();

const savedText = localStorage.getItem('name');
document.getElementById('name').textContent = savedText || '[name]';