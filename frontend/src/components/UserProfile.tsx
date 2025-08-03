import { useEffect, useState, useCallback } from 'react';
import { fetchProfileAndEvents } from '../utils/nostrUtils';
import type { NostrProfile } from '../utils/nostrUtils';
import { nip19 } from 'nostr-tools';
import styles from './UserProfile.module.scss';

type Props = {
  npub: string;
  relays: string[];
  groupMembersHex?: string[]; // Optional machen
  showGroupStatus?: boolean; // Optional: Gruppenstatus anzeigen/verstecken
};

/**
 * Zeigt das Nostr-Profil eines Users an.
 * Holt die Profildaten von den angegebenen Relays.
 */
export function UserProfile({ 
  npub, 
  relays, 
  groupMembersHex = [], 
  showGroupStatus = true 
}: Props) {
  const [profile, setProfile] = useState<NostrProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pubkeyHex, setPubkeyHex] = useState<string>('');

  // Dekodiere npub zu hex
  useEffect(() => {
    try {
      const decoded = nip19.decode(npub);
      if (decoded.type === 'npub') {
        setPubkeyHex(decoded.data as string);
      } else {
        throw new Error('Ungültiger npub');
      }
    } catch (e) {
      console.error('Fehler beim Dekodieren des npub:', e);
      setError('Ungültiger npub');
      setPubkeyHex('');
    }
  }, [npub]);

  // Prüfe Gruppenmitgliedschaft
  const isGroupMember = useCallback(() => {
    if (!pubkeyHex || !Array.isArray(groupMembersHex) || groupMembersHex.length === 0) {
      return false;
    }
    
    const normalizedMembers = groupMembersHex.map(hex => hex.trim().toLowerCase());
    const normalizedPubkey = pubkeyHex.trim().toLowerCase();
    
    return normalizedMembers.includes(normalizedPubkey);
  }, [pubkeyHex, groupMembersHex]);

  // Lädt das Profil asynchron
  const loadProfile = useCallback(async () => {
    if (!npub || !pubkeyHex) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Lade Profil für ${npub}...`);
      const { profile } = await fetchProfileAndEvents({ 
        npub, 
        relays, 
        limit: 1 
      });
      
      setProfile(profile);
      console.log('Profil geladen:', profile);
    } catch (e: any) {
      console.error('Fehler beim Laden des Profils:', e);
      setError(e?.message || 'Fehler beim Laden des Profils');
    } finally {
      setLoading(false);
    }
  }, [npub, pubkeyHex, relays]);

  useEffect(() => {
    if (pubkeyHex) {
      loadProfile();
    }
  }, [pubkeyHex, loadProfile]);

  // Early returns für verschiedene Zustände
  if (!npub) {
    return <div className={styles.errorMsg}>Kein npub angegeben</div>;
  }

  if (error) {
    return (
      <div className={styles.errorCard}>
        <div className={styles.errorMsg}>❌ {error}</div>
        <button 
          onClick={loadProfile} 
          className={styles.retryButton}
          disabled={loading}
        >
          {loading ? 'Lade...' : 'Erneut versuchen'}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.loadingCard}>
        <div className={styles.loadingSpinner}>⏳</div>
        <div>Lade Profil...</div>
      </div>
    );
  }

  // Hilfsfunktion für das Profil-Rendering
  const renderProfile = () => (
    <div className={styles.profileCard}>
      {/* Profilbild */}
      <div className={styles.profileImageContainer}>
        {profile?.picture ? (
          <img 
            src={profile.picture} 
            alt="Profilbild" 
            className={styles.profileImage}
            onError={(e) => {
              // Fallback wenn Bild nicht lädt
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const fallback = target.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
        ) : null}
        <div 
          className={styles.profileImageFallback}
          style={{ display: profile?.picture ? 'none' : 'flex' }}
        >
          <span>👤</span>
        </div>
      </div>

      {/* Name und Display Name */}
      <div className={styles.profileName}>
        {profile?.display_name || profile?.name || 'Unbekannter User'}
      </div>

      {/* Gruppenmitgliedschaft */}
      {showGroupStatus && groupMembersHex.length > 0 && (
        <div className={styles.profileStatus}>
          {isGroupMember() ? (
            <span className={styles.memberBadge}>
              ✅ Gruppenmitglied
            </span>
          ) : (
            <span className={styles.nonMemberBadge}>
              🚫 Kein Mitglied
            </span>
          )}
        </div>
      )}

      {/* About/Bio */}
      {profile?.about && (
        <div className={styles.profileAbout}>
          {profile.about.length > 200 
            ? `${profile.about.substring(0, 200)}...` 
            : profile.about
          }
        </div>
      )}

      {/* Website */}
      {profile?.website && (
        <div className={styles.profileWebsite}>
          <a 
            href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
            target="_blank" 
            rel="noopener noreferrer"
            className={styles.websiteLink}
          >
            🔗 {profile.website}
          </a>
        </div>
      )}

      {/* Weitere Nostr-Felder */}
      {profile?.nip05 && (
        <div className={styles.profileNip05}>
          <span className={styles.nip05Badge}>
            ✓ {profile.nip05}
          </span>
        </div>
      )}

      {/* npub anzeigen (gekürzt) */}
      <div className={styles.profileNpub}>
        <span className={styles.npubValue}>
          {npub}
        </span>
      </div>

      {/* Debug Info (nur in Development) */}
      {import.meta.env.DEV && (
        <details className={styles.debugInfo}>
          <summary>Debug Info</summary>
          <div>
            <div><strong>Pubkey Hex:</strong> {pubkeyHex}</div>
            <div><strong>Ist Gruppenmitglied:</strong> {isGroupMember() ? 'Ja' : 'Nein'}</div>
            <div><strong>Gruppenmitglieder:</strong> {groupMembersHex.length}</div>
            <div><strong>Relays:</strong> {relays.join(', ')}</div>
          </div>
        </details>
      )}
    </div>
  );

  return (
    <div className={styles.userProfileRoot}>
      {profile ? renderProfile() : (
        <div className={styles.noProfileCard}>
          <div className={styles.noProfileIcon}>👤</div>
          <div className={styles.noProfileText}>Kein Profil gefunden</div>
          <div className={styles.noProfileSubtext}>
            Der User hat noch kein öffentliches Profil erstellt
          </div>
          <button 
            onClick={loadProfile} 
            className={styles.retryButton}
            disabled={loading}
          >
            Erneut suchen
          </button>
        </div>
      )}
    </div>
  );
}