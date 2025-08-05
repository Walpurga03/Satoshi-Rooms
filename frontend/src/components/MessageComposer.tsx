import React, { useState, useRef, useEffect } from 'react';
import { finalizeEvent, getPublicKey } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';
import styles from './MessageComposer.module.scss';
import { GroupJoinRequest } from './GroupJoinRequest';

type Props = {
  privkey: string;
  npub: string;
  groupId: string;
  onSend?: (text: string) => void;
  maxLength?: number;
};

export function MessageComposer({ 
  privkey, 
  groupId, 
  onSend,
  maxLength = 280 
}: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  
  const groupRelay = import.meta.env.VITE_GROUP_RELAY;

  // Emoji Picker außerhalb schließen
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current && 
        !emojiPickerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Emoji zum Text hinzufügen
  const addEmoji = (emoji: string) => {
    setText(prev => prev + emoji);
    inputRef.current?.focus();
  };

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
          console.log('📤 Verbindung zum Relay hergestellt, sende Event...');
          ws.send(JSON.stringify(['EVENT', signedEvent]));
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('📥 Relay-Antwort:', message);
            if (message[0] === 'OK' && message[1] === signedEvent.id) {
              responseReceived = true;
              clearTimeout(timeout);
              ws.close();
              if (!message[2] && message[3]?.includes('unknown member')) {
                console.warn('⚠️ Benutzer ist kein Gruppenmitglied');
                setIsBlocked(true);
              }
              resolve(message[2]);
            }
          } catch (e) {
            console.error('Fehler beim Parsen der Relay-Antwort:', e);
          }
        };

        ws.onerror = (err) => {
          console.error('WebSocket Fehler:', err);
          clearTimeout(timeout);
          resolve(false);
        };

        ws.onclose = () => {
          if (!responseReceived) {
            console.log('WebSocket wurde geschlossen ohne Antwort');
            clearTimeout(timeout);
            resolve(false);
          }
        };

      } catch (e) {
        console.error('Fehler beim Senden an Relay:', e);
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
      console.log('📤 Sende NIP-29 Gruppennachricht...');
      
      const event = {
        kind: 9,
        pubkey: pubkeyHex,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['h', groupId],
        ],
        content: text.trim(),
      };

      console.log('✅ NIP-29 Event erstellt:', event);
      const signedEvent = finalizeEvent(event, privkeyBytes);
      console.log('✅ NIP-29 Event signiert:', signedEvent);

      // Nur an das Gruppen-Relay senden!
      const sendResult = await sendToRelay(groupRelay, signedEvent);

      if (sendResult) {
        console.log('🎉 ✅ Nachricht erfolgreich an Group-Relay gesendet!');
        setSuccess('✅ Nachricht erfolgreich gesendet!');
        setText('');
        if (onSend) onSend(text.trim());
      } else {
        throw new Error('Nachricht konnte nicht gesendet werden');
      }

    } catch (e: any) {
      console.error('❌ Fehler beim Senden der Nachricht:', e);
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

  // Automatisches Success-Message verschwinden
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Bei Blockierung die JoinRequest-Komponente anzeigen
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

  // Gängige Emojis für schnellen Zugriff
  const quickEmojis = ['😊', '👍', '🎉', '❤️', '🔥', '😂', '🚀', '✅'];

  return (
    <div className={styles.composerCard}>
      <div className={styles.composerRow}>
        <textarea
          ref={inputRef}
          className={styles.composerInput}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Nachricht für NIP-29 Gruppe eingeben…"
          disabled={sending}
          maxLength={maxLength}
          rows={1}
          style={{ height: 'auto', minHeight: '48px' }}
        />
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            className={styles.emojiButton}
            onClick={() => setShowEmojiPicker(prev => !prev)}
            type="button"
            aria-label="Emoji einfügen"
          >
            😀
          </button>
          
          <button
            className={styles.composerButton}
            onClick={handleSend}
            disabled={sending || text.trim().length === 0}
            aria-label={sending ? "Nachricht wird gesendet" : "Nachricht senden"}
          >
            {sending ? 'Sende...' : 'Senden'}
          </button>
        </div>
        
        {showEmojiPicker && (
          <div className={styles.emojiPickerWrapper} ref={emojiPickerRef}>
            <div style={{ 
              background: '#232136', 
              padding: '8px', 
              display: 'flex', 
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              {quickEmojis.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => addEmoji(emoji)}
                  style={{ 
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5em',
                    cursor: 'pointer',
                    padding: '5px',
                    borderRadius: '4px',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(167, 139, 250, 0.2)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'none';
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      <div className={styles.composerMeta}>
        <span className={text.length > maxLength * 0.9 ? styles.warning : ''}>
          {text.length}/{maxLength}
          {text.length > maxLength * 0.9 && text.length <= maxLength && ' ⚠️'}
          {text.length === maxLength && ' (Maximum erreicht)'}
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