import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessagesSquare, LogOut, Inbox, FileStack, SlidersHorizontal, Upload, Code2 } from 'lucide-react';
import { api } from './api.js';
import Login from './Login.jsx';
import Queue from './Queue.jsx';
import Pages from './Pages.jsx';
import Settings from './Settings.jsx';
import Import from './Import.jsx';
import Embed from './Embed.jsx';

const TABS = [
  { key: 'queue', label: 'Moderation', icon: Inbox, Comp: Queue },
  { key: 'pages', label: 'Pages', icon: FileStack, Comp: Pages },
  { key: 'settings', label: 'Settings', icon: SlidersHorizontal, Comp: Settings },
  { key: 'import', label: 'Import', icon: Upload, Comp: Import },
  { key: 'embed', label: 'Embed', icon: Code2, Comp: Embed }
];

export default function App() {
  const [authed, setAuthed] = useState(null);
  const [tab, setTab] = useState('queue');

  useEffect(() => {
    api.get('/api/me').then((r) => setAuthed(r.authed)).catch(() => setAuthed(false));
    const onUnauth = () => setAuthed(false);
    window.addEventListener('cb:unauthorized', onUnauth);
    return () => window.removeEventListener('cb:unauthorized', onUnauth);
  }, []);

  if (authed === null) {
    return <div className="grid min-h-screen place-items-center text-zinc-500">Loading…</div>;
  }
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const Active = TABS.find((t) => t.key === tab).Comp;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3.5">
          <span className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
            <span className="grid size-8 place-items-center rounded-xl bg-violet-600/20 text-violet-400">
              <MessagesSquare size={17} />
            </span>
            Chatterbox
          </span>
          <nav className="ml-4 flex items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                  tab === t.key ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </nav>
          <button
            onClick={() => api.post('/api/logout').then(() => setAuthed(false))}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          >
            <LogOut size={14} /> Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-7">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Active />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
