

import { useEffect, useState } from 'react';
import styles from './RelayStatus.module.scss';


type RelayStatus = 'verbunden' | 'nicht erreichbar' | 'prüfe…';

export function RelayStatus({ relays }: { relays: string[] }) {
  const [relayStatus, setRelayStatus] = useState<Record<string, RelayStatus>>({});

  useEffect(() => {
    let isMounted = true;
    const status: Record<string, RelayStatus> = {};
    let checked = 0;
    if (relays.length === 0) {
      setRelayStatus({});
      return;
    }
    relays.forEach((relay: string) => {
      status[relay] = 'prüfe…';
      try {
        const ws = new window.WebSocket(relay);
        ws.onopen = () => {
          status[relay] = 'verbunden';
          ws.close();
          checked++;
          if (checked === relays.length && isMounted) setRelayStatus({ ...status });
        };
        ws.onerror = () => {
          status[relay] = 'nicht erreichbar';
          checked++;
          if (checked === relays.length && isMounted) setRelayStatus({ ...status });
        };
      } catch {
        status[relay] = 'nicht erreichbar';
        checked++;
        if (checked === relays.length && isMounted) setRelayStatus({ ...status });
      }
    });
    return () => { isMounted = false; };
  }, [relays]);

  return (
    <div className={styles.relayStatusRoot}>
      <div className={styles.relayStatusCard}>
        <ul className={styles.relayList}>
          {relays.length === 0 && <li>Keine Relays gesetzt</li>}
          {relays.map((r: string, i: number) => (
            <li key={i}>
              {r}
              {relayStatus[r] && (
                <span
                  className={
                    styles.statusLabel + ' ' +
                    (relayStatus[r] === 'verbunden'
                      ? styles.statusVerbunden
                      : relayStatus[r] === 'prüfe…'
                      ? styles.statusPruefe
                      : styles.statusFehler)
                  }
                >
                  [{relayStatus[r]}]
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
