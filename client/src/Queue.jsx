import React, { useEffect, useState } from 'react';
import { Check, Ban, Trash2, ExternalLink } from 'lucide-react';
import { api } from './api.js';

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'spam', label: 'Spam' },
  { key: 'deleted', label: 'Deleted' }
];

export default function Queue() {
  const [tab, setTab] = useState('pending');
  const [comments, setComments] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get(`/api/comments?status=${tab}`);
      setComments(r.comments);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tab]);

  async function act(id, action) {
    await api.post(`/api/comments/${id}/${action}`);
    load();
  }

  async function bulk(action) {
    if (!selected.size) return;
    await api.post('/api/comments/bulk', { ids: [...selected], action });
    load();
  }

  function toggle(id) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
              tab === t.key ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:bg-zinc-900'
            }`}
          >
            {t.label}
          </button>
        ))}
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-zinc-500">{selected.size} selected</span>
            <button className="btn btn-ghost" onClick={() => bulk('approve')}>Approve</button>
            <button className="btn btn-ghost" onClick={() => bulk('spam')}>Spam</button>
            <button className="btn btn-ghost" onClick={() => bulk('delete')}>Delete</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading…</div>
      ) : comments.length === 0 ? (
        <div className="card p-8 text-center text-sm text-zinc-500">No {tab} comments.</div>
      ) : (
        <div className="space-y-2.5">
          {comments.map((c) => (
            <div key={c.id} className="card flex gap-3 p-4">
              <input type="checkbox" className="mt-1 size-4 accent-violet-500" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-semibold text-zinc-300">{c.author_name}</span>
                  {c.author_email && <span>· {c.author_email}</span>}
                  <span>· {new Date(c.created_at + 'Z').toLocaleString()}</span>
                  <a href={c.page_key} target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1 text-zinc-500 hover:text-violet-400">
                    {c.page_title || c.page_key} <ExternalLink size={11} />
                  </a>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-zinc-200">{c.body}</p>
                <div className="mt-2 flex gap-1.5">
                  {c.status !== 'approved' && (
                    <button className="btn btn-ghost !p-1.5" title="Approve" onClick={() => act(c.id, 'approve')}><Check size={14} /></button>
                  )}
                  {c.status !== 'spam' && (
                    <button className="btn btn-ghost !p-1.5" title="Spam" onClick={() => act(c.id, 'spam')}><Ban size={14} /></button>
                  )}
                  {c.status !== 'deleted' && (
                    <button className="btn btn-ghost !p-1.5" title="Delete" onClick={() => act(c.id, 'delete')}><Trash2 size={14} /></button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
