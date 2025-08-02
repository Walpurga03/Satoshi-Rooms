import { useEffect, useState, useCallback } from 'react';
import { fetchProfileAndEvents } from '../utils/nostrUtils';
import type { NostrProfile } from '../utils/nostrUtils';
import styles from './UserProfile.module.scss';


type Props = {
  npub: string;
  relays: string[];
};

/**
 * Zeigt das Nostr-Profil eines Users an.
 * Holt die Profildaten von den angegebenen Relays.
 */
export function UserProfile({ npub, relays }: Props) {
  const [profile, setProfile] = useState<NostrProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lädt das Profil asynchron
  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { profile } = await fetchProfileAndEvents({ npub, relays, limit: 1 });
      setProfile(profile);
    } catch (e: any) {
      setError(e?.message || 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }, [npub, relays]);

  useEffect(() => {
    if (npub) loadProfile();
  }, [npub, relays, loadProfile]);

  // Early returns für Lade- und Fehlerzustand
  if (!npub) return <div className={styles.errorMsg}>Kein npub gesetzt</div>;
  if (loading) return <div>Lade Profil…</div>;
  if (error) return <div className={styles.errorMsg}>{error}</div>;

  // Hilfsfunktion für das Profil-Rendering
  const renderProfile = () => (
    <div className={styles.profileCard}>
      <div className={styles.npubRow}>
        <span className={styles.npubValue}>{npub}</span>
      </div>
      {profile?.picture ? (
        <img src={profile.picture} alt="Profilbild" className={styles.profileImage} />
      ) : (
        <div className={styles.profileImage} style={{ background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span>?</span>
        </div>
      )}
      <div className={styles.profileName}>{profile?.display_name || profile?.name || 'Unbekannt'}</div>
      {profile?.about && (
        <div className={styles.profileAbout}>{profile.about}</div>
      )}
      {/* Optional: Weitere Felder */}
      {profile?.website && (
        <div>
          <a href={profile.website} target="_blank" rel="noopener noreferrer">
            {profile.website}
          </a>
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.userProfileRoot}>
      {profile ? renderProfile() : <div>Kein Profil gefunden</div>}
    </div>
  );
}
