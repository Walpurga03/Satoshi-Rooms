import { useEffect, useState, useCallback, useMemo } from 'react';
import { SimplePool } from 'nostr-tools';
import type { Filter } from 'nostr-tools';
import styles from './LetzteNachrichten.module.scss';

// === Types ===
type Props = {
  relay: string;
  profileRelays: string[];
  reload?: number;
  maxMessages?: number;
  showDebugInfo?: boolean;
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
  replies?: number;
}

interface UserProfile {
  display_name?: string;
  name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
}

// === Konfiguration ===
const groupId = import.meta.env.VITE_GROUP_ID;
const PROFILE_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
  'wss://relay.snort.social'
];

export function LetzteNachrichten({ 
  relay, 
  profileRelays, 
  reload,
  maxMessages = 20,
  showDebugInfo = false,
  autoRefresh = false,
  refreshInterval = 30
}: Props) {
  // === State ===
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const [uniquePubkeys, setUniquePubkeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week'>('all');
  const [hasMore, setHasMore] = useState(false);
  const [since, setSince] = useState<number | undefined>(undefined);

  // === Memoized Values ===
  const messageStats = useMemo(() => {
    return {
      total: messages.length,
      today: messages.filter(m => 
        new Date(m.created_at * 1000).toDateString() === new Date().toDateString()
      ).length,
      uniqueUsers: uniquePubkeys.length,
      profilesLoaded: Object.keys(userProfiles).length
    };
  }, [messages, uniquePubkeys, userProfiles]);

  const filteredMessages = useMemo(() => {
    return messages
      .filter(message => {
        const matchesSearch = searchTerm === '' || 
          message.content.toLowerCase().includes(searchTerm.toLowerCase());

        const messageDate = new Date(message.created_at * 1000);
        const today = new Date();
        const weekAgo = new Date();
        weekAgo.setDate(today.getDate() - 7);

        const matchesDate = 
          dateFilter === 'all' ||
          (dateFilter === 'today' && messageDate.toDateString() === today.toDateString()) ||
          (dateFilter === 'week' && messageDate >= weekAgo);

        return matchesSearch && matchesDate;
      })
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, maxMessages);
  }, [messages, searchTerm, dateFilter, maxMessages]);

  // === Profile Loading ===
  const loadProfiles = useCallback(async (pubkeys: string[], pool: SimplePool) => {
    if (pubkeys.length === 0) return {};

    console.log('👤 Loading profiles for', pubkeys.length, 'users...');
    setProfilesLoading(true);
    
    const profilesFilter: Filter = {
      kinds: [0],
      authors: pubkeys,
      limit: 100,
    };

    try {
      const allRelays = [...new Set([relay, ...profileRelays, ...PROFILE_RELAYS])];
      const profileEvents = await pool.querySync(allRelays, profilesFilter);

      console.log('📥 Received', profileEvents.length, 'profile events');

      const profiles: Record<string, UserProfile> = {};
      let validProfiles = 0;
      
      profileEvents.forEach(event => {
        try {
          const profileData = JSON.parse(event.content);
          if (profileData && (profileData.name || profileData.display_name)) {
            profiles[event.pubkey] = profileData;
            validProfiles++;
          }
        } catch (e) {
          console.warn('Invalid profile data for pubkey:', event.pubkey.slice(0, 8));
        }
      });

      console.log('✅ Loaded', validProfiles, 'valid profiles');
      return profiles;
    } catch (e) {
      console.error('❌ Error loading profiles:', e);
      return {};
    } finally {
      setProfilesLoading(false);
    }
  }, [relay, profileRelays]);

  // === Main Data Fetching ===
  const fetchGroupData = useCallback(async (loadMore = false) => {
    if (!groupId) return;

    let isCancelled = false;
    const pool = new SimplePool();
    const relaysToUse = [relay];

    setLoading(true);
    setError(null);

    try {
      const groupMessagesFilter: Filter = {
        kinds: [9],
        '#h': [groupId],
        limit: 20,
        ...(loadMore && since ? { until: since } : {})
      };

      console.log('📡 Fetching messages...', { loadMore, since });
      
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

      setMessages(prevMessages => loadMore ? [...prevMessages, ...messageData] : messageData);
      setLastUpdate(new Date());

      const uniqueKeys = Array.from(new Set(groupEvents.map(e => e.pubkey)));
      setUniquePubkeys(uniqueKeys);

      // Profile laden
      const newUsers = uniqueKeys.filter(pubkey => !userProfiles[pubkey]);
      if (newUsers.length > 0) {
        const newProfiles = await loadProfiles(newUsers, pool);
        if (!isCancelled) {
          setUserProfiles(prev => ({ ...prev, ...newProfiles }));
        }
      }

      // Pagination
      if (groupEvents.length === 20) {
        setHasMore(true);
        const oldestEvent = [...groupEvents].sort((a, b) => a.created_at - b.created_at)[0];
        if (oldestEvent) {
          setSince(oldestEvent.created_at);
        }
      } else {
        setHasMore(false);
      }

    } catch (e) {
      if (!isCancelled) {
        setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
      }
    } finally {
      if (!isCancelled) {
        setLoading(false);
      }
      pool.close([...relaysToUse, ...profileRelays, ...PROFILE_RELAYS]);
    }
  }, [relay, groupId, userProfiles, loadProfiles, since]);

  // === Effects ===
  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData, reload]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchGroupData();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchGroupData]);

  // === Message Component ===
  const MessageItem = ({ message }: { message: GroupMessage }) => {
    const profile = userProfiles[message.pubkey];
    const messageDate = new Date(message.created_at * 1000);
    const isToday = messageDate.toDateString() === new Date().toDateString();
    const [isExpanded, setIsExpanded] = useState(false);

    const shortContent = message.content.length > 300 
      ? message.content.slice(0, 300) + "..." 
      : message.content;

    return (
      <div className={styles.messageCard}>
        <div className={styles.messageHeader}>
          {profile?.picture && (
            <img 
              src={profile.picture} 
              alt="Avatar" 
              className={styles.userAvatar}
              loading="lazy"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          )}
          <div className={styles.userInfo}>
            <span className={styles.memberName}>
              {profile?.display_name || profile?.name || `User ${message.pubkey.slice(0, 8)}`}
            </span>
            {profile?.nip05 && (
              <span className={styles.verifiedBadge}>✓</span>
            )}
            <span className={styles.messageTime}>
              {isToday 
                ? messageDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
                : messageDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
              }
            </span>
          </div>
        </div>
        
        <div 
          className={`${styles.messageContent} ${isExpanded ? styles.expanded : ''}`}
          onClick={() => message.content.length > 300 && setIsExpanded(!isExpanded)}
        >
          {isExpanded || message.content.length <= 300 
            ? message.content 
            : <>{shortContent} <span className={styles.readMore}>mehr lesen...</span></>}
        </div>

        {showDebugInfo && (
          <div className={styles.debugInfo}>
            <small>
              ID: {message.id.slice(0, 8)}... | 
              Kind: {message.kind} | 
              Tags: {message.tags.length}
            </small>
          </div>
        )}
      </div>
    );
  };

  // === Early Returns ===
  if (loading && messages.length === 0) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}>⏳</div>
        <div>Lade Gruppennachrichten...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorMessage}>❌ {error}</div>
        <button 
          onClick={() => fetchGroupData()} 
          className={styles.retryButton}
          disabled={loading}
        >
          {loading ? 'Lädt...' : 'Erneut versuchen'}
        </button>
      </div>
    );
  }

  // === Main Render ===
  return (
    <div className={styles.groupProfileRoot}>
      <div
        className={styles.collapseHeader}
        onClick={() => setOpen(v => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={e => { 
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(v => !v);
          }
        }}
      >
        <h2 className={styles.collapseHeadline}>
          💬 Letzte Nachrichten
          <span className={styles.messageCount}>({messageStats.total})</span>
          {loading && <span className={styles.loadingDot}>●</span>}
          {profilesLoading && <span className={styles.profileLoadingDot}>👤</span>}
        </h2>
        
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
            className={`${styles.collapseArrow} ${open ? styles.open : ''}`}
            aria-hidden="true"
          >
            ▼
          </span>
        </div>
      </div>

      <div
        className={`${styles.collapseContent} ${open ? styles.open : ''}`}
        aria-hidden={!open}
      >
        {/* Suchleiste */}
        <div className={styles.searchContainer}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Nachrichten durchsuchen..."
            className={styles.searchInput}
          />
          <select 
            value={dateFilter} 
            onChange={(e) => setDateFilter(e.target.value as any)}
            className={styles.filterSelect}
          >
            <option value="all">Alle Nachrichten</option>
            <option value="today">Heute</option>
            <option value="week">Letzte Woche</option>
          </select>
        </div>

        {/* Stats */}
        <div className={styles.statsBar}>
          <span>📊 {messageStats.total} Nachrichten</span>
          <span>📅 {messageStats.today} heute</span>
          <span>👥 {messageStats.uniqueUsers} User</span>
          <span>🔗 {messageStats.profilesLoaded} Profile</span>
          {lastUpdate && (
            <span className={styles.lastUpdate}>
              🕒 {lastUpdate.toLocaleTimeString('de-DE')}
            </span>
          )}
        </div>

        {/* Messages */}
        {filteredMessages.length > 0 ? (
          <div className={styles.messagesContainer}>
            {filteredMessages.map(message => (
              <MessageItem key={message.id} message={message} />
            ))}

            {messages.length > maxMessages && (
              <div className={styles.moreMessagesHint}>
                ... und {messages.length - maxMessages} weitere Nachrichten
              </div>
            )}
          </div>
        ) : (
          <div className={styles.noMessages}>
            <div className={styles.noMessagesIcon}>💭</div>
            <div className={styles.noMessagesText}>
              {searchTerm || dateFilter !== 'all' 
                ? 'Keine Nachrichten gefunden' 
                : 'Noch keine Nachrichten'
              }
            </div>
            <div className={styles.noMessagesSubtext}>
              {searchTerm || dateFilter !== 'all'
                ? 'Versuche andere Suchbegriffe oder Filter'
                : 'Schreibe die erste Nachricht in diese Gruppe!'
              }
            </div>
          </div>
        )}

        {/* Load more button */}
        {hasMore && (
          <div className={styles.loadMoreContainer}>
            <button 
              onClick={() => fetchGroupData(true)}
              className={styles.loadMoreButton}
              disabled={loading}
            >
              {loading ? 'Lädt...' : 'Weitere Nachrichten laden'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}