import { useEffect, useState, useCallback, useMemo } from 'react';
import { SimplePool } from 'nostr-tools';
import type { Filter } from 'nostr-tools';
import styles from './GroupInfo.module.scss';

type Props = {
  relay: string;
  showAdvancedStats?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
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
  nip05?: string;
}

interface GroupMetadata {
  name?: string;
  about?: string;
  picture?: string;
}

interface GroupAdmin {
  pubkey: string;
  permissions?: string[];
  added_at?: number;
}

// === Konfiguration ===
const groupId = import.meta.env.VITE_GROUP_ID;
const groupRelay = import.meta.env.VITE_GROUP_RELAY;
const relays = (import.meta.env.VITE_NOSTR_RELAY || '').split(',').map((r: string) => r.trim()).filter(Boolean);

export function GroupInfo({ 
  relay, 
  autoRefresh = false,
  refreshInterval = 60
}: Props) {
  // === State ===
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const [uniquePubkeys, setUniquePubkeys] = useState<string[]>([]);
  const [groupMetadata, setGroupMetadata] = useState<GroupMetadata | null>(null);
  const [groupAdmins, setGroupAdmins] = useState<GroupAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // === Erweiterte Statistiken ===
  const stats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayMessages = messages.filter(m => new Date(m.created_at * 1000) >= today).length;
    
    const profilesLoaded = Object.keys(userProfiles).length;
    const totalUsers = uniquePubkeys.length;
    const profilePercentage = totalUsers > 0 ? Math.round((profilesLoaded / totalUsers) * 100) : 0;
    
    return {
      totalMessages: messages.length,
      todayMessages,
      activeUsers: totalUsers,
      profilesLoaded,
      profilePercentage,
      profileStatus: `${profilesLoaded}/${totalUsers} (${profilePercentage}%)`
    };
  }, [messages, uniquePubkeys, userProfiles]);

  // === Gruppendaten laden ===
  const fetchGroupData = useCallback(async () => {
    if (!groupId) return;
    
    const pool = new SimplePool();
    const relaysToUse = groupRelay ? [groupRelay] : [relay];
    
    setLoading(true);
    setError(null);

    try {
      
      // Lade alle Events
      const allEventsFilter: Filter = {
        kinds: [9, 39000], // Nachrichten + Metadaten
        '#h': [groupId],
        limit: 1000,
      };
      
      const allEvents = await pool.querySync(relaysToUse, allEventsFilter);
      
      if (allEvents.length === 0) {
        throw new Error('Keine Gruppendaten gefunden');
      }
      
      // Sortiere chronologisch (älteste zuerst)
      const sortedEvents = allEvents.sort((a, b) => a.created_at - b.created_at);
      const firstEvent = sortedEvents[0];
      
      // === ERKENNE GRUPPENNAME UND ADMIN ===
      let foundName = null;
      let foundDescription = null;
      
      // Admin = Ersteller des ersten Events
      const foundAdmin = {
        pubkey: firstEvent.pubkey,
        permissions: ['founder'],
        added_at: firstEvent.created_at
      };
      
      // Metadaten-Event?
      if (firstEvent.kind === 39000) {
        try {
          const metadata = JSON.parse(firstEvent.content);
          foundName = metadata.name;
          foundDescription = metadata.about;
        } catch (e) {
          console.log('Metadaten-Parsing fehlgeschlagen');
        }
      }
      
      // Erste Nachricht analysieren
      if (!foundName && firstEvent.kind === 9) {
        const content = firstEvent.content;
        
        // Einfache Patterns für Gruppennamen
        const patterns = [
          /willkommen (?:in|bei|zu|in der|bei der|im)\s+(.+?)!/i,
          /welcome to\s+(.+?)!/i,
          /(.+?)\s+(?:gruppe|group)/i,
        ];
        
        for (const pattern of patterns) {
          const match = content.match(pattern);
          if (match && match[1] && match[1].length >= 3) {
            foundName = match[1].trim();
            break;
          }
        }
      }
      
      // Kontextuelle Beschreibung
      if (foundName && !foundDescription) {
        if (foundName.toLowerCase().includes('vorarlberg')) {
          foundDescription = 'Eine regionale Nostr-Community aus Vorarlberg, Österreich.';
        } else if (foundName.toLowerCase().includes('telegram')) {
          foundDescription = 'Eine Telegram-Bridge Gruppe für Nostr-Kommunikation.';
        } else if (foundName.toLowerCase().includes('bitcoin')) {
          foundDescription = 'Eine Gruppe für Bitcoin-Enthusiasten und Diskussionen.';
        } else {
          foundDescription = `Eine NIP-29 Diskussionsgruppe mit ${allEvents.length} Events.`;
        }
      }
      
      // Fallbacks
      const finalName = foundName || `Gruppe ${groupId.slice(0, 8)}`;
      const finalDescription = foundDescription || 'NIP-29 Gruppe';
      
      // === SETZE DATEN ===
      setGroupMetadata({
        name: finalName,
        about: finalDescription,
      });
      
      setGroupAdmins([foundAdmin]);
      
      // Nachrichten
      const messageEvents = allEvents.filter(e => e.kind === 9);
      const messageData = messageEvents.map(event => ({
        id: event.id,
        content: event.content,
        created_at: event.created_at,
        pubkey: event.pubkey,
        tags: event.tags,
        kind: event.kind,
      }));
      
      setMessages(messageData);
      setUniquePubkeys(Array.from(new Set(messageEvents.map(e => e.pubkey))));
      setLastUpdate(new Date());
      
      // === LADE ALLE USER-PROFILE, NICHT NUR ADMIN ===
      const allUserPubkeys = Array.from(new Set(messageEvents.map(e => e.pubkey)));
      
      if (allUserPubkeys.length > 0) {
        const profilesFilter: Filter = {
          kinds: [0],
          authors: allUserPubkeys, // ALLE User, nicht nur Admin
          limit: 100, // Erhöht von 10 auf 100
        };
        
        const profileEvents = await pool.querySync([...relaysToUse, ...relays], profilesFilter);
        const profiles: Record<string, UserProfile> = {};
        
        profileEvents.forEach(event => {
          try {
            profiles[event.pubkey] = JSON.parse(event.content);
          } catch (e) {
            console.error('Profil-Parsing Fehler:', e);
          }
        });
        
        setUserProfiles(profiles);
        
      }
    } catch (e) {
      console.error('❌ Fehler:', e);
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
      pool.close([...relaysToUse, ...relays]);
    }
  }, [relay, groupId]);

  // === Nur Profile neu laden ===
  const refreshProfiles = useCallback(async () => {
    if (uniquePubkeys.length === 0) return;
    
    setLoading(true);
    const pool = new SimplePool();
    const relaysToUse = groupRelay ? [groupRelay] : [relay];
    
    try {      
      const profilesFilter: Filter = {
        kinds: [0],
        authors: uniquePubkeys,
        limit: 200,
      };
      
      const profileEvents = await pool.querySync([...relaysToUse, ...relays], profilesFilter);
      const profiles: Record<string, UserProfile> = {};
      
      profileEvents.forEach(event => {
        try {
          profiles[event.pubkey] = JSON.parse(event.content);
        } catch (e) {
          console.error('Profil-Parsing Fehler:', e);
        }
      });
      
      setUserProfiles(profiles);
      
    } catch (e) {
      console.error('❌ Fehler beim Profile-Refresh:', e);
    } finally {
      setLoading(false);
      pool.close([...relaysToUse, ...relays]);
    }
  }, [uniquePubkeys, relay, groupRelay]);

  // === Effects ===
  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchGroupData, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchGroupData]);

  // === Helper Components ===
  const StatCard = ({ icon, label, value }: {
    icon: string;
    label: string;
    value: React.ReactNode;
  }) => (
    <div className={styles.statCard}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statContent}>
        <div className={styles.statValue}>{value}</div>
        <div className={styles.statLabel}>{label}</div>
      </div>
    </div>
  );

  const AdminCard = ({ admin }: { admin: GroupAdmin }) => {
    const profile = userProfiles[admin.pubkey];
    
    // Formatiere den vollständigen npub
    const formatNpub = (pubkey: string) => {
      return `npub1${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
    };
    
    return (
      <div className={styles.adminCard}>
        {profile?.picture ? (
          <img 
            src={profile.picture} 
            alt="Admin Avatar" 
            className={styles.adminAvatar}
          />
        ) : (
          <div className={styles.adminAvatarPlaceholder}>
            {profile?.display_name?.[0] || profile?.name?.[0] || '👑'}
          </div>
        )}
        <div className={styles.adminInfo}>
          <div className={styles.adminName}>
            {profile?.display_name || profile?.name || 'Gruppenadmin'}
          </div>
          {profile?.nip05 && (
            <div className={styles.adminVerified}>
              ✅ {profile.nip05}
            </div>
          )}
          <div className={styles.adminPubkey}>
            {formatNpub(admin.pubkey)}
          </div>
          {profile?.about && (
            <div className={styles.adminAbout}>
              {profile.about}
            </div>
          )}
        </div>
        <div className={styles.adminBadge}>
          <div className={styles.adminBadgeIcon}>👑</div>
          <div className={styles.adminBadgeLabel}>
            Gründer
          </div>
        </div>
      </div>
    );
  };

  const InfoRow = ({ icon, label, value }: {
    icon: string;
    label: string;
    value: React.ReactNode;
  }) => (
    <div className={styles.infoRow}>
      <span className={styles.infoIcon}>{icon}</span>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{value}</span>
    </div>
  );

  // === Loading State ===
  if (loading && !groupMetadata) {
    return (
      <div className={styles.groupProfileRoot}>
        <div className={styles.loadingCard}>
          <div className={styles.loadingSpinner}>⏳</div>
          <div className={styles.loadingText}>Lade Gruppendaten...</div>
        </div>
      </div>
    );
  }

  // === Error State ===
  if (error) {
    return (
      <div className={styles.groupProfileRoot}>
        <div className={styles.errorCard}>
          <div className={styles.errorIcon}>❌</div>
          <div className={styles.errorText}>{error}</div>
          <button 
            onClick={fetchGroupData} 
            className={styles.retryButton}
            disabled={loading}
          >
            {loading ? '⏳ Lädt...' : '🔄 Erneut versuchen'}
          </button>
        </div>
      </div>
    );
  }

  // === Main Render ===
  return (
    <div className={styles.groupProfileRoot}>
      {/* Header */}
      <div className={styles.headerCard}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <div className={styles.groupImagePlaceholder}>👥</div>
            <div className={styles.headerText}>
              <h2 className={styles.headerTitle}>
                {groupMetadata?.name || 'NIP-29 Gruppe'}
              </h2>
              <div className={styles.groupDescription}>
                {groupMetadata?.about || 'Keine Beschreibung verfügbar'}
              </div>
              <div className={styles.groupId}>
                ID: {groupId?.slice(0, 16)}...
              </div>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button 
              onClick={fetchGroupData}
              className={styles.refreshButton}
              disabled={loading}
              title="Alle Daten neu laden"
            >
              {loading ? '⏳' : '🔄'}
            </button>
            <button 
              onClick={refreshProfiles}
              className={styles.profileRefreshButton}
              disabled={loading || uniquePubkeys.length === 0}
              title="Nur Profile neu laden"
            >
              👤
            </button>
            {lastUpdate && (
              <div className={styles.lastUpdate}>
                🕒 {lastUpdate.toLocaleTimeString('de-DE')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Admin */}
      {groupAdmins.length > 0 && (
        <div className={styles.adminsCard}>
          <div className={styles.adminsHeader}>
            <h3>👑 Administrator</h3>
          </div>
          <div className={styles.adminsList}>
            {groupAdmins.map(admin => (
              <AdminCard key={admin.pubkey} admin={admin} />
            ))}
          </div>
        </div>
      )}

      {/* Statistiken */}
      <div className={styles.statsGrid}>
        <StatCard 
          icon="💬" 
          label="Nachrichten" 
          value={stats.totalMessages}
        />
        <StatCard 
          icon="👥" 
          label="Aktive User" 
          value={stats.activeUsers}
        />
        <StatCard 
          icon="📅" 
          label="Heute" 
          value={stats.todayMessages}
        />
        <StatCard 
          icon="🔗" 
          label="Profile geladen" 
          value={
            <div className={styles.profileStatus}>
              <span className={styles.profileStatusText}>{stats.profileStatus}</span>
              {stats.profilePercentage === 100 ? (
                <span className={styles.profileStatusSuccess}>✅</span>
              ) : stats.profilePercentage >= 70 ? (
                <span className={styles.profileStatusWarning}>⚠️</span>
              ) : (
                <span className={styles.profileStatusError}>❌</span>
              )}
            </div>
          }
        />
      </div>

      {/* Details */}
      <div className={styles.detailsCard}>
        <div 
          className={styles.detailsHeader}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h3>📊 Technische Details</h3>
          <span className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}>
            ▼
          </span>
        </div>
        
        <div className={`${styles.detailsContent} ${isExpanded ? styles.expanded : ''}`}>
          <div className={styles.infoGrid}>
            <InfoRow 
              icon="🆔" 
              label="Gruppen-ID" 
              value={
                <span className={styles.monospace}>
                  {groupId?.slice(0, 32)}...
                </span>
              }
            />
            <InfoRow 
              icon="🔗" 
              label="Hauptrelay" 
              value={groupRelay || relay}
            />
            <InfoRow 
              icon="🌐" 
              label="Backup Relays" 
              value={`${relays.length} konfiguriert`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}