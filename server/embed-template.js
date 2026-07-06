// The embeddable widget, served at GET /embed.js. Dependency-free vanilla JS,
// renders entirely inside a shadow root so host page styles never leak in
// (and the widget's styles never leak out). Comment bodies are ALWAYS rendered
// as text nodes — autolinking builds <a> elements programmatically. Never innerHTML
// for user content — that is the whole XSS story for this product.
module.exports = String.raw`(function () {
  'use strict';
  if (window.__chatterboxLoaded) return;
  window.__chatterboxLoaded = true;

  var script = document.currentScript || (function () {
    var s = document.querySelectorAll('script[src*="embed.js"]');
    return s[s.length - 1];
  })();
  if (!script) return;

  var src = script.getAttribute('src') || '';
  var origin;
  try { origin = new URL(src, location.href).origin; } catch (e) { return; }

  var pageIdAttr = script.getAttribute('data-page-id') || '';
  var themeAttr = script.getAttribute('data-theme') || 'auto';
  var accent = script.getAttribute('data-accent') || '#7c5cff';

  function pageKey() {
    if (pageIdAttr) return pageIdAttr;
    var link = document.querySelector('link[rel="canonical"]');
    return (link && link.href) ? link.href : location.href;
  }

  function pageTitle() { return document.title || pageKey(); }

  function token() {
    try {
      var t = localStorage.getItem('cb_token');
      if (!t) {
        t = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
        localStorage.setItem('cb_token', t);
      }
      return t;
    } catch (e) { return 'anon-' + Math.random().toString(36).slice(2, 10); }
  }

  function api(method, path, body, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, origin + path, true);
    xhr.setRequestHeader('X-Chatterbox-Token', token());
    if (body) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var json = null;
      try { json = JSON.parse(xhr.responseText); } catch (e) {}
      if (cb) cb(xhr.status, json);
    };
    xhr.send(body ? JSON.stringify(body) : null);
  }

  function fmtTime(iso) {
    try {
      var d = new Date(iso.indexOf('Z') === -1 ? iso + 'Z' : iso);
      var s = Math.round((Date.now() - d.getTime()) / 1000);
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      if (s < 2592000) return Math.floor(s / 86400) + 'd ago';
      return d.toLocaleDateString();
    } catch (e) { return ''; }
  }

  var URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?"')\]])/g;

  // Renders text into the container as text nodes + programmatically-built <a>
  // elements for autolinked URLs. Never touches innerHTML with user content.
  function renderBodyText(container, text) {
    var str = String(text || '');
    var lastIndex = 0;
    var m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(str))) {
      if (m.index > lastIndex) container.appendChild(document.createTextNode(str.slice(lastIndex, m.index)));
      var a = document.createElement('a');
      a.href = m[0];
      a.textContent = m[0];
      a.target = '_blank';
      a.rel = 'nofollow noopener ugc';
      container.appendChild(a);
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < str.length) container.appendChild(document.createTextNode(str.slice(lastIndex)));
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function boot() {
    var host = document.getElementById('chatterbox');
    if (!host) {
      host = document.createElement('div');
      host.id = 'chatterbox';
      (script.parentNode || document.body).insertBefore(host, script.nextSibling);
    }
    var root = host.attachShadow({ mode: 'open' });

    var dark = themeAttr === 'dark' || (themeAttr === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var bg = dark ? '#17171c' : '#ffffff';
    var fg = dark ? '#e7e7ee' : '#1a1a1f';
    var sub = dark ? '#8b8b98' : '#6b6b76';
    var border = dark ? '#2b2b33' : '#e4e4e7';
    var inputBg = dark ? '#212129' : '#f4f4f6';

    var style = document.createElement('style');
    style.textContent =
      ':host{all:initial;color-scheme:' + (dark ? 'dark' : 'light') + '}' +
      '.cb-root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:' + bg + ';color:' + fg + ';max-width:100%}' +
      '.cb-root *{box-sizing:border-box}' +
      '.cb-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}' +
      '.cb-title{font-size:16px;font-weight:700;margin:0}' +
      '.cb-sort{background:' + inputBg + ';color:' + fg + ';border:1px solid ' + border + ';border-radius:8px;font-size:12.5px;padding:5px 8px}' +
      '.cb-composer{border:1px solid ' + border + ';border-radius:12px;padding:12px;margin-bottom:18px}' +
      '.cb-row{display:flex;gap:8px;margin-bottom:8px}' +
      '.cb-input,.cb-area{width:100%;background:' + inputBg + ';border:1px solid ' + border + ';border-radius:8px;color:' + fg + ';font-size:13px;padding:8px 10px;outline:none;font-family:inherit}' +
      '.cb-area{min-height:70px;resize:vertical}' +
      '.cb-input:focus,.cb-area:focus{border-color:' + accent + '}' +
      '.cb-hp{position:absolute;left:-9999px;opacity:0;height:0;width:0}' +
      '.cb-foot{display:flex;align-items:center;justify-content:space-between;margin-top:8px}' +
      '.cb-notify{display:flex;align-items:center;gap:6px;font-size:12px;color:' + sub + '}' +
      '.cb-btn{background:' + accent + ';color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;padding:8px 16px;cursor:pointer}' +
      '.cb-btn:disabled{opacity:.5;cursor:default}' +
      '.cb-empty{color:' + sub + ';font-size:13px;padding:12px 0}' +
      '.cb-thread{list-style:none;margin:0;padding:0}' +
      '.cb-item{border-top:1px solid ' + border + ';padding:12px 0}' +
      '.cb-item .cb-thread{margin-left:20px;border-left:2px solid ' + border + ';padding-left:14px}' +
      '.cb-meta{display:flex;align-items:center;gap:8px;font-size:12.5px;margin-bottom:4px}' +
      '.cb-name{font-weight:700}' +
      '.cb-time{color:' + sub + '}' +
      '.cb-pending{background:#f59e0b22;color:#f59e0b;border-radius:6px;padding:1px 6px;font-size:10.5px;font-weight:700;letter-spacing:.02em}' +
      '.cb-body{font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;margin-bottom:6px}' +
      '.cb-body a{color:' + accent + '}' +
      '.cb-actions{display:flex;align-items:center;gap:10px}' +
      '.cb-vote{display:flex;align-items:center;gap:4px}' +
      '.cb-vbtn{background:none;border:1px solid ' + border + ';border-radius:6px;color:' + sub + ';font-size:12px;cursor:pointer;padding:2px 6px;line-height:1.4}' +
      '.cb-vbtn:hover{border-color:' + accent + ';color:' + accent + '}' +
      '.cb-score{font-size:12px;font-weight:700;min-width:16px;text-align:center}' +
      '.cb-reply-link{background:none;border:none;color:' + sub + ';font-size:12px;cursor:pointer;padding:0}' +
      '.cb-reply-link:hover{color:' + accent + '}' +
      '.cb-brand{display:block;text-align:right;color:' + sub + ';font-size:10px;margin-top:6px;text-decoration:none}';
    root.appendChild(style);

    var wrap = el('div', 'cb-root');
    root.appendChild(wrap);

    var head = el('div', 'cb-head');
    head.appendChild(el('p', 'cb-title', 'Comments'));
    var sortSel = document.createElement('select');
    sortSel.className = 'cb-sort';
    [['best', 'Best'], ['newest', 'Newest'], ['oldest', 'Oldest']].forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o[0]; opt.textContent = o[1];
      sortSel.appendChild(opt);
    });
    head.appendChild(sortSel);
    wrap.appendChild(head);

    // ---- composer ----
    var composer = el('div', 'cb-composer');
    var row1 = el('div', 'cb-row');
    var nameInput = document.createElement('input');
    nameInput.className = 'cb-input'; nameInput.placeholder = 'Name'; nameInput.type = 'text';
    var emailInput = document.createElement('input');
    emailInput.className = 'cb-input'; emailInput.placeholder = 'Email (optional, never shown)'; emailInput.type = 'email';
    row1.appendChild(nameInput); row1.appendChild(emailInput);
    composer.appendChild(row1);
    var bodyArea = document.createElement('textarea');
    bodyArea.className = 'cb-area'; bodyArea.placeholder = 'Join the discussion…';
    composer.appendChild(bodyArea);
    var hp = document.createElement('input');
    hp.className = 'cb-hp'; hp.type = 'text'; hp.name = 'website'; hp.tabIndex = -1; hp.autocomplete = 'off';
    composer.appendChild(hp);
    var foot = el('div', 'cb-foot');
    var notifyLabel = el('label', 'cb-notify');
    var notifyBox = document.createElement('input');
    notifyBox.type = 'checkbox';
    notifyLabel.appendChild(notifyBox);
    notifyLabel.appendChild(document.createTextNode('Notify me of replies'));
    foot.appendChild(notifyLabel);
    var sendBtn = el('button', 'cb-btn', 'Post comment');
    sendBtn.type = 'button';
    foot.appendChild(sendBtn);
    composer.appendChild(foot);
    wrap.appendChild(composer);

    var listEl = el('div');
    wrap.appendChild(listEl);

    var brand = document.createElement('a');
    brand.className = 'cb-brand'; brand.href = 'https://github.com/bensblueprints'; brand.target = '_blank'; brand.rel = 'noopener';
    brand.textContent = 'Powered by Chatterbox';
    wrap.appendChild(brand);

    var renderedAt = Date.now();

    function submitComment(body, parentId, doneCb) {
      var name = nameInput.value.trim() || 'Anonymous';
      var email = emailInput.value.trim();
      api('POST', '/api/widget/comments', {
        page_key: pageKey(),
        page_title: pageTitle(),
        parent_id: parentId || null,
        name: name,
        email: email,
        body: body,
        notify: notifyLabel.contains(notifyBox) ? notifyBox.checked : false,
        hp: hp.value,
        elapsed_ms: Date.now() - renderedAt
      }, function (status) {
        if (doneCb) doneCb(status >= 200 && status < 300);
      });
    }

    sendBtn.addEventListener('click', function () {
      var text = bodyArea.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      submitComment(text, null, function (ok) {
        sendBtn.disabled = false;
        if (ok) { bodyArea.value = ''; load(); }
      });
    });

    function vote(id, value, scoreEl) {
      api('POST', '/api/widget/comments/' + id + '/vote', { value: value }, function (status, json) {
        if (status === 200 && json) scoreEl.textContent = String(json.score);
      });
    }

    function renderComment(c, depth) {
      var li = el('li', 'cb-item');
      var meta = el('div', 'cb-meta');
      meta.appendChild(el('span', 'cb-name', c.author_name || 'Anonymous'));
      meta.appendChild(el('span', 'cb-time', fmtTime(c.created_at)));
      if (c.pending) meta.appendChild(el('span', 'cb-pending', 'AWAITING MODERATION'));
      li.appendChild(meta);

      var bodyEl = el('div', 'cb-body');
      renderBodyText(bodyEl, c.body);
      li.appendChild(bodyEl);

      var actions = el('div', 'cb-actions');
      var voteWrap = el('div', 'cb-vote');
      var up = el('button', 'cb-vbtn', '▲'); up.type = 'button';
      var scoreSpan = el('span', 'cb-score', String(c.score || 0));
      var down = el('button', 'cb-vbtn', '▼'); down.type = 'button';
      up.addEventListener('click', function () { vote(c.id, 1, scoreSpan); });
      down.addEventListener('click', function () { vote(c.id, -1, scoreSpan); });
      voteWrap.appendChild(up); voteWrap.appendChild(scoreSpan); voteWrap.appendChild(down);
      actions.appendChild(voteWrap);

      var replyBtn = el('button', 'cb-reply-link', 'Reply');
      replyBtn.type = 'button';
      actions.appendChild(replyBtn);
      li.appendChild(actions);

      var replyBox = null;
      replyBtn.addEventListener('click', function () {
        if (replyBox) { replyBox.remove(); replyBox = null; return; }
        replyBox = el('div', 'cb-composer');
        replyBox.style.marginTop = '8px';
        var ta = document.createElement('textarea');
        ta.className = 'cb-area'; ta.placeholder = 'Write a reply…';
        replyBox.appendChild(ta);
        var rHp = document.createElement('input');
        rHp.className = 'cb-hp'; rHp.type = 'text'; rHp.tabIndex = -1; rHp.autocomplete = 'off';
        replyBox.appendChild(rHp);
        var send = el('button', 'cb-btn', 'Reply');
        send.type = 'button'; send.style.marginTop = '8px';
        send.addEventListener('click', function () {
          var text = ta.value.trim();
          if (!text) return;
          send.disabled = true;
          hp.value = rHp.value; // reuse honeypot pathway
          submitComment(text, c.id, function (ok) {
            send.disabled = false;
            if (ok) { replyBox.remove(); replyBox = null; load(); }
          });
        });
        replyBox.appendChild(send);
        li.appendChild(replyBox);
      });

      if (c.replies && c.replies.length) {
        var childUl = el('ul', 'cb-thread');
        var nextDepth = depth >= 4 ? 4 : depth + 1;
        c.replies.forEach(function (child) { childUl.appendChild(renderComment(child, nextDepth)); });
        li.appendChild(childUl);
      }
      return li;
    }

    function load() {
      api('GET', '/api/widget/comments?page_key=' + encodeURIComponent(pageKey()) + '&sort=' + sortSel.value, null, function (status, json) {
        listEl.innerHTML = '';
        if (status !== 200 || !json || !json.comments || !json.comments.length) {
          listEl.appendChild(el('div', 'cb-empty', 'No comments yet — be the first.'));
          return;
        }
        var ul = el('ul', 'cb-thread');
        json.comments.forEach(function (c) { ul.appendChild(renderComment(c, 1)); });
        listEl.appendChild(ul);
      });
    }

    sortSel.addEventListener('change', load);
    load();
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();`;
