
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = {
      ci: 0,
      cat: 'all',
      onlyNew: false,
      onlyPossible: false,
      onlyPin: false,
      onlyNow: false,
      picked: ['A1', 'A3', 'B1', 'B7', 'C1', 'D1', 'E1', 'F1', 'G1']
    };
  }

  rand(seed) {
    var s = seed;
    return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  }

  seedOf(id) {
    var s = 7, i;
    for (i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) % 100003;
    return s + 11;
  }

  // 미니 격자. 모양마다 규칙이 다르다 — 한 해(공백 있는 밀도), 리듬(밤 봉우리),
  // 드문 사건(갈아탄 밤), 띠(밤샘).
  cellsOf(it) {
    var r = this.rand(this.seedOf(it.id));
    var cols = it.cols, rows = it.cmode === 'year' || it.cmode === 'rhythm' ? 7 : 5;
    var out = [], c, y, v, gapFrom = Math.floor(cols * 0.55), gapTo = gapFrom + 3;
    for (y = 0; y < rows; y++) {
      for (c = 0; c < cols; c++) {
        if (it.cmode === 'year') {
          v = (c >= gapFrom && c < gapTo) ? r() * 0.08 : r() * (y === 0 || y === 6 ? 1.3 : 1);
        } else if (it.cmode === 'rhythm') {
          v = Math.exp(-Math.pow((c - cols * 0.78) / (cols * 0.16), 2)) * (0.55 + r() * 0.8);
        } else if (it.cmode === 'sparse') {
          v = r() < 0.22 ? 0.6 + r() * 0.5 : r() * 0.18;
        } else {
          v = (y === 1 || y === 2) ? 0.5 + r() * 0.6 : r() * 0.22;
        }
        out.push({ v: v, i: out.length });
      }
    }
    var sorted = out.slice().sort(function (a, b) { return a.v - b.v; });
    var zeros = Math.round(out.length * (it.cmode === 'sparse' ? 0.78 : it.cmode === 'night' ? 0.62 : 0.42));
    var rest = out.length - zeros;
    var c1 = Math.round(rest * 0.38), c2 = Math.round(rest * 0.27), c3 = Math.round(rest * 0.2);
    var res = new Array(out.length), k, lv;
    for (k = 0; k < sorted.length; k++) {
      if (k < zeros) lv = 0;
      else if (k < zeros + c1) lv = 1;
      else if (k < zeros + c1 + c2) lv = 2;
      else if (k < zeros + c1 + c2 + c3) lv = 3;
      else lv = 4;
      res[sorted[k].i] = { l: lv };
    }
    return res;
  }

  thumbOf(it) {
    var t = {
      kNum: it.kind === 'num', kBars: it.kind === 'bars', kCells: it.kind === 'cells',
      kDots: it.kind === 'dots', kLine: it.kind === 'line', kRing: it.kind === 'ring',
      kSpan: it.kind === 'span', kNet: it.kind === 'net', kText: it.kind === 'text',
      kArea: it.kind === 'area'
    };
    if (t.kNum || t.kRing) { t.tnum = it.tnum; t.tsub = it.tsub; }
    if (t.kBars) t.bars = it.bw.map(function (w) { return { w: w + '%' }; });
    if (t.kCells) { t.cols = it.cols; t.cells = this.cellsOf(it); }
    if (t.kDots) t.dots = it.dots.map(function (s, i) {
      return { s: s + 'px', o: String(Math.max(0.35, 1 - i * 0.11)) };
    });
    if (t.kLine) t.paths = it.lp.map(function (vals, pi) {
      return {
        c: LINEC[pi % LINEC.length],
        pts: vals.map(function (v, i) {
          return (i / (vals.length - 1) * 118 + 1).toFixed(1) + ',' + (42 - v * 38).toFixed(1);
        }).join(' ')
      };
    });
    if (t.kArea) {
      var n = it.lp[0].length, base = new Array(n).fill(0);
      t.bands = it.lp.map(function (vals, bi) {
        var top = [], bot = [], i, x;
        for (i = 0; i < n; i++) {
          x = (i / (n - 1) * 120).toFixed(1);
          top.push(x + ',' + (44 - (base[i] + vals[i]) / 2.4 * 40).toFixed(1));
          bot.push(x + ',' + (44 - base[i] / 2.4 * 40).toFixed(1));
          base[i] = base[i] + vals[i];
        }
        return { c: LINEC[bi % LINEC.length], pts: top.concat(bot.reverse()).join(' ') };
      });
    }
    if (t.kRing) t.dash = (it.pct / 100 * 106.8).toFixed(1) + ' 106.8';
    if (t.kSpan) t.segs = it.segs.map(function (s) {
      return { l: s[0] + '%', w: s[1] + '%', c: SEGC[s[2] || 1] };
    });
    if (t.kNet) {
      var pos = [[14, 12], [40, 30], [66, 10], [92, 26], [30, 38], [78, 38]];
      var pairs = [[0, 1], [1, 2], [2, 3], [1, 4], [3, 5], [4, 5], [0, 4]];
      t.nodes = pos.map(function (p, i) { return { x: p[0], y: p[1], r: i < 3 ? 4 : 3 }; });
      t.edges = pairs.map(function (q) {
        return { x1: pos[q[0]][0], y1: pos[q[0]][1], x2: pos[q[1]][0], y2: pos[q[1]][1] };
      });
    }
    if (t.kText) t.words = it.words.map(function (w, i) {
      return { t: w, o: String(Math.max(0.45, 1 - i * 0.14)) };
    });
    return t;
  }

  renderVals() {
    var self = this;
    var st = this.state;
    var ch = CHS[st.ci];
    var chFull = ch.mode === 'full';
    var picked = st.picked;

    var possible = COMPS.filter(function (c) { return c.mode !== 'full' || chFull; });

    var shown = COMPS.filter(function (c) {
      if (st.cat !== 'all' && c.cat !== st.cat) return false;
      if (st.onlyNew && !c.neu) return false;
      if (st.onlyPin && !c.pin) return false;
      if (st.onlyNow && (c.v || 'soon') !== 'now') return false;
      if (st.onlyPossible && c.mode === 'full' && !chFull) return false;
      return true;
    });

    var rows = [], seenCat = {}, firstHead = true;
    shown.forEach(function (c) {
      if (!seenCat[c.cat]) {
        seenCat[c.cat] = 1;
        var meta = CATS.filter(function (x) { return x.id === c.cat; })[0];
        rows.push({ isHead: true, isComp: false, name: meta.name, desc: meta.desc,
                    first: firstHead ? 'first' : '' });
        firstHead = false;
      }
      var on = picked.indexOf(c.id) >= 0;
      var row = {
        isHead: false, isComp: true,
        name: c.name, desc: c.desc, key: c.key, src: c.src,
        isNew: c.neu === 1, needFull: c.mode === 'full', pinnable: c.pin === 1,
        v: c.v || 'soon', vLabel: VLABEL[c.v || 'soon'], vnote: c.vnote || '',
        picked: on ? 'on' : 'off', btn: on ? '담김' : '담기',
        toggle: function () {
          var next = picked.slice(), i = next.indexOf(c.id);
          if (i >= 0) next.splice(i, 1); else next.push(c.id);
          self.setState({ picked: next });
        }
      };
      var th = self.thumbOf(c);
      Object.keys(th).forEach(function (k) { row[k] = th[k]; });
      rows.push(row);
    });

    var cats = [{ id: 'all', name: '전체', n: COMPS.length }].concat(CATS.map(function (x) {
      return { id: x.id, name: x.name, n: COMPS.filter(function (c) { return c.cat === x.id; }).length };
    })).map(function (x) {
      return {
        name: x.name, n: x.n, on: st.cat === x.id ? 'on' : 'off',
        pick: function () { self.setState({ cat: x.id }); }
      };
    });

    var trayItems = picked.map(function (id, i) {
      var c = COMPS.filter(function (x) { return x.id === id; })[0];
      return {
        no: i < 9 ? '0' + (i + 1) : String(i + 1),
        name: c.name,
        chLabel: c.mode === 'full' && !chFull ? 'full 필요 · 이 채널에서는 막힘'
               : (c.pin === 1 ? ch.name + ' 한정' : ''),
        remove: function () {
          var next = picked.slice();
          next.splice(next.indexOf(id), 1);
          self.setState({ picked: next });
        }
      };
    });

    return {
      themeClass: this.props.theme === '다크' ? 'dark' : '',
      rows: rows,
      cats: cats,
      picked: trayItems,
      pickN: picked.length,
      noPick: picked.length === 0,
      possibleN: possible.length,
      chName: ch.name,
      chMode: ch.mode,
      nowN: COMPS.filter(function (c) { return c.v === 'now'; }).length,
      newN: COMPS.filter(function (c) { return c.neu === 1; }).length,
      pinN: COMPS.filter(function (c) { return c.pin === 1; }).length,
      partialN: COMPS.filter(function (c) { return c.v === 'partial'; }).length,
      soonN: COMPS.filter(function (c) { return c.v === 'soon'; }).length,
      fNowOn: st.onlyNow ? 'on' : 'off',
      toggleNow: function () { self.setState({ onlyNow: !st.onlyNow }); },
      fNewOn: st.onlyNew ? 'on' : 'off',
      fPossibleOn: st.onlyPossible ? 'on' : 'off',
      fPinOn: st.onlyPin ? 'on' : 'off',
      toggleNew: function () { self.setState({ onlyNew: !st.onlyNew }); },
      togglePossible: function () { self.setState({ onlyPossible: !st.onlyPossible }); },
      togglePin: function () { self.setState({ onlyPin: !st.onlyPin }); },
      channels: CHS.map(function (x, i) {
        return {
          name: x.name, on: i === st.ci ? 'on' : 'off',
          pick: function () { self.setState({ ci: i }); }
        };
      })
    };
  }
}
