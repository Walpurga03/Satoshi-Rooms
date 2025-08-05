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
  rules?: string;
  closed?: boolean;
  public?: boolean;
}

interface GroupAdmin {
  pubkey: string;
  permissions?: string[];
  added_at?: number;
}

interface GroupStats {
  totalMessages: number;
  todayMessages: number;
  weekMessages: number;
  activeUsers: number;
  profilesLoaded: number;
  averageMessageLength: number;
  mostActiveUser: string;
  oldestMessage: Date | null;
  newestMessage: Date | null;
}

// === Konfiguration ===
const groupId = import.meta.env.VITE_GROUP_ID;
const groupRelay = import.meta.env.VITE_GROUP_RELAY;
const relays = (import.meta.env.VITE_NOSTR_RELAY || '').split(',').map((r: string) => r.trim()).filter(Boolean);

export function GroupInfo({ 
  relay, 
  showAdvancedStats = true,
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

  // === Berechne erweiterte Statistiken ===
  const groupStats = useMemo((): GroupStats => {
    if (messages.length === 0) {
      return {
        totalMessages: 0,
        todayMessages: 0,
        weekMessages: 0,
        activeUsers: 0,
        profilesLoaded: 0,
        averageMessageLength: 0,
        mostActiveUser: '',
        oldestMessage: null,
        newestMessage: null
      };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const todayMessages = messages.filter(m => 
      new Date(m.created_at * 1000) >= today
    ).length;

    const weekMessages = messages.filter(m => 
      new Date(m.created_at * 1000) >= weekAgo
    ).length;

    const averageMessageLength = messages.reduce((sum, m) => sum + m.content.length, 0) / messages.length;

    const userMessageCounts = messages.reduce((counts, m) => {
      counts[m.pubkey] = (counts[m.pubkey] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const mostActiveUserPubkey = Object.entries(userMessageCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || '';

    const mostActiveUser = userProfiles[mostActiveUserPubkey]?.display_name 
      || userProfiles[mostActiveUserPubkey]?.name 
      || mostActiveUserPubkey.slice(0, 8);

    const sortedMessages = [...messages].sort((a, b) => a.created_at - b.created_at);
    const oldestMessage = sortedMessages[0] ? new Date(sortedMessages[0].created_at * 1000) : null;
    const newestMessage = sortedMessages[sortedMessages.length - 1] ? new Date(sortedMessages[sortedMessages.length - 1].created_at * 1000) : null;

    return {
      totalMessages: messages.length,
      todayMessages,
      weekMessages,
      activeUsers: uniquePubkeys.length,
      profilesLoaded: Object.keys(userProfiles).length,
      averageMessageLength: Math.round(averageMessageLength),
      mostActiveUser,
      oldestMessage,
      newestMessage
    };
  }, [messages, uniquePubkeys, userProfiles]);

  // === Gruppendaten laden ===
  const fetchGroupData = useCallback(async () => {
    if (!groupId) return;
    
    let isCancelled = false;
    const pool = new SimplePool();
    const relaysToUse = groupRelay ? [groupRelay] : [relay];
    
    setLoading(true);
    setError(null);

    try {
      console.log('🔄 Lade NIP-29 Gruppendaten...');
      
      // 1. Gruppen-Metadaten laden (Kind 39000)
      console.log('📋 Suche Gruppen-Metadaten...');
      const metadataFilter: Filter = {
        kinds: [39000],
        '#h': [groupId],
        limit: 10,
      };
      
      const metadataEvents = await pool.querySync(relaysToUse, metadataFilter);
      console.log(`📋 ${metadataEvents.length} Metadaten-Events gefunden`);
      
      if (metadataEvents.length > 0 && !isCancelled) {
        // Neuestes Metadaten-Event nehmen
        const latestMetadata = metadataEvents.sort((a, b) => b.created_at - a.created_at)[0];
        try {
          const metadata = JSON.parse(latestMetadata.content);
          setGroupMetadata(metadata);
          console.log('📋 Gruppen-Metadaten:', metadata);
        } catch (e) {
          console.error('Fehler beim Parsen der Gruppen-Metadaten:', e);
        }
      }

      // 2. Gruppen-Administratoren laden (Kind 39001)
      console.log('👑 Suche Gruppen-Administratoren...');
      const adminsFilter: Filter = {
        kinds: [39001],
        '#h': [groupId],
        limit: 10,
      };
      
      const adminEvents = await pool.querySync(relaysToUse, adminsFilter);
      console.log(`👑 ${adminEvents.length} Admin-Events gefunden`);
      
      if (adminEvents.length > 0 && !isCancelled) {
        const latestAdminEvent = adminEvents.sort((a, b) => b.created_at - a.created_at)[0];
        try {
          // Admin-Liste aus p-Tags extrahieren
          const adminPubkeys = latestAdminEvent.tags
            .filter(tag => tag[0] === 'p')
            .map(tag => ({
              pubkey: tag[1],
              permissions: tag[2] ? tag[2].split(',') : [],
              added_at: latestAdminEvent.created_at
            }));
          
          setGroupAdmins(adminPubkeys);
          console.log('👑 Gruppen-Administratoren:', adminPubkeys);
        } catch (e) {
          console.error('Fehler beim Parsen der Admin-Daten:', e);
        }
      }

      // 3. Gruppen-Nachrichten laden (Kind 9)
      console.log('💬 Suche Gruppen-Nachrichten...');
      const groupMessagesFilter: Filter = {
        kinds: [9],
        '#h': [groupId],
        limit: 200,
      };
      
      const groupEvents = await pool.querySync(relaysToUse, groupMessagesFilter);
      console.log(`💬 ${groupEvents.length} Nachrichten gefunden`);

      if (isCancelled) return;

      const messageData = groupEvents.map(event => ({
        id: event.id,
        content: event.content,
        created_at: event.created_at,
        pubkey: event.pubkey,
        tags: event.tags,
        kind: event.kind,
      }));

      setMessages(messageData);

      // 4. Alle einzigartigen Pubkeys sammeln (User + Admins)
      const messageUsers = Array.from(new Set(groupEvents.map(e => e.pubkey)));
      const adminUsers = groupAdmins.map(admin => admin.pubkey);
      const allUsers = Array.from(new Set([...messageUsers, ...adminUsers]));
      
      setUniquePubkeys(allUsers);

      // 5. Profile für alle User laden
      if (allUsers.length > 0) {
        console.log(`👤 Lade Profile für ${allUsers.length} User...`);
        const profilesFilter: Filter = {
          kinds: [0],
          authors: allUsers,
          limit: 200,
        };

        const allRelays = [...new Set([...relaysToUse, ...relays])];
        const profileEvents = await pool.querySync(allRelays, profilesFilter);
        
        const profiles: Record<string, UserProfile> = {};
        profileEvents.forEach(event => {
          try {
            const profileData = JSON.parse(event.content);
            profiles[event.pubkey] = profileData;
          } catch (e) {
            console.error('Fehler beim Parsen des Profils:', e);
          }
        });
        
        if (!isCancelled) {
          setUserProfiles(profiles);
          console.log(`👤 ${Object.keys(profiles).length} Profile geladen`);
        }
      }

      setLastUpdate(new Date());

    } catch (e) {
      if (!isCancelled) {
        console.error('❌ Fehler beim Laden der Gruppendaten:', e);
        setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
      }
    } finally {
      if (!isCancelled) {
        setLoading(false);
      }
      pool.close([...relaysToUse, ...relays]);
    }
  }, [relay, groupId, groupAdmins]);

  // === Effects ===
  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      console.log('🔄 Auto-Refresh der Gruppendaten...');
      fetchGroupData();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchGroupData]);

  // === Helper Components ===
  const StatCard = ({ icon, label, value, subtitle }: {
    icon: string;
    label: string;
    value: React.ReactNode;
    subtitle?: string;
  }) => (
    <div className={styles.statCard}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statContent}>
        <div className={styles.statValue}>{value}</div>
        <div className={styles.statLabel}>{label}</div>
        {subtitle && <div className={styles.statSubtitle}>{subtitle}</div>}
      </div>
    </div>
  );

  const AdminCard = ({ admin }: { admin: GroupAdmin }) => {
    const profile = userProfiles[admin.pubkey];
    return (
      <div className={styles.adminCard}>
        {profile?.picture && (
          <img 
            src={profile.picture} 
            alt="Admin Avatar" 
            className={styles.adminAvatar}
          />
        )}
        <div className={styles.adminInfo}>
          <div className={styles.adminName}>
            {profile?.display_name || profile?.name || `Admin ${admin.pubkey.slice(0, 8)}`}
          </div>
          {profile?.nip05 && (
            <div className={styles.adminVerified}>✓ {profile.nip05}</div>
          )}
          <div className={styles.adminPubkey}>
            {admin.pubkey.slice(0, 16)}...
          </div>
        </div>
        <div className={styles.adminBadge}>👑</div>
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
  if (loading && messages.length === 0) {
    return (
      <div className={styles.groupProfileRoot}>
        <div className={styles.loadingCard}>
          <div className={styles.loadingSpinner}>⏳</div>
          <div className={styles.loadingText}>Analysiere NIP-29 Gruppendaten...</div>
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
    {/* Gruppen-Header mit Name und Bild */}
    <div className={styles.headerCard}>
      <div className={styles.headerContent}>
        <div className={styles.headerLeft}>
          {groupMetadata?.picture ? (
            <img 
              src={groupMetadata.picture} 
              alt="Gruppenbild" 
              className={styles.groupImage}
            />
          ) : (
            <div className={styles.groupImagePlaceholder}>👥</div>
          )}
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
            title="Aktualisieren"
          >
            {loading ? '⏳' : '🔄'}
          </button>
          {lastUpdate && (
            <div className={styles.lastUpdate}>
              🕒 {lastUpdate.toLocaleTimeString('de-DE')}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Gruppen-Administratoren */}
    {groupAdmins.length > 0 && (
      <div className={styles.adminsCard}>
        <div className={styles.adminsHeader}>
          <h3>👑 Administratoren ({groupAdmins.length})</h3>
        </div>
        <div className={styles.adminsList}>
          {groupAdmins.map(admin => (
            <AdminCard key={admin.pubkey} admin={admin} />
          ))}
        </div>
      </div>
    )}

    {/* Basis-Statistiken */}
    <div className={styles.statsGrid}>
      <StatCard 
        icon="💬" 
        label="Nachrichten" 
        value={groupStats.totalMessages}
        subtitle="gesamt"
      />
      <StatCard 
        icon="👥" 
        label="Aktive User" 
        value={groupStats.activeUsers}
        subtitle="erkannt"
      />
      <StatCard 
        icon="📅" 
        label="Heute" 
        value={groupStats.todayMessages}
        subtitle="Nachrichten"
      />
      <StatCard 
        icon="🔗" 
        label="Profile" 
        value={`${groupStats.profilesLoaded}/${groupStats.activeUsers}`}
        subtitle="geladen"
      />
    </div>


    {/* Detaillierte Informationen */}
    <div className={styles.detailsCard}>
      <div 
        className={styles.detailsHeader}
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
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
              <span className={styles.monospace} title={groupId}>
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
          
          {showAdvancedStats && (
            <>
              <InfoRow 
                icon="📈" 
                label="Diese Woche" 
                value={`${groupStats.weekMessages} Nachrichten`}
              />
              <InfoRow 
                icon="📏" 
                label="Ø Nachrichtenlänge" 
                value={`${groupStats.averageMessageLength} Zeichen`}
              />
              <InfoRow 
                icon="⭐" 
                label="Aktivster User" 
                value={groupStats.mostActiveUser || 'Unbekannt'}
              />
              {groupStats.oldestMessage && (
                <InfoRow 
                  icon="📅" 
                  label="Erste Nachricht" 
                  value={groupStats.oldestMessage.toLocaleDateString('de-DE')}
                />
              )}
              {groupStats.newestMessage && (
                <InfoRow 
                  icon="🆕" 
                  label="Letzte Nachricht" 
                  value={groupStats.newestMessage.toLocaleString('de-DE')}
                />
              )}
            </>
          )}

          {/* Gruppen-Regeln falls vorhanden */}
          {groupMetadata?.rules && (
            <div className={styles.rulesSection}>
              <InfoRow 
                icon="📜" 
                label="Regeln" 
                value={
                  <div className={styles.rulesText}>
                    {groupMetadata.rules}
                  </div>
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>

  </div>
);
}