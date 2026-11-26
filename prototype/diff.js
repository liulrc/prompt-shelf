(function (root) {
  'use strict';

  const MAX_EDITS = 160;
  const simpleText = /^[\x20-\x7e\n\t\u3400-\u4dbf\u4e00-\u9fff，。！？、；：“”‘’《》〈〉【】（）「」…—]*$/u;
  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter(undefined, {granularity: 'grapheme'}) : null;

  function units(text) {
    // ASCII and common Chinese characters are already single UTF-16 units.
    if (simpleText.test(text)) return text;
    return segmenter ? Array.from(segmenter.segment(text), part => part.segment) : Array.from(text);
  }

  function slice(sequence, start, end) {
    const part = sequence.slice(start, end);
    return typeof part === 'string' ? part : part.join('');
  }

  function append(chunks, type, text) {
    if (!text) return;
    const previous = chunks[chunks.length - 1];
    if (previous?.type === type) previous.text += text;
    else chunks.push({type, text});
  }

  // An append may end in the very same punctuation as the original sentence.
  // Keep that sentence ending in place when either alignment is equally valid.
  function alignSentences(chunks) {
    const aligned = [];
    const punctuation = /^[。！？.!?…]+[”’」』）"'»)]*/u;
    function boundary(text, index) {
      if (!segmenter || index === 0 || index === text.length) return true;
      const part = segmenter.segment(text).containing(index - 1);
      return part.index + part.segment.length === index;
    }
    for (let i = 0; i < chunks.length; i++) {
      const edit = chunks[i];
      const next = chunks[i + 1];
      if (edit.type !== 'equal' && next?.type === 'equal') {
        const mark = next.text.match(punctuation)?.[0];
        if (mark) {
          const endsText = i + 2 === chunks.length && next.text === mark;
          let pos = edit.text.indexOf(mark);
          while (pos !== -1) {
            const end = pos + mark.length;
            if (end < edit.text.length && ((endsText && pos === 0) || edit.text[end] === '\n' || edit.text[end] === '\r')
                && boundary(edit.text, pos) && boundary(edit.text, end) && boundary(next.text, mark.length)) {
              append(aligned, edit.type, edit.text.slice(0, pos));
              append(aligned, 'equal', mark);
              append(aligned, edit.type, edit.text.slice(end) + mark);
              append(aligned, 'equal', next.text.slice(mark.length));
              i++;
              break;
            }
            pos = edit.text.indexOf(mark, end);
          }
          if (pos !== -1) continue;
        }
      }
      append(aligned, edit.type, edit.text);
    }
    return aligned;
  }

  function compare(original, current) {
    const before = String(original ?? '');
    const after = String(current ?? '');
    if (before === after) return before ? [{type: 'equal', text: before}] : [];
    if (!before) return [{type: 'insert', text: after}];
    if (!after) return [{type: 'delete', text: before}];
    const left = units(before);
    const right = units(after);
    const result = [];
    const size = left.length + right.length;
    let editBudget = Math.min(2000000, 200000 + size * 3);
    let anchorBudget = 6 * size + 2048;

    function emit(type, text) {
      append(result, type, text);
    }

    // Use Myers' shortest edit script for sparse changes. Store only the small
    // diagonal frontier at each distance, never a text-length-squared matrix.
    function sparseDiff(a0, a1, b0, b1) {
      const n = a1 - a0;
      const m = b1 - b0;
      const limit = Math.min(n + m, MAX_EDITS);
      if (Math.abs(n - m) > limit || editBudget <= 0) return false;
      const trace = [];
      let previous;
      for (let d = 0; d <= limit; d++) {
        const row = new Int32Array(2 * d + 1);
        editBudget -= d + 1;
        if (editBudget <= 0) return false;
        for (let k = -d; k <= d; k += 2) {
          const insertion = k === -d || (k !== d && previous[d + k - 2] < previous[d + k]);
          let x = d === 0 ? 0 : insertion ? previous[d + k] : previous[d + k - 2] + 1;
          let y = x - k;
          const start = x;
          while (x < n && y < m && left[a0 + x] === right[b0 + y]) { x++; y++; }
          editBudget -= x - start;
          row[d + k] = x;
          if (x >= n && y >= m) {
            // Walk back in runs. A long unchanged span needs only one slice.
            const reverse = [];
            for (let distance = d; distance > 0; distance--) {
              const prev = trace[distance - 1];
              const diagonal = x - y;
              const down = diagonal === -distance || (diagonal !== distance
                && prev[distance + diagonal - 2] < prev[distance + diagonal]);
              const prevDiagonal = down ? diagonal + 1 : diagonal - 1;
              const prevX = prev[distance - 1 + prevDiagonal];
              const prevY = prevX - prevDiagonal;
              const equalStart = prevX + (down ? 0 : 1);
              if (equalStart < x) reverse.push(['equal', slice(left, a0 + equalStart, a0 + x)]);
              reverse.push(down ? ['insert', right[b0 + prevY]] : ['delete', left[a0 + prevX]]);
              x = prevX;
              y = prevY;
            }
            if (x) emit('equal', slice(left, a0, a0 + x));
            for (let i = reverse.length - 1; i >= 0; i--) emit(...reverse[i]);
            return true;
          }
          if (editBudget <= 0) return false;
        }
        trace.push(row);
        previous = row;
      }
      return false;
    }

    // For dense changes, unique blocks make stable anchors. A longest
    // increasing subsequence keeps anchors in the same order in both texts.
    function anchors(a0, a1, b0, b1, maxWidth = 16) {
      const n = a1 - a0;
      const m = b1 - b0;
      anchorBudget -= n + m;
      if (anchorBudget < 0) return [];
      const width = Math.min(maxWidth, Math.max(4, Math.floor(Math.min(n, m) / 8)));
      if (Math.min(n, m) < width) return [];
      const middleA = (a0 + a1 - width) / 2;
      const middleB = (b0 + b1 - width) / 2;
      const positions = new Map();
      for (let i = a0; i <= a1 - width; i += width) {
        const key = slice(left, i, i + width);
        const known = positions.get(key);
        if (known) {
          known.leftCount++;
          if (Math.abs(i - middleA) < Math.abs(known.a - middleA)) known.a = i;
        } else {
          positions.set(key, {a: i, b: -1, width, leftCount: 1, rightCount: 0});
        }
      }
      for (let j = b0; j <= b1 - width; j++) {
        const candidate = positions.get(slice(right, j, j + width));
        if (candidate) {
          candidate.rightCount++;
          if (candidate.b === -1 || Math.abs(j - middleB) < Math.abs(candidate.b - middleB)) candidate.b = j;
        }
      }
      const tails = [];
      let fallback = null;
      let bestScore = Infinity;
      for (const candidate of positions.values()) {
        if (!candidate.rightCount) continue;
        let matched = 0;
        while (matched < width && left[candidate.a + matched] === right[candidate.b + matched]) matched++;
        if (matched < width) continue;
        const score = candidate.leftCount + candidate.rightCount
          + Math.abs(candidate.a - middleA) / n + Math.abs(candidate.b - middleB) / m;
        if (score < bestScore) { fallback = candidate; bestScore = score; }
        if (candidate.leftCount !== 1 || candidate.rightCount !== 1) continue;
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (tails[mid].b < candidate.b) lo = mid + 1;
          else hi = mid;
        }
        candidate.previous = lo ? tails[lo - 1] : null;
        tails[lo] = candidate;
      }
      if (!tails.length) {
        if (fallback) return [fallback];
        return width > 4 ? anchors(a0, a1, b0, b1, Math.max(4, width >> 1)) : [];
      }
      const ordered = [];
      for (let entry = tails[tails.length - 1]; entry; entry = entry.previous) {
        const next = ordered[ordered.length - 1];
        if (!next || entry.b + width <= next.b) ordered.push(entry);
      }
      return ordered.reverse();
    }

    function diffRange(a0, a1, b0, b1, depth) {
      const head = a0;
      while (a0 < a1 && b0 < b1 && left[a0] === right[b0]) { a0++; b0++; }
      emit('equal', slice(left, head, a0));
      const end = a1;
      while (a0 < a1 && b0 < b1 && left[a1 - 1] === right[b1 - 1]) { a1--; b1--; }
      if (a0 === a1) {
        emit('insert', slice(right, b0, b1));
      } else if (b0 === b1) {
        emit('delete', slice(left, a0, a1));
      } else if (!sparseDiff(a0, a1, b0, b1)) {
        const matches = depth < 16 ? anchors(a0, a1, b0, b1) : [];
        if (matches.length) {
          for (const match of matches) {
            diffRange(a0, match.a, b0, match.b, depth + 1);
            emit('equal', slice(left, match.a, match.a + match.width));
            a0 = match.a + match.width;
            b0 = match.b + match.width;
          }
          diffRange(a0, a1, b0, b1, depth + 1);
        } else {
          emit('delete', slice(left, a0, a1));
          emit('insert', slice(right, b0, b1));
        }
      }
      emit('equal', slice(left, a1, end));
    }

    diffRange(0, left.length, 0, right.length, 0);
    return alignSentences(result);
  }

  const api = {compare};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PromptDiff = api;
})(globalThis);
