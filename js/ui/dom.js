// 작은 DOM 도우미. h('div', { class: 'x', onclick }, '글자', 자식요소, [배열]...)
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// 확인/선택 창. buttons: [{ label, value, primary }] → 고른 value를 돌려주는 Promise
export function dialog(title, body, buttons) {
  return new Promise((resolve) => {
    const close = (v) => { overlay.remove(); resolve(v); };
    const overlay = h('div', { class: 'overlay' },
      h('div', { class: 'dialog' },
        h('h3', {}, title),
        body,
        h('div', { class: 'dialog-buttons' },
          buttons.map((b) => h('button', { class: b.primary ? 'primary' : '', onclick: () => close(b.value) }, b.label)))));
    document.body.append(overlay);
  });
}

// 잠깐 떴다 사라지는 안내
export function toast(text) {
  const el = h('div', { class: 'toast' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}
