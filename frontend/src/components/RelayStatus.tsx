



import { useEffect, useState } from 'react';
import styles from './RelayStatus.module.scss';

// Typ für den Relay-Status
type RelayStatusType = 'verbunden' | 'nicht erreichbar' | 'prüfe…';

type Props = {
  relays: string[];
};

/**
 * Zeigt den Status aller Relays an (verbunden, nicht erreichbar, prüfe…)
 */
export function RelayStatus({ relays }: Props) {
  const [relayStatus, setRelayStatus] = useState<Record<string, RelayStatusType>>({});

  // Prüft die Erreichbarkeit aller Relays per WebSocket
  useEffect(() => {
    let isMounted = true;
    const status: Record<string, RelayStatusType> = {};
    let checked = 0;
    if (relays.length === 0) {
      setRelayStatus({});
      return;
    }
    relays.forEach((relay) => {
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

  // Gibt die passende CSS-Klasse für den Status zurück
  function getStatusClass(status: RelayStatusType) {
    if (status === 'verbunden') return styles.statusVerbunden;
    if (status === 'prüfe…') return styles.statusPruefe;
    return styles.statusFehler;
  }

  // Rendert ein Relay mit Statuslabel
  function renderRelay(relay: string) {
    return (
      <li key={relay}>
        {relay}
        {relayStatus[relay] && (
          <span className={styles.statusLabel + ' ' + getStatusClass(relayStatus[relay])}>
            [{relayStatus[relay]}]
          </span>
        )}
      </li>
    );
  }

  return (
    <div className={styles.relayStatusRoot}>
      <div className={styles.relayStatusCard}>
        <ul className={styles.relayList}>
          {relays.length === 0 && <li>Keine Relays gesetzt</li>}
          {relays.map(renderRelay)}
        </ul>
      </div>
    </div>
  );
}
