import React, { useEffect, useState } from 'react';
import { Lock, Unlock, ExternalLink } from 'lucide-react';
import { api } from './api.js';

export default function Pages() {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setPages(await api.get('/api/pages'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function toggleLock(p) {
    await api.post(`/api/pages/${p.id}/lock`, { locked: !p.comments_locked });
    load();
  }

  if (loading) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (!pages.length) return <div className="card p-8 text-center text-sm text-zinc-500">No pages yet — comments create a page automatically on first load.</div>;

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3 font-medium">Page</th>
            <th className="px-4 py-3 font-medium">Comments</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3 font-medium text-right">Lock</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((p) => (
            <tr key={p.id} className="border-t border-zinc-800/70">
              <td className="max-w-xs truncate px-4 py-3">
                <a href={p.page_key} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:text-violet-400">
                  {p.title || p.page_key} <ExternalLink size={11} />
                </a>
                <div className="truncate text-xs text-zinc-500">{p.page_key}</div>
              </td>
              <td className="px-4 py-3">{p.comment_count}</td>
              <td className="px-4 py-3 text-zinc-500">{new Date(p.created_at + 'Z').toLocaleDateString()}</td>
              <td className="px-4 py-3 text-right">
                <button className="btn btn-ghost !p-1.5" onClick={() => toggleLock(p)} title={p.comments_locked ? 'Unlock' : 'Lock'}>
                  {p.comments_locked ? <Lock size={14} className="text-amber-400" /> : <Unlock size={14} />}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
