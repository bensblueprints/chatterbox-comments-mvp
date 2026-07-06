import React, { useState } from 'react';
import { Upload, FileCode2, CheckCircle2 } from 'lucide-react';
import { api } from './api.js';

export default function Import() {
  const [file, setFile] = useState(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function dryRun() {
    if (!file) return;
    setBusy(true); setError(''); setResult(null); setPreview(null);
    try {
      setPreview(await api.upload('/api/import/disqus?dry_run=1', file));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      setResult(await api.upload('/api/import/disqus', file));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="card p-6">
        <h3 className="mb-1 font-semibold">Import from Disqus</h3>
        <p className="mb-4 text-sm text-zinc-500">
          Upload your Disqus XML export. Preview counts with a dry run first, then commit —
          re-importing the same file is a no-op, so it's always safe to run again.
        </p>

        <div
          className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${over ? 'border-violet-500 bg-violet-500/5' : 'border-zinc-700 hover:border-zinc-500'}`}
          onClick={() => document.getElementById('xmlfile').click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
        >
          <input id="xmlfile" type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={(e) => { setFile(e.target.files[0]); setPreview(null); setResult(null); }} />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <FileCode2 size={18} className="text-emerald-400" /> {file.name} <span className="text-zinc-500">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          ) : (
            <div className="text-sm text-zinc-500">
              <Upload className="mx-auto mb-2 text-zinc-600" size={26} />
              Drop your Disqus export here, or click to choose
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button className="btn btn-ghost" disabled={!file || busy} onClick={dryRun}>{busy ? 'Working…' : 'Dry run'}</button>
          <button className="btn btn-primary" disabled={!file || busy || !preview} onClick={commit}>Commit import</button>
        </div>
        {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
      </div>

      {preview && !result && (
        <div className="card p-6 text-sm">
          <div className="mb-1 font-semibold">Dry run preview</div>
          <p className="text-zinc-400">{preview.pages} page(s), {preview.comments} comment(s) found. Nothing written yet — click "Commit import" to write them.</p>
        </div>
      )}

      {result && (
        <div className="card p-6 text-sm">
          <div className="mb-1 flex items-center gap-2 font-semibold"><CheckCircle2 size={16} className="text-emerald-400" /> Import complete</div>
          <p className="text-zinc-400">{result.pages} new page(s), {result.comments} new comment(s){result.skipped ? `, ${result.skipped} already imported (skipped)` : ''}.</p>
        </div>
      )}
    </div>
  );
}
