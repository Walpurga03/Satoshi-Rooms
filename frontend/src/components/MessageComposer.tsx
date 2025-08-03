import React, { useState } from 'react';
import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
import styles from './MessageComposer.module.scss';
import { GroupJoinRequest } from './GroupJoinRequest';

type Props = {
  privkey: string;
  npub: string;
  groupId: string;
  onSend?: (text: string) => void;
};

export function MessageComposer({ privkey, groupId, onSend }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  const groupRelay = import.meta.env.VITE_GROUP_RELAY;

  const sendToRelay = (relayUrl: string, signedEvent: any): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(relayUrl);
        let responseReceived = false;

        const timeout = setTimeout(() => {
          if (!responseReceived) {
            ws.close();
            resolve(false);
          }
        }, 5000);

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
              if (!message[2] && message[3]?.includes('unknown member')) {
                setIsBlocked(true);
              }
              resolve(message[2]);
            }
          } catch (e) {
            console.error('Fehler beim Parsen der Relay-Antwort:', e);
          }
        };

        ws.onerror = () => {
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
        resolve(false);
      }
    });
  };

  const handleSend = async () => {
    if (text.trim().length === 0) return;

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const privkeyBytes = hexToBytes(privkey);
      const pubkeyHex = getPublicKey(privkeyBytes);
      const event = {
        kind: 9,
        pubkey: pubkeyHex,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['h', groupId],
        ],
        content: text.trim(),
      };

      const signedEvent = finalizeEvent(event, privkeyBytes);

      // Nur an das Gruppen-Relay senden!
      const sendResult = await sendToRelay(groupRelay, signedEvent);

      if (sendResult) {
        setSuccess('✅ Nachricht erfolgreich gesendet!');
        setText('');
        if (onSend) onSend(text.trim());
      } else {
        throw new Error('Nachricht konnte nicht gesendet werden');
      }

    } catch (e: any) {
      setError(e.message || 'Fehler beim Senden der Nachricht!');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  React.useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  if (isBlocked) {
    return (
      <GroupJoinRequest
        privkey={privkey}
        groupId={groupId}
        groupRelay={groupRelay}
        onJoinSuccess={() => setIsBlocked(false)}
      />
    );
  }

  return (
    <div className={styles.composerCard}>
      <div className={styles.composerRow}>
        <input
          className={styles.composerInput}
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Nachricht für NIP-29 Gruppe eingeben…"
          disabled={sending}
          maxLength={280}
        />
        <button
          className={styles.composerButton}
          onClick={handleSend}
          disabled={sending || text.trim().length === 0}
        >
          {sending ? 'Sende...' : 'Senden'}
        </button>
      </div>
      <div className={styles.composerMeta}>
        <span className={text.length > 250 ? styles.warning : ''}>
          {text.length}/280
        </span>
      </div>
      {error && (
        <div className={styles.composerError}>
          ❌ {error}
        </div>
      )}
      {success && (
        <div className={styles.composerSuccess}>
          {success}
        </div>
      )}
      <div className={styles.composerDebug}>
        <small>
          Ziel: Gruppe {groupId?.slice(0, 16)}... | Relay: {groupRelay}
        </small>
      </div>
    </div>
  );
}