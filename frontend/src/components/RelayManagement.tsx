import { useState, useEffect, useRef } from 'react';
import { useNostrWasm } from '../hooks/useNostrWasm';
import { SimplePool } from 'nostr-tools';
// Vorschlagsliste für NIP-29 Relays
const RECOMMENDED_RELAYS = [
  'wss://nostr-relay.online',
  'wss://relay.nostr.band',
  'wss://relay.damus.io',
  'wss://nostr.mutinywallet.com',
  'wss://relay.nostr.bg',
  'wss://nostr21.com',
  'wss://nostr-pub.wellorder.net',
  'wss://nostr.oxtr.dev',
];
import './RelayManagement.scss';


export default function RelayManagement() {
  const { nostr, loading, error } = useNostrWasm();
  // nostr-tools: Pool für alle Relays (1 Pool für alle Verbindungen)
  const poolRef = useRef<any>(null);
  useEffect(() => {
    if (!poolRef.current) {
      poolRef.current = new SimplePool();
    }
    // Kein close() im Cleanup, da dies zu Fehlern führen kann
    return () => {};
  }, []);
  const [relays, setRelays] = useState<string[]>([]);
  const [input, setInput] = useState('');
  // Status: 'pending' | 'connected' | 'error' | 'disconnected'
  const [relayStatus, setRelayStatus] = useState<Record<string, 'pending' | 'connected' | 'error' | 'disconnected'>>({});
  // Fehlertext pro Relay
  const [relayError, setRelayError] = useState<Record<string, string>>({});
  // SimplePool verwaltet intern die Relays

  // Relay verbinden: SimplePool stellt WebSocket-Verbindung her
  const connectRelay = async (url: string) => {
    setRelayStatus(s => ({ ...s, [url]: 'pending' }));
    setRelayError(e => ({ ...e, [url]: '' }));
    try {
      const pool = poolRef.current;
      if (!pool) throw new Error('Kein SimplePool initialisiert');
      // ensureRelay gibt ein Promise zurück!
      pool.ensureRelay(url).then((relay: any) => {
        // Debug: Logge das Relay-Objekt und WebSocket-Status
        // eslint-disable-next-line no-console
        console.log(`[DEBUG] Versuche Verbindung zu Relay: ${url}`, relay);
        setTimeout(() => {
          // eslint-disable-next-line no-console
          console.log(`[DEBUG] WebSocket-Status für ${url}:`, relay.ws?.readyState, relay.ws);
          if (relay.ws && relay.ws.readyState === 1) {
            setRelayStatus(s => ({ ...s, [url]: 'connected' }));
          } else if (relay.ws && relay.ws.readyState === 0) {
            setRelayStatus(s => ({ ...s, [url]: 'pending' }));
          } else {
            setRelayStatus(s => ({ ...s, [url]: 'error' }));
            setRelayError(errs => ({ ...errs, [url]: 'Verbindung fehlgeschlagen' }));
          }
        }, 800);
      }).catch((e: any) => {
        // eslint-disable-next-line no-console
        console.error(`[DEBUG] Fehler beim Verbinden zu ${url}:`, e);
        setRelayStatus(s => ({ ...s, [url]: 'error' }));
        setRelayError(errs => ({ ...errs, [url]: e?.message || 'Verbindung fehlgeschlagen' }));
      });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error(`[DEBUG] Fehler beim Verbinden zu ${url}:`, e);
      setRelayStatus(s => ({ ...s, [url]: 'error' }));
      setRelayError(errs => ({ ...errs, [url]: e?.message || 'Verbindung fehlgeschlagen' }));
    }
  };

  // Relay hinzufügen und verbinden
  const addRelay = () => {
    const url = input.trim();
    if (url && !relays.includes(url)) {
      setRelays([...relays, url]);
      setInput('');
      connectRelay(url);
    }
  };

  // Relay entfernen (und Verbindung schließen)
  const removeRelay = (url: string) => {
    setRelays(relays.filter(r => r !== url));
    setRelayStatus(s => {
      const copy = { ...s };
      delete copy[url];
      return copy;
    });
    setRelayError(e => {
      const copy = { ...e };
      delete copy[url];
      return copy;
    });
    // nostr-tools: Relay trennen
    const pool = poolRef.current;
    if (pool && pool._conn && pool._conn[url]) {
      try { pool._conn[url].close(); } catch {}
      delete pool._conn[url];
    }
  };

  // Beim Mount: Bereits vorhandene Relays verbinden (z.B. nach Reload)
  useEffect(() => {
    relays.forEach(url => {
      if (!relayStatus[url]) connectRelay(url);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relay-management">
      <h2>Relay-Verbindungen</h2>
      <div className="relay-suggestions">
        <span>Empfohlene NIP-29 Relays:</span>
        <div className="relay-suggestion-list">
          {RECOMMENDED_RELAYS.map(url => (
            <button
              key={url}
              className="suggestion-btn"
              type="button"
              onClick={() => setInput(url)}
              disabled={relays.includes(url)}
              title={relays.includes(url) ? 'Bereits hinzugefügt' : 'Relay übernehmen'}
            >{url}</button>
          ))}
        </div>
      </div>
      <div className="relay-input-row">
        <input
          type="text"
          placeholder="Relay-URL (wss://...)"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
        />
        <button className="action-btn" onClick={addRelay} disabled={!input.trim() || loading || !nostr}>Hinzufügen</button>
      </div>
      {loading && <div style={{ color: '#888', marginBottom: 8 }}>nostr-wasm wird geladen…</div>}
      {error && <div style={{ color: 'red', marginBottom: 8 }}>Fehler: {error}</div>}
      <ul className="relay-list">
        {relays.length === 0 && <li className="relay-empty">Noch keine Relays hinzugefügt.</li>}
        {relays.map(url => (
          <li key={url} className="relay-item">
            <span>{url}</span>
            <span style={{ marginLeft: 12, fontSize: '0.98em' }}>
              {relayStatus[url] === 'pending' && <span style={{ color: '#f6c177' }}>Verbinde…</span>}
              {relayStatus[url] === 'connected' && <span style={{ color: '#4caf50' }}>Verbunden</span>}
              {relayStatus[url] === 'disconnected' && <span style={{ color: '#888' }}>Getrennt</span>}
              {relayStatus[url] === 'error' && <span style={{ color: '#e57373' }}>Fehler</span>}
            </span>
            {relayError[url] && <span style={{ color: '#e57373', marginLeft: 8, fontSize: '0.93em' }}>{relayError[url]}</span>}
            <button className="remove-btn" onClick={() => removeRelay(url)} title="Entfernen">✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
