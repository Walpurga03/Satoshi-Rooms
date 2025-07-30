
import { useState } from 'react';
// Hilfsfunktion: Array<number> oder Uint8Array zu Hex-String
function bytesToHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

import { useNostrWasm } from '../hooks/useNostrWasm';
import './KeyManagement.scss';

export default function KeyManagement() {
  const { nostr, loading, error } = useNostrWasm();
  const [tab, setTab] = useState<'generate' | 'import'>('generate');
  const [priv, setPriv] = useState('');
  const [pub, setPub] = useState('');
  const [importKey, setImportKey] = useState('');
  const [importError, setImportError] = useState('');

  // Schlüssel generieren
  const handleGenerate = async () => {
    if (!nostr) return;
    const privRaw = nostr.generateSecretKey();
    const priv = Array.isArray(privRaw) || privRaw instanceof Uint8Array ? bytesToHex(privRaw) : privRaw;
    const pubRaw = nostr.getPublicKey(priv);
    const pub = Array.isArray(pubRaw) || pubRaw instanceof Uint8Array ? bytesToHex(pubRaw) : pubRaw;
    console.log('Generated priv:', priv, 'pub:', pub);
    setPriv(priv);
    setPub(pub);
  };

  // Schlüssel importieren
  const [importSuccess, setImportSuccess] = useState(false);
  const handleImport = () => {
    setImportError('');
    setImportSuccess(false);
    if (!nostr) return;
    try {
      const pub = nostr.getPublicKey(importKey.trim());
      setPriv(importKey.trim());
      setPub(pub);
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 2000);
    } catch (e) {
      setImportError('Ungültiger Private Key!');
      setPriv('');
      setPub('');
    }
  };

  return (
    <div className="key-management">
      <div style={{ display: 'flex', gap: 0, marginBottom: 32 }}>
        <button
          className={`tab-btn${tab === 'generate' ? ' active' : ''}`}
          onClick={() => {
            setTab('generate');
            setImportKey('');
            setImportError('');
            // priv/pub NICHT zurücksetzen!
          }}
          disabled={tab === 'generate'}
        >🔑 Schlüssel generieren</button>
        <button
          className={`tab-btn${tab === 'import' ? ' active' : ''}`}
          onClick={() => {
            setTab('import');
            setPriv('');
            setPub('');
            setImportKey('');
            setImportError('');
          }}
          disabled={tab === 'import'}
        >📥 Schlüssel importieren</button>
      </div>
      {loading && <p>nostr-wasm wird geladen…</p>}
      {error && <p style={{ color: 'red' }}>Fehler: {error}</p>}
      {tab === 'generate' && nostr && (
        <div>
          <button className="action-btn" onClick={handleGenerate}>Neues Schlüsselpaar generieren</button>
          <div className="key-box">
            <div className="key-label-row">
              <b>Private Key:</b>
              <button className="copy-btn" onClick={() => priv && navigator.clipboard.writeText(priv)} disabled={!priv}>Copy</button>
            </div>
            <code className="key-value">{priv ? priv.replace(/(.{8})/g, '$1 ').trim() : <span style={{color:'#888'}}>Noch kein Schlüssel generiert</span>}</code>
            <div className="key-label-row">
              <b>Public Key:</b>
              <button className="copy-btn" onClick={() => pub && navigator.clipboard.writeText(pub)} disabled={!pub}>Copy</button>
            </div>
            <code className="key-value">{pub ? pub.replace(/(.{8})/g, '$1 ').trim() : <span style={{color:'#888'}}>Noch kein Schlüssel generiert</span>}</code>
          </div>
        </div>
      )}
      {tab === 'import' && nostr && (
        <div>
          <input
            type="text"
            placeholder="Private Key eingeben..."
            value={importKey}
            onChange={e => setImportKey(e.target.value)}
          />
          <button className="action-btn" onClick={handleImport} style={{ marginLeft: 8 }}>Importieren</button>
          {importError && <div style={{ color: 'red', marginTop: 8 }}>{importError}</div>}
          {importSuccess && <div style={{ color: 'green', marginTop: 8 }}>Key erfolgreich importiert!</div>}
          {!importError && importKey && typeof priv === 'string' && priv && typeof pub === 'string' && pub && (
            <div className="key-box">
              <div className="key-label-row">
                <b>Private Key:</b>
                <button className="copy-btn" onClick={() => navigator.clipboard.writeText(priv)}>Copy</button>
              </div>
              <code className="key-value">{priv.replace(/(.{8})/g, '$1 ').trim()}</code>
              <div className="key-label-row">
                <b>Public Key:</b>
                <button className="copy-btn" onClick={() => navigator.clipboard.writeText(pub)}>Copy</button>
              </div>
              <code className="key-value">{pub.replace(/(.{8})/g, '$1 ').trim()}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
