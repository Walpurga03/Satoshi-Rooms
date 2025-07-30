import { useEffect, useState } from 'react';
import { initNostrWasm } from 'nostr-wasm';

/**
 * React-Hook für nostr-wasm-Integration
 * Initialisiert das WASM-Modul und stellt die API bereit.
 */
export function useNostrWasm() {
  const [nostr, setNostr] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    initNostrWasm()
      .then((nw) => {
        if (mounted) {
          setNostr(nw);
          setLoading(false);
        }
      })
      .catch((e) => {
        setError(e.message || 'nostr-wasm konnte nicht geladen werden');
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { nostr, loading, error };
}
