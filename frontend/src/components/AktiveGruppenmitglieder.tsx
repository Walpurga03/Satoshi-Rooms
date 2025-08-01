
import { useEffect, useState } from 'react';
import { SimplePool } from 'nostr-tools';
import type { Filter } from 'nostr-tools';
import styles from './AktiveGruppenmitglieder.module.scss';

type Props = {
  relay: string;
};

interface GroupMessage {
  id: string;
  content: string;
  created_at: number;
  pubkey: string;
  tags: string[][];
  kind: number;
}

interface UserProfile {
  display_name?: string;
  name?: string;
  about?: string;
  picture?: string;
}

// NIP-29 Konfiguration
const groupId = import.meta.env.VITE_GROUP_ID;
const groupRelay = import.meta.env.VITE_GROUP_RELAY;

// Standard Nostr Relays für User-Profile
const PROFILE_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
  'wss://relay.snort.social'
];

export function AktiveGruppenmitglieder({ relay }: Props) {
  const [open, setOpen] = useState(true);
  const [_messages, setMessages] = useState<GroupMessage[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const [uniquePubkeys, setUniquePubkeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    
    let isCancelled = false;
    const pool = new SimplePool();
    
    const relaysToUse = groupRelay ? [groupRelay] : [relay];
    
    setLoading(true);
    setError(null);

    const analyzeGroupData = async () => {
      try {
        console.log('Analysiere NIP-29 Gruppendaten...');
        
        // 1. Lade Gruppen-Nachrichten (Kind 9)
        const groupMessagesFilter: Filter = {
          kinds: [9],
          '#h': [groupId],
          limit: 50
        };
        
        const groupEvents = await pool.querySync(relaysToUse, groupMessagesFilter);
        console.log('Detaillierte Gruppen-Events:', groupEvents);
        
        if (groupEvents.length > 0) {
          const messageData = groupEvents.map(event => ({
            id: event.id,
            content: event.content,
            created_at: event.created_at,
            pubkey: event.pubkey,
            tags: event.tags,
            kind: event.kind
          }));
          
          setMessages(messageData);
          
          // 2. Extrahiere einzigartige Pubkeys aus den Nachrichten
          const uniqueKeys = Array.from(new Set(groupEvents.map(e => e.pubkey)));
          setUniquePubkeys(uniqueKeys);
          console.log('Aktive User in der Gruppe:', uniqueKeys);
          
          // 3. Versuche Profile zu laden - erst vom Gruppen-Relay, dann von Standard-Relays
          if (uniqueKeys.length > 0) {
            const profilesFilter: Filter = {
              kinds: [0],
              authors: uniqueKeys,
              limit: 100
            };
            
            // Erst vom Gruppen-Relay versuchen
            console.log('Suche Profile auf Gruppen-Relay...');
            let profileEvents = await pool.querySync(relaysToUse, profilesFilter);
            console.log('Profile vom Gruppen-Relay:', profileEvents.length);
            
            // Falls keine Profile gefunden, von Standard-Relays laden
            if (profileEvents.length === 0) {
              console.log('Suche Profile auf Standard-Relays...');
              profileEvents = await pool.querySync(PROFILE_RELAYS, profilesFilter);
              console.log('Profile von Standard-Relays gefunden:', profileEvents.length);
            }
            
            const profiles: Record<string, UserProfile> = {};
            profileEvents.forEach(event => {
              try {
                const profileData = JSON.parse(event.content);
                profiles[event.pubkey] = profileData;
                console.log(`Profil geladen für ${event.pubkey.slice(0, 16)}: ${profileData.display_name || profileData.name}`);
              } catch (e) {
                console.error('Fehler beim Parsen des Profils:', e);
              }
            });
            
            if (!isCancelled) {
              setUserProfiles(profiles);
            }
          }
        }

        // 4. Analysiere Event-Struktur für Debug
        if (groupEvents.length > 0) {
          console.log('Beispiel-Event Struktur:');
          console.log('Kind:', groupEvents[0].kind);
          console.log('Tags:', groupEvents[0].tags);
          console.log('Content:', groupEvents[0].content);
          console.log('Pubkey:', groupEvents[0].pubkey);
        }
        
      } catch (e) {
        if (!isCancelled) {
          console.error('Fehler beim Analysieren:', e);
          setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
        pool.close([...relaysToUse, ...PROFILE_RELAYS]);
      }
    };

    analyzeGroupData();
    
    return () => {
      isCancelled = true;
      pool.close([...relaysToUse, ...PROFILE_RELAYS]);
    };
  }, [relay, groupId]);

  if (loading) return <div>Analysiere NIP-29 Gruppendaten…</div>;
  if (error) return <div className={styles.noData}>Fehler: {error}</div>;


  return (
    <div className={styles.groupProfileRoot}>
      <div
        className={styles.collapseHeader}
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={open ? 'Gruppenbereich zuklappen' : 'Gruppenbereich aufklappen'}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(v => !v); }}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <h2 className={styles.collapseHeadline}>
          AktiveGruppenmitglieder
          <span className={styles.collapseArrow} aria-hidden="true"/>
        </h2>
      </div>
      <div
        className={styles.collapseContent}
        style={{ maxHeight: open ? 2000 : 0, overflow: 'hidden', transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1)' }}
        aria-hidden={!open}
      >
        {uniquePubkeys.length > 0 ? (
          <div className={styles.sectionCard}>
            <div className={styles.sectionTitle}>({uniquePubkeys.length})</div>
            {uniquePubkeys.map(pubkey => {
              const profile = userProfiles[pubkey];
              return (
                <div key={pubkey} className={styles.memberRow}>
                  {profile?.picture && (
                    <img src={profile.picture} alt="Avatar" className={styles.profileImage} />
                  )}
                  <div>
                    <span className={styles.memberName}>
                      {profile?.display_name || profile?.name || 'Unbekannter User'}
                    </span>
                    <div className={styles.memberPubkey}>
                      {pubkey.slice(0, 16)}...
                      {!profile && <span className={styles.noProfile}>(Kein Profil gefunden)</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.noData}>Keine Gruppendaten gefunden</div>
        )}
      </div>
    </div>
  );
}