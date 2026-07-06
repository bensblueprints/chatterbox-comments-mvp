import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function Embed() {
  const [copied, setCopied] = useState(false);
  const demoRef = useRef(null);
  const origin = window.location.origin;
  const snippet = `<script src="${origin}/embed.js" data-page-id="my-post-slug" defer></script>\n<div id="chatterbox"></div>`;

  function copy() {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  useEffect(() => {
    if (!demoRef.current || demoRef.current.querySelector('script')) return;
    const s = document.createElement('script');
    s.src = `${origin}/embed.js`;
    s.setAttribute('data-page-id', 'chatterbox-admin-demo');
    s.defer = true;
    demoRef.current.appendChild(s);
    const host = document.createElement('div');
    host.id = 'chatterbox';
    demoRef.current.appendChild(host);
  }, []);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="card p-6">
        <h3 className="mb-1 font-semibold">Embed snippet</h3>
        <p className="mb-4 text-sm text-zinc-500">
          Paste this before <code className="text-violet-400">&lt;/body&gt;</code> on any page you want comments on.
          Setting <code className="text-violet-400">data-page-id</code> is strongly recommended — without it, Chatterbox
          keys threads off the canonical URL, and query strings will fragment them.
        </p>
        <div className="relative">
          <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-300">{snippet}</pre>
          <button onClick={copy} className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700">
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="mb-1 font-semibold">Live demo</h3>
        <p className="mb-4 text-sm text-zinc-500">This is the real widget, dogfooding itself right here in the admin panel.</p>
        <div ref={demoRef} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4" />
      </div>
    </div>
  );
}
