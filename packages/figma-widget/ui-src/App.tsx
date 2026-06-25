import React, { useEffect, useState } from 'react';

const s = {
  root: { fontFamily: 'Inter, system-ui, sans-serif', background: '#0f0f1a', color: '#f9fafb', height: '100vh', display: 'flex', flexDirection: 'column' as const },
  body: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 16, padding: 24, overflowY: 'auto' as const },
  footer: { padding: '12px 24px', borderTop: '1px solid #1c1c2e', flexShrink: 0 },
  label: { display: 'flex', flexDirection: 'column' as const, gap: 5, fontSize: 12, color: '#9ca3af' },
  input: { background: '#1c1c2e', border: '1px solid #2d2d44', borderRadius: 6, color: '#f9fafb', fontSize: 13, padding: '8px 10px', outline: 'none', fontFamily: 'inherit' },
  btn: { background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 16px', fontSize: 13, fontWeight: 500 as const, cursor: 'pointer', width: '100%' },
};

function extractAssetId(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/');
    const idx = parts.indexOf('assets');
    return idx !== -1 && parts[idx + 1] ? parts[idx + 1] : null;
  } catch { return null; }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function fetchAssetInfo(assetUrl: string): Promise<{ name: string; version: number; uploadedAt: string } | null> {
  try {
    const { origin } = new URL(assetUrl);
    const assetId = extractAssetId(assetUrl);
    if (!assetId) return null;
    const res = await fetch(`${origin}/api/assets/${assetId}/info`);
    if (!res.ok) return null;
    const data = await res.json();
    return { name: data.name, version: data.version, uploadedAt: formatDate(data.uploaded_at) };
  } catch { return null; }
}

async function fetchThumbnailBase64(assetUrl: string): Promise<string | null> {
  try {
    const { origin } = new URL(assetUrl);
    const assetId = extractAssetId(assetUrl);
    if (!assetId) return null;
    const res = await fetch(`${origin}/api/assets/${assetId}/thumbnail`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export default function App() {
  const [inputUrl, setInputUrl] = useState('');
  const [inputName, setInputName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (msg?.type !== 'init') return;
      setInputUrl(msg.assetUrl ?? '');
      setInputName(msg.assetName ?? '');
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  async function save() {
    const url = inputUrl.trim();
    if (!url) return;
    setSaving(true);
    setError('');

    const [info, thumbnailBase64] = await Promise.all([
      fetchAssetInfo(url),
      fetchThumbnailBase64(url),
    ]);

    if (!info) setError('Could not reach the Freeframe API — check the URL.');

    parent.postMessage({
      pluginMessage: {
        type: 'save',
        url,
        name: inputName.trim() || info?.name || '',
        thumbnailBase64: thumbnailBase64 ?? '',
        version: info?.version ?? null,
        uploadedAt: info?.uploadedAt ?? '',
      },
    }, '*');
    setSaving(false);
  }

  const canSave = !!inputUrl.trim() && !saving;

  return (
    <div style={s.root}>
      <div style={s.body}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Freeframe Asset</h2>
          <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
            Paste the asset URL. Name, version and date are fetched automatically.
          </p>
        </div>
        <label style={s.label}>
          Asset URL
          <input style={s.input} type="url" placeholder="https://app.freeframe.com/projects/…/assets/…"
            value={inputUrl} onChange={e => setInputUrl(e.target.value)} autoFocus />
        </label>
        <label style={s.label}>
          Label override <span style={{ color: '#4b5563' }}>(optional — uses asset name if blank)</span>
          <input style={s.input} type="text" placeholder="e.g. Homepage Hero Video"
            value={inputName} onChange={e => setInputName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && canSave && save()} />
        </label>
        {error && <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{error}</p>}
      </div>
      <div style={s.footer}>
        <button style={{ ...s.btn, opacity: canSave ? 1 : 0.5 }} onClick={save} disabled={!canSave}>
          {saving ? 'Fetching…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
