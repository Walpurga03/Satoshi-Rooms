// GroupJoinRequest.tsx
import { useState } from 'react';
import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';

type Props = {
  privkey: string;
  groupId: string;
  groupRelay: string;
  onJoinSuccess?: () => void;
};

export function GroupJoinRequest({ privkey, groupId, groupRelay, onJoinSuccess }: Props) {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const requestGroupJoin = async () => {
    setJoining(true);
    setError(null);
    setSuccess(null);

    try {

      const privkeyBytes = hexToBytes(privkey);
      const pubkeyHex = getPublicKey(privkeyBytes);

      // NIP-29: Kind 9021 für Beitrittsanfragen
      const joinEvent = {
        kind: 9021,
        pubkey: pubkeyHex,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['h', groupId], // Gruppen-ID
        ],
        content: 'Bitte um Gruppenbeitritt', // Optionale Nachricht
      };


      const signedEvent = finalizeEvent(joinEvent, privkeyBytes);

      // An Gruppen-Relay senden
      const result = await sendJoinRequest(groupRelay, signedEvent);
      
      if (result) {
        setSuccess('✅ Beitrittsanfrage gesendet! Warte auf Bestätigung durch Admin.');
        if (onJoinSuccess) onJoinSuccess();
      } else {
        setError('❌ Fehler beim Senden der Beitrittsanfrage');
      }

    } catch (e: any) {
      setError(e.message || 'Fehler beim Senden der Beitrittsanfrage');
    } finally {
      setJoining(false);
    }
  };

  const sendJoinRequest = (relayUrl: string, signedEvent: any): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(relayUrl);
        let responseReceived = false;

        const timeout = setTimeout(() => {
          if (!responseReceived) {
            ws.close();
            resolve(false);
          }
        }, 10000); // 10 Sekunden Timeout

        ws.onopen = () => {
          ws.send(JSON.stringify(['EVENT', signedEvent]));
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message[0] === 'OK' && message[1] === signedEvent.id) {
              responseReceived = true;
              clearTimeout(timeout);
              ws.close();
              resolve(message[2]); // true wenn erfolgreich
            }
          } catch (e) {
            console.error('Fehler beim Parsen der Antwort:', e);
          }
        };

        ws.onerror = (error) => {
          console.error(`WebSocket Fehler für ${relayUrl}:`, error);
          clearTimeout(timeout);
          resolve(false);
        };

        ws.onclose = () => {
          if (!responseReceived) {
            clearTimeout(timeout);
            resolve(false);
          }
        };

      } catch (e) {
        console.error(`Fehler beim Verbinden zu ${relayUrl}:`, e);
        resolve(false);
      }
    });
  };

  return (
    <div style={{ 
      padding: 20, 
      backgroundColor: '#fef3c7', 
      border: '2px solid #f59e0b', 
      borderRadius: 8,
      marginBottom: 20 
    }}>
      <h3 style={{ color: '#92400e', marginTop: 0 }}>
        🚪 Gruppenbeitritt erforderlich
      </h3>
      
      <p style={{ color: '#92400e' }}>
        Du bist noch nicht Mitglied dieser Gruppe. Um Nachrichten zu senden, musst du erst beitreten.
      </p>

      <button
        onClick={requestGroupJoin}
        disabled={joining}
        style={{
          padding: '10px 20px',
          backgroundColor: '#f59e0b',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          fontWeight: 600,
          cursor: joining ? 'not-allowed' : 'pointer',
          opacity: joining ? 0.7 : 1
        }}
      >
        {joining ? 'Sende Beitrittsanfrage...' : '🚪 Der Gruppe beitreten'}
      </button>

      {error && (
        <div style={{ 
          marginTop: 10, 
          padding: 10, 
          backgroundColor: '#fecaca', 
          color: '#991b1b', 
          borderRadius: 4 
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ 
          marginTop: 10, 
          padding: 10, 
          backgroundColor: '#dcfce7', 
          color: '#166534', 
          borderRadius: 4 
        }}>
          {success}
        </div>
      )}

      <div style={{ fontSize: 12, color: '#92400e', marginTop: 10 }}>
        <strong>Hinweis:</strong> Ein Gruppen-Administrator muss deine Anfrage bestätigen.
      </div>
    </div>
  );
}