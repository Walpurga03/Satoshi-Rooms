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
  // === NIP-29 Status ===
  status?: 'public, open' | 'public, closed' | 'private, open' | 'private, closed' | 'unmanaged' | 'unknown';
  managedByRelay?: boolean;
  // === Zusätzliche NIP-29 Metadaten ===
  visibility?: 'public' | 'private' | 'unknown';
  access?: 'open' | 'closed' | 'unknown';
  memberCount?: number;
  createdAt?: number;
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
      console.log('🔍 NIP-29 konforme Gruppendaten-Abfrage für:', groupId.slice(0, 16));
      
      // === SCHRITT 1: LADE ECHTE RELAY-METADATEN ===
      console.log('📡 Suche nach echten Relay-Metadaten (kind:39000-39003)...');
      
      const metadataFilter: Filter = {
        kinds: [39000, 39001, 39002, 39003], // Alle Gruppen-Metadaten
        '#d': [groupId], // NIP-29: Metadaten nutzen 'd' tag, nicht 'h'
        limit: 50,
      };
      
      const metadataEvents = await pool.querySync(relaysToUse, metadataFilter);
      console.log('📥 Relay-Metadaten Events gefunden:', metadataEvents.length);
      
      // Gruppiere Events nach Art
      const groupMetadataEvent = metadataEvents.find(e => e.kind === 39000);
      const groupAdminsEvent = metadataEvents.find(e => e.kind === 39001);
      
      // === SCHRITT 2: EXTRAHIERE ECHTE METADATEN ===
      let realMetadata: GroupMetadata = {};
      let realAdmins: GroupAdmin[] = [];
      let groupStatus: GroupMetadata['status'] = 'unknown'; // Typisierung korrigiert!

      if (groupMetadataEvent) {
        console.log('✅ Echte Gruppen-Metadaten gefunden (kind:39000)');
        console.log('📋 Metadaten Event:', {
          id: groupMetadataEvent.id.slice(0, 8),
          pubkey: groupMetadataEvent.pubkey.slice(0, 8), // Relay Schlüssel
          created_at: new Date(groupMetadataEvent.created_at * 1000).toLocaleString(),
          content: groupMetadataEvent.content,
          tags: groupMetadataEvent.tags
        });
        
        // Extrahiere aus Tags (NIP-29 Format)
        const tags = groupMetadataEvent.tags;
        const nameTag = tags.find(tag => tag[0] === 'name');
        const pictureTag = tags.find(tag => tag[0] === 'picture');
        const aboutTag = tags.find(tag => tag[0] === 'about');
        const publicTag = tags.find(tag => tag[0] === 'public');
        const privateTag = tags.find(tag => tag[0] === 'private');
        const openTag = tags.find(tag => tag[0] === 'open');
        const closedTag = tags.find(tag => tag[0] === 'closed');
        
        realMetadata = {
          name: nameTag?.[1] || `Gruppe ${groupId.slice(0, 8)}`,
          about: aboutTag?.[1] || 'NIP-29 Gruppe',
          picture: pictureTag?.[1]
        };
        
        // === KORREKTE STATUS-BESTIMMUNG MIT TYPESAFETY ===
        const visibility = publicTag ? 'public' : privateTag ? 'private' : 'unknown';
        const access = openTag ? 'open' : closedTag ? 'closed' : 'unknown';
        
        // Kombiniere zu gültigem Status-Typ
        if (visibility === 'public' && access === 'open') {
          groupStatus = 'public, open';
        } else if (visibility === 'public' && access === 'closed') {
          groupStatus = 'public, closed';
        } else if (visibility === 'private' && access === 'open') {
          groupStatus = 'private, open';
        } else if (visibility === 'private' && access === 'closed') {
          groupStatus = 'private, closed';
        } else {
          groupStatus = 'unknown';
        }
        
        console.log('📊 Extrahierte Metadaten:', realMetadata);
        console.log('🔐 Gruppen-Status:', groupStatus);
        
      } else {
        console.log('⚠️ Keine echten Metadaten gefunden - Fallback auf Nachrichten-Analyse');
        groupStatus = 'unmanaged'; // NIP-29: Gruppe ohne Relay-Management
      }
      
      // === SCHRITT 3: EXTRAHIERE ECHTE ADMINS ===
      if (groupAdminsEvent) {
        console.log('✅ Echte Admin-Liste gefunden (kind:39001)');
        console.log('📋 Admin Event:', {
          id: groupAdminsEvent.id.slice(0, 8),
          content: groupAdminsEvent.content,
          p_tags: groupAdminsEvent.tags.filter(tag => tag[0] === 'p').length
        });
        
        // Extrahiere p-Tags (NIP-29: ["p", "pubkey", "role1", "role2", ...])
        const adminTags = groupAdminsEvent.tags.filter(tag => tag[0] === 'p');
        
        realAdmins = adminTags.map(tag => ({
          pubkey: tag[1],
          permissions: tag.slice(2), // Alle weiteren Elemente sind Rollen
          added_at: groupAdminsEvent.created_at
        }));
        
        console.log('👑 Extrahierte Admins:', realAdmins.map(admin => ({
          pubkey: admin.pubkey.slice(0, 8),
          roles: admin.permissions
        })));
        
      } else {
        console.log('⚠️ Keine echte Admin-Liste gefunden');
      }
      
      // === SCHRITT 4: FALLBACK FALLS KEINE RELAY-METADATEN ===
      if (!groupMetadataEvent) {
        console.log('🔄 Fallback: Analysiere erste Nachrichten...');
        
        // Lade Nachrichten für Fallback-Analyse
        const messagesFilter: Filter = {
          kinds: [9], // NIP-29: Gruppen-Nachrichten
          '#h': [groupId], // NIP-29: Nachrichten nutzen 'h' tag
          limit: 200,
        };
        
        const messageEvents = await pool.querySync(relaysToUse, messagesFilter);
        
        if (messageEvents.length > 0) {
          const sortedMessages = messageEvents.sort((a, b) => a.created_at - b.created_at);
          const firstMessage = sortedMessages[0];
          
          // Einfache Namens-Extraktion aus erster Nachricht
          const content = firstMessage.content;
          const patterns = [
            /willkommen (?:in|bei|zu|in der|bei der|im)\s+(.+?)!/i,
            /welcome to\s+(.+?)!/i,
            /(.+?)\s+(?:gruppe|group)/i,
          ];
          
          let fallbackName = null;
          for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match && match[1] && match[1].length >= 3) {
              fallbackName = match[1].trim();
              break;
            }
          }
          
          realMetadata = {
            name: fallbackName || `Gruppe ${groupId.slice(0, 8)}`,
            about: 'Unmanaged NIP-29 Gruppe (keine Relay-Metadaten)',
          };
          
          // Fallback-Admin (Ersteller der ersten Nachricht)
          if (realAdmins.length === 0) {
            realAdmins = [{
              pubkey: firstMessage.pubkey,
              permissions: ['inferred-founder'],
              added_at: firstMessage.created_at
            }];
          }
        }
      }
      
      // === SCHRITT 5: LADE NACHRICHTEN ===
      console.log('💬 Lade Gruppen-Nachrichten...');
      const messagesFilter: Filter = {
        kinds: [9],
        '#h': [groupId],
        limit: 1000,
      };
      
      const messageEvents = await pool.querySync(relaysToUse, messagesFilter);
      const messageData = messageEvents.map(event => ({
        id: event.id,
        content: event.content,
        created_at: event.created_at,
        pubkey: event.pubkey,
        tags: event.tags,
        kind: event.kind,
      }));
      
      // === SCHRITT 6: LADE PROFILE ===
      const allUserPubkeys = Array.from(new Set([
        ...messageEvents.map(e => e.pubkey),
        ...realAdmins.map(admin => admin.pubkey)
      ]));
      
      let profiles: Record<string, UserProfile> = {};
      if (allUserPubkeys.length > 0) {
        const profilesFilter: Filter = {
          kinds: [0],
          authors: allUserPubkeys,
          limit: 200,
        };
        
        const profileEvents = await pool.querySync([...relaysToUse, ...relays], profilesFilter);
        profileEvents.forEach(event => {
          try {
            profiles[event.pubkey] = JSON.parse(event.content);
          } catch (e) {
            console.error('Profil-Parsing Fehler:', e);
          }
        });
      }
      
      // === SCHRITT 7: SETZE FINALE DATEN ===
      const visibility = groupMetadataEvent ? 
        (groupMetadataEvent.tags.find(tag => tag[0] === 'public') ? 'public' : 
         groupMetadataEvent.tags.find(tag => tag[0] === 'private') ? 'private' : 'unknown') : 'unknown';

      const access = groupMetadataEvent ? 
        (groupMetadataEvent.tags.find(tag => tag[0] === 'open') ? 'open' : 
         groupMetadataEvent.tags.find(tag => tag[0] === 'closed') ? 'closed' : 'unknown') : 'unknown';

      setGroupMetadata({
        ...realMetadata,
        // NIP-29 spezifische Daten
        status: groupStatus,
        managedByRelay: !!groupMetadataEvent,
        visibility,
        access,
        memberCount: allUserPubkeys.length,
        createdAt: groupMetadataEvent?.created_at
      });
      
      setGroupAdmins(realAdmins);
      setMessages(messageData);
      setUniquePubkeys(Array.from(new Set(messageEvents.map(e => e.pubkey))));
      setUserProfiles(profiles);
      setLastUpdate(new Date());
      
      console.log('🎉 === NIP-29 GRUPPENDATEN GELADEN ===');
      console.log('📊 Zusammenfassung:', {
        name: realMetadata.name,
        status: groupStatus,
        managedByRelay: !!groupMetadataEvent,
        admins: realAdmins.length,
        messages: messageData.length,
        profiles: Object.keys(profiles).length,
        members: allUserPubkeys.length
      });

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

  // === Status Display Helper ===
  function getStatusDisplay(status?: GroupMetadata['status']) {
    switch (status) {
      case 'public, open':
        return { text: '🌐 Öffentlich, Offen', color: styles.statusSuccess };
      case 'public, closed':
        return { text: '🌐 Öffentlich, Geschlossen', color: styles.statusWarning };
      case 'private, open':
        return { text: '🔒 Privat, Offen', color: styles.statusWarning };
      case 'private, closed':
        return { text: '🔒 Privat, Geschlossen', color: styles.statusError };
      case 'unmanaged':
        return { text: '❌ Unmanaged', color: styles.statusError };
      default:
        return { text: 'Unbekannt', color: styles.statusNeutral };
    }
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
          {/* === GRUPPEN-IDENTIFIKATION === */}
          <div className={styles.infoSection}>
            <h4 className={styles.infoSectionTitle}>🔍 Gruppen-Identifikation</h4>
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
                icon="📅" 
                label="Erstellt am" 
                value={
                  groupMetadata?.createdAt ? 
                  new Date(groupMetadata.createdAt * 1000).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : 'Unbekannt'
                }
              />
              <InfoRow 
                icon="👥" 
                label="Mitglieder" 
                value={`${groupMetadata?.memberCount || stats.activeUsers} aktive User`}
              />
            </div>
          </div>

          {/* === RELAY-KONFIGURATION === */}
          <div className={styles.infoSection}>
            <h4 className={styles.infoSectionTitle}>🌐 Relay-Konfiguration</h4>
            <div className={styles.infoGrid}>
              <InfoRow 
                icon="🔗" 
                label="Hauptrelay" 
                value={
                  <span className={styles.relayUrl}>
                    {groupRelay || relay}
                  </span>
                }
              />
              <InfoRow 
                icon="🌐" 
                label="Backup Relays" 
                value={
                  <span className={styles.relayCount}>
                    {relays.length} konfiguriert
                  </span>
                }
              />
              <InfoRow 
                icon="📡" 
                label="Relay-Typ" 
                value={
                  <span className={styles.relayType}>
                    NIP-29 kompatibel
                  </span>
                }
              />
            </div>
          </div>

          {/* === NIP-29 STATUS === */}
          <div className={styles.infoSection}>
            <h4 className={styles.infoSectionTitle}>⚙️ NIP-29 Protokoll-Status</h4>
            <div className={styles.infoGrid}>
              <InfoRow 
                icon="🎛️" 
                label="Relay-Management" 
                value={
                  <span className={
                    groupMetadata?.managedByRelay ? styles.statusSuccess : styles.statusError
                  }>
                    {groupMetadata?.managedByRelay ? '✅ Aktiv verwaltet' : '❌ Unmanaged Gruppe'}
                  </span>
                }
              />
              <InfoRow 
                icon="⚙️" 
                label="Gruppen-Status" 
                value={
                  (() => {
                    const statusDisplay = getStatusDisplay(groupMetadata?.status);
                    return (
                      <span className={statusDisplay.color}>
                        {statusDisplay.text}
                      </span>
                    );
                  })()
                }
              />
              {groupMetadata?.visibility && (
                <InfoRow 
                  icon="👁️" 
                  label="Sichtbarkeit" 
                  value={
                    <span className={`${styles.statusBadge} ${
                      groupMetadata.visibility === 'public' ? styles.badgePublic : styles.badgePrivate
                    }`}>
                      {groupMetadata.visibility === 'public' ? '🌐 Öffentlich lesbar' : '🔒 Nur für Mitglieder'}
                    </span>
                  }
                />
              )}
              {groupMetadata?.access && (
                <InfoRow 
                  icon="🚪" 
                  label="Zugangsart" 
                  value={
                    <span className={`${styles.statusBadge} ${
                      groupMetadata.access === 'open' ? styles.badgeOpen : styles.badgeClosed
                    }`}>
                      {groupMetadata.access === 'open' ? '🔓 Offen für Beitritte' : '🔐 Nur auf Einladung'}
                    </span>
                  }
                />
              )}
            </div>
          </div>

          {/* === DATEN-STATISTIKEN === */}
          <div className={styles.infoSection}>
            <h4 className={styles.infoSectionTitle}>📊 Daten-Statistiken</h4>
            <div className={styles.infoGrid}>
              <InfoRow 
                icon="💬" 
                label="Nachrichten total" 
                value={
                  <span className={styles.numberHighlight}>
                    {stats.totalMessages.toLocaleString('de-DE')}
                  </span>
                }
              />
              <InfoRow 
                icon="👤" 
                label="Profile geladen" 
                value={
                  <span className={`${styles.profileProgress} ${
                    stats.profilePercentage === 100 ? styles.profileComplete : 
                    stats.profilePercentage >= 70 ? styles.profileGood : styles.profilePoor
                  }`}>
                    {stats.profileStatus}
                  </span>
                }
              />
              <InfoRow 
                icon="🕒" 
                label="Letztes Update" 
                value={
                  lastUpdate ? 
                  lastUpdate.toLocaleTimeString('de-DE') : 'Nie'
                }
              />
            </div>
          </div>

          {/* === PROTOKOLL-EVENTS === */}
          {groupMetadata?.managedByRelay && (
            <div className={styles.infoSection}>
              <h4 className={styles.infoSectionTitle}>📋 Verfügbare Protokoll-Events</h4>
              <div className={styles.eventTypes}>
                <span className={styles.eventType}>
                  ✅ kind:39000 (Metadaten)
                </span>
                <span className={styles.eventType}>
                  ✅ kind:39001 (Admins)
                </span>
                <span className={styles.eventType}>
                  ✅ kind:9 (Nachrichten)
                </span>
                <span className={styles.eventTypeNote}>
                  📝 Vollständig NIP-29 konform
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}