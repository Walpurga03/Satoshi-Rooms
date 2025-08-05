import { useEffect, useState, useCallback, useMemo } from 'react';
import { SimplePool } from 'nostr-tools';
import type { Filter } from 'nostr-tools';
import styles from './AktiveGruppenmitglieder.module.scss';

type Props = {
  relay: string;
  reload?: number;
  showStats?: boolean;
  sortBy?: 'name' | 'activity' | 'joined';
  maxMembers?: number;
  showAdminBadges?: boolean;
  onMemberClick?: (pubkey: string, profile: UserProfile) => void;
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
  website?: string;
  lud16?: string; // Lightning Address
}

interface MemberStats {
  pubkey: string;
  messageCount: number;
  lastActivity: Date;
  firstActivity: Date;
  isAdmin: boolean;
}

interface GroupAdmin {
  pubkey: string;
  permissions?: string[];
}

// === Konfiguration ===
const groupId = import.meta.env.VITE_GROUP_ID;
const groupRelay = import.meta.env.VITE_GROUP_RELAY;
const relays = (import.meta.env.VITE_NOSTR_RELAY || '').split(',').map((r: string) => r.trim()).filter(Boolean);

export function AktiveGruppenmitglieder({ 
  relay, 
  reload,
  showStats = true,
  sortBy: sortByProp = 'activity',
  maxMembers = 50,
  showAdminBadges = true,
  onMemberClick
}: Props) {
  // === State ===
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const [uniquePubkeys, setUniquePubkeys] = useState<string[]>([]);
  const [groupAdmins, setGroupAdmins] = useState<GroupAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentMaxMembers, setCurrentMaxMembers] = useState(maxMembers); // <--- NEU
  const [sortBy, setSortBy] = useState<'name' | 'activity' | 'joined'>(sortByProp); // <--- NEU

  // === Berechne Member-Statistiken ===
  const memberStats = useMemo((): MemberStats[] => {
    const stats: Record<string, MemberStats> = {};
    
    messages.forEach(msg => {
      const pubkey = msg.pubkey;
      const msgDate = new Date(msg.created_at * 1000);
      
      if (!stats[pubkey]) {
        stats[pubkey] = {
          pubkey,
          messageCount: 0,
          lastActivity: msgDate,
          firstActivity: msgDate,
          isAdmin: groupAdmins.some(admin => admin.pubkey === pubkey)
        };
      }
      
      stats[pubkey].messageCount++;
      if (msgDate > stats[pubkey].lastActivity) {
        stats[pubkey].lastActivity = msgDate;
      }
      if (msgDate < stats[pubkey].firstActivity) {
        stats[pubkey].firstActivity = msgDate;
      }
    });
    
    return Object.values(stats);
  }, [messages, groupAdmins]);

  // === Sortierte und gefilterte Mitglieder ===
  const sortedMembers = useMemo(() => {
    let filtered = uniquePubkeys;
    
    // Suche filtern
    if (searchTerm) {
      filtered = filtered.filter(pubkey => {
        const profile = userProfiles[pubkey];
        const searchLower = searchTerm.toLowerCase();
        return (
          profile?.display_name?.toLowerCase().includes(searchLower) ||
          profile?.name?.toLowerCase().includes(searchLower) ||
          profile?.nip05?.toLowerCase().includes(searchLower) ||
          pubkey.toLowerCase().includes(searchLower)
        );
      });
    }
    
    // Sortieren
    return filtered.sort((a, b) => {
      const profileA = userProfiles[a];
      const profileB = userProfiles[b];
      const statsA = memberStats.find(s => s.pubkey === a);
      const statsB = memberStats.find(s => s.pubkey === b);
      
      switch (sortBy) {
        case 'name':
          const nameA = profileA?.display_name || profileA?.name || a.slice(0, 8);
          const nameB = profileB?.display_name || profileB?.name || b.slice(0, 8);
          return nameA.localeCompare(nameB);
          
        case 'activity':
          return (statsB?.messageCount || 0) - (statsA?.messageCount || 0);
          
        case 'joined':
          return (statsA?.firstActivity?.getTime() || 0) - (statsB?.firstActivity?.getTime() || 0);
          
        default:
          return 0;
      }
    }).slice(0, currentMaxMembers);
  }, [uniquePubkeys, userProfiles, memberStats, searchTerm, sortBy, currentMaxMembers]);

  // === Gruppendaten laden ===
  const fetchGroupData = useCallback(async () => {
    if (!groupId) return;
    
    let isCancelled = false;
    const pool = new SimplePool();
    const relaysToUse = groupRelay ? [groupRelay] : [relay];
    
    setLoading(true);
    setError(null);

    try {      
      // 1. Gruppen-Administratoren laden (Kind 39001)
      if (showAdminBadges) {
        const adminsFilter: Filter = {
          kinds: [39001],
          '#h': [groupId],
          limit: 10,
        };
        
        const adminEvents = await pool.querySync(relaysToUse, adminsFilter);
        if (adminEvents.length > 0 && !isCancelled) {
          const latestAdminEvent = adminEvents.sort((a, b) => b.created_at - a.created_at)[0];
          const adminPubkeys = latestAdminEvent.tags
            .filter(tag => tag[0] === 'p')
            .map(tag => ({
              pubkey: tag[1],
              permissions: tag[2] ? tag[2].split(',') : [],
            }));
          
          setGroupAdmins(adminPubkeys);
        }
      }

      // 2. Gruppen-Nachrichten laden (für Aktivitäts-Analyse)
      const groupMessagesFilter: Filter = {
        kinds: [9],
        '#h': [groupId],
        limit: 200, // Mehr Messages für bessere Statistiken
      };
      
      const groupEvents = await pool.querySync(relaysToUse, groupMessagesFilter);

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

      // 3. Einzigartige Pubkeys extrahieren
      const messageUsers = Array.from(new Set(groupEvents.map(e => e.pubkey)));
      const adminUsers = groupAdmins.map(admin => admin.pubkey);
      const allUsers = Array.from(new Set([...messageUsers, ...adminUsers]));
      
      setUniquePubkeys(allUsers);

      // 4. Profile laden
      if (allUsers.length > 0) {
        setProfilesLoading(true);
        
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
        
        setProfilesLoading(false);
      }

      setLastUpdate(new Date());

    } catch (e) {
      if (!isCancelled) {
        console.error('❌ Fehler beim Laden der Mitgliederdaten:', e);
        setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
      }
    } finally {
      if (!isCancelled) {
        setLoading(false);
        setProfilesLoading(false);
      }
      pool.close([...relaysToUse, ...relays]);
    }
  }, [relay, groupId, groupAdmins, showAdminBadges]);

  // === Effects ===
  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData, reload]);

  // === Helper Components ===
  const MemberCard = ({ pubkey }: { pubkey: string }) => {
    const profile = userProfiles[pubkey];
    const stats = memberStats.find(s => s.pubkey === pubkey);
    const isAdmin = groupAdmins.some(admin => admin.pubkey === pubkey);
    
    const handleClick = () => {
      if (onMemberClick && profile) {
        onMemberClick(pubkey, profile);
      }
    };

    return (
      <div 
        className={`${styles.memberCard} ${onMemberClick ? styles.clickable : ''}`}
        onClick={handleClick}
      >
        <div className={styles.memberAvatar}>
          {profile?.picture ? (
            <img 
              src={profile.picture} 
              alt="Avatar" 
              className={styles.avatarImage}
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const fallback = target.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
          ) : null}
          <div 
            className={styles.avatarFallback}
            style={{ display: profile?.picture ? 'none' : 'flex' }}
          >
            👤
          </div>
          {isAdmin && showAdminBadges && (
            <div className={styles.adminBadge} title="Administrator">👑</div>
          )}
        </div>

        <div className={styles.memberInfo}>
          <div className={styles.memberName}>
            {profile?.display_name || profile?.name || `User ${pubkey.slice(0, 8)}`}
          </div>
          
          {/* NEU: Aktivitäts-Level Badge */}
          {showStats && stats && (
            <div className={styles.activityBadge} 
                 data-level={stats.messageCount > 20 ? "high" : stats.messageCount > 5 ? "medium" : "low"}>
              {stats.messageCount > 20 ? "Sehr aktiv" : stats.messageCount > 5 ? "Aktiv" : "Neu"}
            </div>
          )}
          
          {profile?.nip05 && (
            <div className={styles.memberVerified}>
              ✓ {profile.nip05}
            </div>
          )}
          
          <div className={styles.memberPubkey}>
            {pubkey.slice(0, 16)}...
            {!profile && (
              <span className={styles.noProfile}> (Kein Profil)</span>
            )}
          </div>

          {showStats && stats && (
            <div className={styles.memberStats}>
              <span className={styles.statItem}>
                💬 {stats.messageCount}
              </span>
              <span className={styles.statItem}>
                🕒 {stats.lastActivity.toLocaleDateString('de-DE')}
              </span>
            </div>
          )}

          {profile?.about && (
            <div className={styles.memberBio}>
              {profile.about.length > 100 
                ? `${profile.about.substring(0, 100)}...` 
                : profile.about
              }
            </div>
          )}
        </div>

        {profile?.lud16 && (
          <div className={styles.lightningBadge} title="Lightning Address">
            ⚡
          </div>
        )}
      </div>
    );
  };

  // === Loading State ===
  if (loading && uniquePubkeys.length === 0) {
    return (
      <div className={styles.groupProfileRoot}>
        <div className={styles.loadingCard}>
          <div className={styles.loadingSpinner}>⏳</div>
          <div className={styles.loadingText}>Lade Gruppenmitglieder...</div>
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

  // Virtualisierte Liste für sehr viele Mitglieder
  const renderMemberCards = () => {
    // Wenn zu viele Mitglieder, nur die sichtbaren rendern
    if (sortedMembers.length > 50) {
      return (
        <div className={styles.virtualizedContainer}>
          {sortedMembers.slice(0, 20).map(pubkey => (
            <MemberCard key={pubkey} pubkey={pubkey} />
          ))}
          <button 
            className={styles.loadMoreButton}
            onClick={() => setCurrentMaxMembers(prev => Math.min(prev + 20, uniquePubkeys.length))}
          >
            Weitere laden ({Math.min(20, uniquePubkeys.length - currentMaxMembers)})
          </button>
        </div>
      );
    }
    
    // Sonst normal rendern
    return sortedMembers.map(pubkey => <MemberCard key={pubkey} pubkey={pubkey} />);
  };

// === Main Render ===
return (
  <div className={styles.groupProfileRoot}>
    <div className={styles.headerCard}>
      <div 
        className={styles.headerContent}
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
        <div className={styles.headerLeft}>
          <h2 className={styles.headerTitle}>
            👥 Aktive Mitglieder
            <span className={styles.memberCount}>({uniquePubkeys.length})</span>
            {loading && <span className={styles.loadingDot}>●</span>}
            {profilesLoading && <span className={styles.profileLoadingDot}>👤</span>}
          </h2>
        </div>
        
        <div className={styles.headerActions}>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              fetchGroupData();
            }}
            className={styles.refreshButton}
            disabled={loading}
            title="Aktualisieren"
          >
            🔄
          </button>
          <span 
            className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}
          >
            ▼
          </span>
        </div>
      </div>

      {/* Controls - nur wenn expanded */}
      {isExpanded && (
        <div className={styles.controlsBar}>
          <div className={styles.searchContainer}>
            <input
              type="text"
              placeholder="Mitglieder suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
            <span className={styles.searchIcon}>🔍</span>
          </div>
          
          <div className={styles.sortContainer}>
            <label className={styles.sortLabel}>Sortieren:</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'name' | 'activity' | 'joined')}
              className={styles.sortSelect}
            >
              <option value="activity">Nach Aktivität</option>
              <option value="name">Nach Name</option>
              <option value="joined">Nach Beitritt</option>
            </select>
          </div>

          <div className={styles.statsInfo}>
            <span>📊 {sortedMembers.length} angezeigt</span>
            <span>🔗 {Object.keys(userProfiles).length} Profile</span>
            {lastUpdate && (
              <span className={styles.lastUpdate}>
                🕒 {lastUpdate.toLocaleTimeString('de-DE')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>

    {/* Members List */}
    <div className={`${styles.membersContainer} ${isExpanded ? styles.expanded : styles.collapsed}`}>
      {sortedMembers.length > 0 ? (
        <div className={styles.membersGrid}>
          {renderMemberCards()}
          
          {/* Show more hint wenn limitiert */}
          {uniquePubkeys.length > currentMaxMembers && (
            <div className={styles.moreHint}>
              <div className={styles.moreIcon}>👀</div>
              <div className={styles.moreText}>
                ... und {uniquePubkeys.length - currentMaxMembers} weitere Mitglieder
              </div>
              <button 
                className={styles.showMoreButton}
                onClick={() => setCurrentMaxMembers(prev => prev + 20)}
              >
                Mehr anzeigen
              </button>
            </div>
          )}
        </div>
      ) : searchTerm ? (
        <div className={styles.noResults}>
          <div className={styles.noResultsIcon}>🔍</div>
          <div className={styles.noResultsText}>
            Keine Mitglieder gefunden für "{searchTerm}"
          </div>
          <button 
            className={styles.clearSearchButton}
            onClick={() => setSearchTerm('')}
          >
            Suche zurücksetzen
          </button>
        </div>
      ) : (
        <div className={styles.noMembers}>
          <div className={styles.noMembersIcon}>👥</div>
          <div className={styles.noMembersText}>
            Keine aktiven Mitglieder gefunden
          </div>
          <div className={styles.noMembersSubtext}>
            Möglicherweise sind noch keine Nachrichten in der Gruppe vorhanden
          </div>
        </div>
      )}
    </div>

    {/* Summary Stats - wenn collapsed */}
    {!isExpanded && uniquePubkeys.length > 0 && (
      <div className={styles.summaryStats}>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryIcon}>👥</span>
            <span className={styles.summaryValue}>{uniquePubkeys.length}</span>
            <span className={styles.summaryLabel}>Mitglieder</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryIcon}>👑</span>
            <span className={styles.summaryValue}>{groupAdmins.length}</span>
            <span className={styles.summaryLabel}>Admins</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryIcon}>🔗</span>
            <span className={styles.summaryValue}>{Object.keys(userProfiles).length}</span>
            <span className={styles.summaryLabel}>Profile</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryIcon}>💬</span>
            <span className={styles.summaryValue}>{messages.length}</span>
            <span className={styles.summaryLabel}>Nachrichten</span>
          </div>
        </div>
      </div>
    )}
  </div>
);
}