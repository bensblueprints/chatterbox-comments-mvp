import React, { useEffect, useState } from 'react';
import { Save, Send, Ban, Trash2 } from 'lucide-react';
import { api } from './api.js';

export default function Settings() {
  const [s, setS] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [testTo, setTestTo] = useState('');
  const [newBlock, setNewBlock] = useState({ kind: 'email', value: '' });

  async function load() {
    setS(await api.get('/api/settings'));
    setBlocks(await api.get('/api/blocks'));
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      const updated = await api.put('/api/settings', s);
      setS(updated);
      setMsg('Saved.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function testEmail() {
    setMsg('');
    try {
      await api.post('/api/settings/test-email', { to: testTo });
      setMsg('Test email sent.');
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function addBlock() {
    if (!newBlock.value.trim()) return;
    await api.post('/api/blocks', newBlock);
    setNewBlock({ ...newBlock, value: '' });
    setBlocks(await api.get('/api/blocks'));
  }

  async function removeBlock(id) {
    await api.del(`/api/blocks/${id}`);
    setBlocks(await api.get('/api/blocks'));
  }

  if (!s) return <div className="text-sm text-zinc-500">Loading…</div>;
  const set = (k) => (e) => setS({ ...s, [k]: e.target.type === 'checkbox' ? (e.target.checked ? '1' : '0') : e.target.value });

  return (
    <div className="max-w-2xl space-y-5">
      <div className="card p-6">
        <h3 className="mb-4 font-semibold">Moderation</h3>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" className="size-4 accent-violet-500" checked={s.approve_first === '1'} onChange={set('approve_first')} />
          Approve-first (comments await moderation before appearing to everyone else)
        </label>
      </div>

      <div className="card p-6">
        <h3 className="mb-4 font-semibold">Embed &amp; CORS</h3>
        <label className="mb-1 block text-xs font-medium text-zinc-400">Allowed origins (comma-separated, or * for any)</label>
        <input className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={s.allowed_origins} onChange={set('allowed_origins')} />
        <label className="mb-1 block text-xs font-medium text-zinc-400">Accent color</label>
        <input className="mb-3 w-40 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={s.accent} onChange={set('accent')} />
        <label className="mb-1 block text-xs font-medium text-zinc-400">Base URL (used in unsubscribe links + RSS)</label>
        <input className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={s.base_url} onChange={set('base_url')} placeholder="https://comments.example.com" />
      </div>

      <div className="card p-6">
        <h3 className="mb-4 font-semibold">Rate limiting</h3>
        <div className="flex gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Max comments</label>
            <input className="w-28 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={s.rate_limit_max} onChange={set('rate_limit_max')} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Per window (ms)</label>
            <input className="w-36 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={s.rate_limit_window_ms} onChange={set('rate_limit_window_ms')} />
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="mb-4 font-semibold">BYO SMTP (reply notifications)</h3>
        <label className="mb-3 flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" className="size-4 accent-violet-500" checked={s.smtp_enabled === '1'} onChange={set('smtp_enabled')} />
          Enabled
        </label>
        <div className="grid grid-cols-2 gap-3">
          <input className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="SMTP host" value={s.smtp_host} onChange={set('smtp_host')} />
          <input className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="Port" value={s.smtp_port} onChange={set('smtp_port')} />
          <input className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="Username" value={s.smtp_user} onChange={set('smtp_user')} />
          <input type="password" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="Password" value={s.smtp_pass} onChange={set('smtp_pass')} />
          <input className="col-span-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="From address" value={s.smtp_from} onChange={set('smtp_from')} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="Send test email to…" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <button className="btn btn-ghost inline-flex items-center gap-1.5" onClick={testEmail}><Send size={14} /> Test</button>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="mb-4 font-semibold">Blocklist</h3>
        <div className="mb-3 flex gap-2">
          <select className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm" value={newBlock.kind} onChange={(e) => setNewBlock({ ...newBlock, kind: e.target.value })}>
            <option value="email">Email</option>
            <option value="ip_hash">IP hash</option>
          </select>
          <input className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="value to block" value={newBlock.value} onChange={(e) => setNewBlock({ ...newBlock, value: e.target.value })} />
          <button className="btn btn-ghost inline-flex items-center gap-1.5" onClick={addBlock}><Ban size={14} /> Block</button>
        </div>
        {blocks.map((b) => (
          <div key={b.id} className="flex items-center justify-between border-t border-zinc-800/70 py-2 text-sm">
            <span><span className="text-zinc-500">{b.kind}</span> {b.value}</span>
            <button className="btn btn-ghost !p-1.5" onClick={() => removeBlock(b.id)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary inline-flex items-center gap-1.5" disabled={busy} onClick={save}><Save size={14} /> {busy ? 'Saving…' : 'Save settings'}</button>
        {msg && <span className="text-sm text-zinc-400">{msg}</span>}
      </div>
    </div>
  );
}
