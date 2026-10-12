// ==UserScript==
// @name         Pommu X Embed
// @namespace    https://github.com/4STRA1/pommu-x-embed
// @version      1.1.0
// @description  Pommuの投稿内にあるx.comのポストリンクを埋め込み表示します(引用リポストは引用部分も表示)
// @author       4STRA1
// @license      MIT
// @homepageURL  https://github.com/4STRA1/pommu-x-embed
// @supportURL   https://github.com/4STRA1/pommu-x-embed/issues
// @updateURL    https://raw.githubusercontent.com/4STRA1/pommu-x-embed/main/pommu-x-embed.user.js
// @downloadURL  https://raw.githubusercontent.com/4STRA1/pommu-x-embed/main/pommu-x-embed.user.js
// @match        https://ch.dlsite.com/pommu/*
// @grant        GM_xmlhttpRequest
// @connect      api.fxtwitter.com
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  // x.com / twitter.com のポストURL
  const STATUS_RE = /(?:^|[\/.])(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status(?:es)?\/(\d+)/i;

  // ---------- スタイル ----------
  const style = document.createElement('style');
  style.textContent = `
    .xe-embed{margin:8px 0;max-width:560px}
    .xe-card{border:1px solid rgba(128,128,128,.4);border-radius:12px;padding:10px 12px;
      font-size:14px;line-height:1.5;color:inherit;box-sizing:border-box;overflow:hidden}
    .xe-card a{color:inherit;text-decoration:none}
    .xe-quote{margin-top:8px;border-radius:10px}
    .xe-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}
    .xe-avatar{width:32px;height:32px;border-radius:50%;flex:none}
    .xe-name{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .xe-sn{opacity:.6;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .xe-text{white-space:pre-wrap;word-break:break-word;margin:4px 0}
    .xe-text.xe-collapsed{max-height:7.5em;overflow:hidden}
    .xe-toggle{display:block;margin:0 0 4px;padding:0;border:0;background:none;color:inherit;
      opacity:.7;font-size:12px;text-decoration:underline;cursor:pointer}
    .xe-media{display:grid;gap:4px;margin-top:6px}
    .xe-media.xe-multi{grid-template-columns:repeat(2,1fr)}
    .xe-media img,.xe-media video{width:100%;max-height:360px;border-radius:8px;display:block;object-fit:contain}
    .xe-media.xe-multi img,.xe-media.xe-multi video{object-fit:cover;height:180px}
    .xe-foot{opacity:.6;font-size:12px;margin-top:6px}
    .xe-msg{opacity:.7;font-size:13px}
  `;
  document.head.appendChild(style);

  // ---------- util ----------
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

  // ---------- API (fxtwitter) ----------
  const cache = new Map();
  function fetchTweet(user, id) {
    if (cache.has(id)) return cache.get(id);
    const p = new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://api.fxtwitter.com/${user}/status/${id}`,
        headers: { Accept: 'application/json' },
        timeout: 15000,
        onload: (r) => {
          try {
            const j = JSON.parse(r.responseText);
            if (j && j.tweet) resolve(j.tweet);
            else reject(new Error((j && j.message) || `HTTP ${r.status}`));
          } catch (e) { reject(e); }
        },
        onerror: () => reject(new Error('通信エラー')),
        ontimeout: () => reject(new Error('タイムアウト')),
      });
    });
    cache.set(id, p);
    p.catch(() => cache.delete(id));
    return p;
  }

  // ---------- 描画 ----------
  function renderMedia(t) {
    const items = (t.media && t.media.all) || [];
    if (!items.length) return null;
    const wrap = el('div', 'xe-media' + (items.length > 1 ? ' xe-multi' : ''));
    for (const m of items) {
      if (m.type === 'photo') {
        const a = el('a');
        a.href = m.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        const img = el('img');
        img.src = m.url; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
        a.appendChild(img);
        wrap.appendChild(a);
      } else if (m.type === 'video' || m.type === 'gif') {
        const v = el('video');
        v.src = m.url;
        if (m.thumbnail_url) v.poster = m.thumbnail_url;
        v.controls = true; v.playsInline = true; v.preload = 'metadata';
        if (m.type === 'gif') { v.muted = true; v.loop = true; }
        wrap.appendChild(v);
      }
    }
    return wrap.childElementCount ? wrap : null;
  }

  function renderTweet(t, isQuote) {
    const card = el('div', 'xe-card' + (isQuote ? ' xe-quote' : ''));

    const head = el('a', 'xe-head');
    head.href = t.url; head.target = '_blank'; head.rel = 'noopener noreferrer';
    if (t.author && t.author.avatar_url) {
      const av = el('img', 'xe-avatar');
      av.src = t.author.avatar_url; av.loading = 'lazy'; av.referrerPolicy = 'no-referrer';
      head.appendChild(av);
    }
    const names = el('div');
    names.style.minWidth = '0';
    names.appendChild(el('div', 'xe-name', (t.author && t.author.name) || ''));
    names.appendChild(el('div', 'xe-sn', t.author ? '@' + t.author.screen_name : ''));
    head.appendChild(names);
    card.appendChild(head);

    if (t.text) card.appendChild(el('div', 'xe-text', t.text));
    const media = renderMedia(t);
    if (media) card.appendChild(media);

    // 引用リポストの引用部分(引用の引用は表示しない)
    if (!isQuote && t.quote) card.appendChild(renderTweet(t.quote, true));

    if (t.created_timestamp) {
      card.appendChild(el('div', 'xe-foot', new Date(t.created_timestamp * 1000).toLocaleString('ja-JP')));
    }
    // 埋め込み内のクリックで投稿カード側の遷移が走らないようにする
    card.addEventListener('click', (e) => e.stopPropagation());
    return card;
  }

  // 本文が長い場合は折りたたむ(DOMに挿入後に高さを測って判定)
  function setupCollapse(root) {
    root.querySelectorAll('.xe-text').forEach((txt) => {
      txt.classList.add('xe-collapsed');
      if (txt.scrollHeight <= txt.clientHeight + 1) {
        txt.classList.remove('xe-collapsed');
        return;
      }
      const btn = el('button', 'xe-toggle', '続きを読む');
      btn.type = 'button';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const collapsed = txt.classList.toggle('xe-collapsed');
        btn.textContent = collapsed ? '続きを読む' : '閉じる';
      });
      txt.after(btn);
    });
  }

  // ---------- 検出・挿入 ----------
  function process(root) {
    root.querySelectorAll('a[href]').forEach((a) => {
      if (a.dataset.xeDone || a.closest('.xe-embed')) return;
      const m = STATUS_RE.exec(safeDecode(a.href)) || STATUS_RE.exec(a.textContent || '');
      if (!m) return;
      a.dataset.xeDone = '1';
      const [, user, id] = m;

      // 同じ投稿内で同一ポストを重複表示しない / 複数リンクは順に並べる
      const host = a.closest('p, li, div') || a.parentElement;
      if (!host) return;
      let ref = host;
      while (ref.nextElementSibling && ref.nextElementSibling.classList.contains('xe-embed')) {
        ref = ref.nextElementSibling;
        if (ref.dataset.xeId === id) return;
      }

      const box = el('div', 'xe-embed');
      box.dataset.xeId = id;
      box.appendChild(el('div', 'xe-msg', 'ポストを読み込み中…'));
      ref.after(box);

      fetchTweet(user, id).then(
        (t) => {
          box.replaceChildren(renderTweet(t, false));
          setupCollapse(box);
        },
        (err) => {
          const msg = el('div', 'xe-card xe-msg');
          msg.append(`ポストを取得できませんでした(${err.message}) `);
          const link = el('a', null, 'x.comで開く');
          link.href = `https://x.com/${user}/status/${id}`;
          link.target = '_blank'; link.rel = 'noopener noreferrer';
          msg.appendChild(link);
          box.replaceChildren(msg);
        }
      );
    });
  }

  // ---------- SPA対応 ----------
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => process(document), 300); };

  new MutationObserver((muts) => {
    // 自分が挿入したノードによる変化は無視
    const external = muts.some((m) =>
      [...m.addedNodes].some((n) => !(n.nodeType === 1 && (n.classList.contains('xe-embed') || n.closest('.xe-embed'))))
    );
    if (external) schedule();
  }).observe(document.body, { childList: true, subtree: true });

  process(document);
})();
