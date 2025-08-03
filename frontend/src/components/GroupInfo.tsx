import { useEffect, useState } from 'react';
import { SimplePool } from 'nostr-tools';
import type { Filter } from 'nostr-tools';
import styles from './GroupInfo.module.scss';

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

// === Konfiguration ===
// Gruppen-ID und Gruppen-Relay aus .env
const groupId = import.meta.env.VITE_GROUP_ID;
const groupRelay = import.meta.env.VITE_GROUP_RELAY;

// Relays aus .env (Komma-separiert)
const relays = (import.meta.env.VITE_NOSTR_RELAY || '').split(',').map((r: string) => r.trim()).filter(Boolean);

export function GroupInfo({ relay }: Props) {
  // === State ===
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const [uniquePubkeys, setUniquePubkeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // === Gruppen-Events & User-Profile laden ===
  useEffect(() => {
    if (!groupId) return;
    let isCancelled = false;
    const pool = new SimplePool();
    const relaysToUse = groupRelay ? [groupRelay] : [relay];
    setLoading(true);
    setError(null);

    async function fetchGroupData() {
      try {
        console.log('Analysiere NIP-29 Gruppendaten...');
        // 1. Gruppen-Nachrichten (Kind 9) laden
        const groupMessagesFilter: Filter = {
          kinds: [9],
          '#h': [groupId],
          limit: 50,
        };
        const groupEvents = await pool.querySync(relaysToUse, groupMessagesFilter);
        console.log('Detaillierte Gruppen-Events:', groupEvents);

        // 2. Nachrichten-Objekte erzeugen
        if (groupEvents.length > 0) {
          const messageData = groupEvents.map(event => ({
            id: event.id,
            content: event.content,
            created_at: event.created_at,
            pubkey: event.pubkey,
            tags: event.tags,
            kind: event.kind,
          }));
          setMessages(messageData);

          // 3. Einzigartige Pubkeys extrahieren
          const uniqueKeys = Array.from(new Set(groupEvents.map(e => e.pubkey)));
          setUniquePubkeys(uniqueKeys);
          console.log('Aktive User in der Gruppe:', uniqueKeys);

          // 4. Profile laden (erst Gruppen-Relay, dann Relays aus .env)
          if (uniqueKeys.length > 0) {
            const profilesFilter: Filter = {
              kinds: [0],
              authors: uniqueKeys,
              limit: 100,
            };
            // Erst vom Gruppen-Relay versuchen
            console.log('Suche Profile auf Gruppen-Relay...');
            let profileEvents = await pool.querySync(relaysToUse, profilesFilter);
            console.log('Profile vom Gruppen-Relay:', profileEvents.length);
            // Falls keine Profile gefunden, von Relays aus .env laden
            if (profileEvents.length === 0) {
              console.log('Suche Profile auf Relays aus .env...');
              profileEvents = await pool.querySync(relays, profilesFilter);
              console.log('Profile von Relays aus .env gefunden:', profileEvents.length);
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
            if (!isCancelled) setUserProfiles(profiles);
          }
        }

        // Debug: Beispiel-Event Struktur
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
        if (!isCancelled) setLoading(false);
        pool.close([...relaysToUse, ...relays]);
      }
    }

    fetchGroupData();
    return () => {
      isCancelled = true;
      pool.close([...relaysToUse, ...relays]);
    };
  }, [relay, groupId]);

  // === Hilfs-Komponente für Info-Zeilen ===
  function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
      <div>
        <span className={styles.groupInfoLabel}>{label}</span>
        {value}
      </div>
    );
  }

  // === Render ===
  if (loading) return <div>Analysiere NIP-29 Gruppendaten…</div>;
  if (error) return <div className={styles.noData}>Fehler: {error}</div>;

  return (
    <div className={styles.groupProfileRoot}>
      <div className={styles.sectionCard}>
        <InfoRow label="Gruppen-ID:" value={groupId} />
        <InfoRow label="Relay:" value={groupRelay || relay} />
        <InfoRow label="Nachrichten gefunden:" value={messages.length} />
        <InfoRow label="Erkannte User:" value={uniquePubkeys.length} />
        <InfoRow label="Profile geladen:" value={Object.keys(userProfiles).length} />
      </div>
    </div>
  );
}