
import { useEffect, useState } from 'react';
import styles from './RelayStatus.module.scss';

type RelayStatus = 'verbunden' | 'nicht erreichbar' | 'prüfe…';

export function RelayStatus({ relays }: { relays: string[] }) {
  const [open, setOpen] = useState(true);
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
      <div
        className={styles.collapseHeader}
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={open ? 'Relay-Bereich zuklappen' : 'Relay-Bereich aufklappen'}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(v => !v); }}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <h2 className={styles.collapseHeadline}>
          Relay-Verbindungstest
          <span className={styles.collapseArrow} aria-hidden="true"/>
        </h2>
      </div>
      <div
        className={styles.collapseContent}
        style={{ maxHeight: open ? 900 : 0, overflow: 'hidden', transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1)' }}
        aria-hidden={!open}
      >
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
    </div>
  );
}
