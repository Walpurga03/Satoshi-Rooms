import { useEffect, useState } from 'react';
import { fetchProfileAndEvents } from '../utils/nostrUtils';
import type { NostrProfile } from '../utils/nostrUtils';
import styles from './UserProfile.module.scss';


type Props = {
  npub: string;
  relays: string[];
};

export function UserProfile({ npub, relays }: Props) {
  const [profile, setProfile] = useState<NostrProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded || profile) return;
    setLoading(true);
    fetchProfileAndEvents({ npub, relays, limit: 1 })
      .then(({ profile }) => {
        setProfile(profile);
        setError(null);
        setLoaded(true);
      })
      .catch((e) => setError(e.message || 'Fehler beim Laden'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [npub, relays, loaded]);

  if (loading) return <div>Lade Profil…</div>;
  if (error) return <div className={styles.errorMsg}>{error}</div>;

  return (
    <div className={styles.userProfileRoot}>
      {profile ? (
        <div className={styles.profileCard}>
          {/* Npub row styled like a card row */}
          <div className={styles.npubRow}>
            <span className={styles.npubValue}>{npub || 'Nicht gesetzt'}</span>
          </div>
          {profile.picture && (
            <img src={profile.picture} alt="Profilbild" className={styles.profileImage} />
          )}
          <div className={styles.profileName}>{profile.display_name || profile.name || 'Unbekannt'}</div>
          {profile.about && (
            <div className={styles.profileAbout}>{profile.about}</div>
          )}
        </div>
      ) : (
        <div>Kein Profil gefunden</div>
      )}
    </div>
  );
}
