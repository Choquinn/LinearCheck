(function (root) {
    'use strict';

    var EPS = 1e-9
    // Separa os termos
    function tokenizeSide(side) {
        var s = side.replace(/\s+/g, '');
        if (s === '') return [];
        if (s[0] !== '+' && s[0] !== '-') s = '+' + s;
        return s.match(/[+-][^+-]+/g) || [];
    }

    // Arruma um termo em específico
    function parseToken(token) {
        var m = token.match(/^([+-])(\d*\.?\d*)([a-zA-Z]\d*)?$/);
        if (!m || (m[2] === '' && !m[3])) {
            throw new Error('Termo inválido: "' + token + '"');
        }
        var sign = m[1] === '-' ? -1 : 1;
        var numPart = m[2];
        var varPart = m[3] || null;
        var magnitude = numPart === '' ? 1 : parseFloat(numPart);
        return varPart
            ? { type: 'var', name: varPart, coef: sign * magnitude }
            : { type: 'const', value: sign * magnitude };
    }

    // Interpreta uma linha
    function parseEquation(line, lineNumber) {
        var eqIndex = line.indexOf('=');
        if (eqIndex === -1) {
            throw new Error('Linha ' + lineNumber + ': faltou o sinal "="');
        }
        var leftRaw = line.slice(0, eqIndex);
        var rightRaw = line.slice(eqIndex + 1);

        var terms = {};
        var constant = 0;

        tokenizeSide(leftRaw).forEach(function (tok) {
            var p = parseToken(tok);
            if (p.type === 'var') terms[p.name] = (terms[p.name] || 0) + p.coef;
            else constant -= p.value;
        });

        tokenizeSide(rightRaw).forEach(function (tok) {
            var p = parseToken(tok);
            if (p.type === 'var') terms[p.name] = (terms[p.name] || 0) - p.coef;
            else constant += p.value;
        });

        if (Object.keys(terms).length === 0) {
            throw new Error('Linha ' + lineNumber + ': nenhuma variável encontrada');
        };

        return { terms: terms, constant: constant, raw: line };
    }

    function compareVarNames(a, b) {
        var ma = a.match(/^([a-zA-Z]+)(\d*)$/);
        var mb = b.match(/^([a-zA-Z]+)(\d*)$/);
        if (ma[1] !== mb[1]) return ma[1].localeCompare(mb[1]);
        var na = ma[2] ? parseInt(ma[2], 10) : -1;
        var nb = mb[2] ? parseInt(mb[2], 10) : -1;
        return na - nb;
    }

    // Lê tudo, descobre o que tiver de var e devolve as equações interpretadas
    function parseSystem(text) {
        var lines = text
            .split('\n')
            .map(function (l) { return l.trim(); })
            .filter(function (l) { return l.length > 0; });

        if (lines.length === 0) {
            throw new Error('Digite pelo menos uma equação');
        } 

        var equations = lines.map(function (line, i) {
            return parseEquation(line, i + 1);
        });

        var varSet = new Set();
        equations.forEach(function (eq) {
            Object.keys(eq.terms).forEach(function (v) { varSet.add(v); });
        });

        var variables = Array.from(varSet).sort(compareVarNames);

        return { equations: equations, variables: variables };
    }

    function buildMatrix(equations, variables) {
        return equations.map(function (eq) {
            var row = variables.map(function (v) { return eq.terms[v] || 0; });
            row.push(eq.constant);
            return row;
        });
    }

    function cloneMatrix(m) {
        return m.map(function (row) { return row.slice(); });
    }

    function formatNumber(n) {
        var rounded = Math.round(n * 1e6) / 1e6;
        return Object.is(rounded, -0) ? 0 : rounded;
    } 

    // Eliminação de Gauss
    function gaussJordan(matrixInput) {
        var matrix = cloneMatrix(matrixInput);
        var rows = matrix.length;
        var cols = matrix[0].length;
        var steps = [];
        var pivotColForRow = [];
        var pivotRow = 0;

        for (var col = 0; col < cols - 1 && pivotRow < rows; col++) {
            var maxRow = pivotRow;
            for (var r = pivotRow + 1; r < rows; r++) {
                if (Math.abs(matrix[r][col]) > Math.abs(matrix[maxRow][col])) maxRow = r;
            }
            
            if (Math.abs(matrix[maxRow][col]) < EPS) continue;

            if (maxRow !== pivotRow) {
                var tmp = matrix[pivotRow];
                matrix[pivotRow] = matrix[maxRow];
                matrix[maxRow] = tmp;
                steps.push({
                    type: 'swap', rowA: pivotRow + 1, rowB: maxRow + 1,
                    matrix: cloneMatrix(matrix)
                });
            }

            var pivotValue = matrix[pivotRow][col];
            if (Math.abs(pivotValue - 1) > EPS) {
                matrix[pivotRow] = matrix[pivotRow].map(function (v) { return v / pivotValue; });
                steps.push({
                    type: 'normalize', row: pivotRow + 1, factor: formatNumber(pivotValue),
                    matrix: cloneMatrix(matrix)
                });
            }

            (function (pr, c) {
                for (var rr = 0; rr < rows; rr++) {
                    if (rr === pr) continue;
                    var factor = matrix[rr][c];
                    if (Math.abs(factor) > EPS) {
                        matrix[rr] = matrix[rr].map(function (v, i) { return v - factor * matrix[pr][i]; });
                        steps.push({
                            type: 'eliminate', row: rr + 1, base: pr + 1, factor: formatNumber(factor),
                            matrix: cloneMatrix(matrix)
                        });
                    }
                }
            })(pivotRow, col);

            pivotColForRow[pivotRow] = col;
            pivotRow++;
        }

        return { matrix: matrix, pivotColForRow: pivotColForRow, rank: pivotRow, steps: steps};
    }

   function classify(reduced, numVars, variables) {
    var matrix = reduced.matrix;
    var rank = reduced.rank;
    var pivotColForRow = reduced.pivotColForRow;
 
    for (var r = 0; r < matrix.length; r++) {
      var allZero = matrix[r].slice(0, numVars).every(function (v) { return Math.abs(v) < EPS; });
      if (allZero && Math.abs(matrix[r][numVars]) > EPS) {
        return { type: 'impossivel' };
      }
    }
 
    var pivotCols = pivotColForRow.slice(0, rank);
    var freeCols = [];
    for (var c = 0; c < numVars; c++) {
      if (pivotCols.indexOf(c) === -1) freeCols.push(c);
    }
 
    if (freeCols.length === 0) {
      var values = {};
      for (var rr = 0; rr < rank; rr++) {
        values[variables[pivotColForRow[rr]]] = formatNumber(matrix[rr][numVars]);
      }
      return { type: 'unica', values: values };
    }
 
    var expressions = {};
    for (var ri = 0; ri < rank; ri++) {
      var pivotCol = pivotColForRow[ri];
      var parts = [];
      var constant = formatNumber(matrix[ri][numVars]);
      var allFreeCoefsZero = freeCols.every(function (fc) { return Math.abs(matrix[ri][fc]) < EPS; });
      if (constant !== 0 || allFreeCoefsZero) {
        parts.push(String(constant));
      }
      freeCols.forEach(function (fc) {
        var coef = formatNumber(-matrix[ri][fc]);
        if (Math.abs(coef) < EPS) return;
        var sign = coef > 0 ? '+' : '-';
        var abs = Math.abs(coef);
        var coefStr = abs === 1 ? '' : String(abs);
        parts.push(sign + ' ' + coefStr + variables[fc]);
      });
      expressions[variables[pivotCol]] = parts.join(' ').replace(/^\+ /, '');
    }
 
    return {
      type: 'infinitas',
      freeVariables: freeCols.map(function (c) { return variables[c]; }),
      expressions: expressions
    };
  }
 
  // ---------- API pública ----------
 
  function solve(text) {
    var parsed = parseSystem(text);
    var matrix = buildMatrix(parsed.equations, parsed.variables);
    var reduced = gaussJordan(matrix);
    var result = classify(reduced, parsed.variables.length, parsed.variables);
    return {
      variables: parsed.variables,
      equations: parsed.equations,
      matrix: matrix,
      steps: reduced.steps,
      reducedMatrix: reduced.matrix,
      result: result
    };
  }
 
  var LinearSolver = {
    parseSystem: parseSystem,
    buildMatrix: buildMatrix,
    gaussJordan: gaussJordan,
    classify: classify,
    solve: solve,
    formatNumber: formatNumber
  };
 
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LinearSolver;
  } else {
    root.LinearSolver = LinearSolver;
  }
})(typeof window !== 'undefined' ? window : globalThis);