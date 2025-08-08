import { useEffect, useState, useCallback, useMemo, memo } from 'react';
import { SimplePool } from 'nostr-tools';
import type { Filter } from 'nostr-tools';
import styles from './LetzteNachrichten.module.scss';

// === Types bleiben gleich ===
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

// === SKELETON KOMPONENTE AUSSERHALB ===
const SkeletonMessage = memo(() => (
  <div className={styles.skeletonCard}>
    <div className={styles.skeletonHeader}>
      <div className={styles.skeletonAvatar} />
      <div className={styles.skeletonUserInfo}>
        <div className={styles.skeletonName} />
        <div className={styles.skeletonTime} />
      </div>
    </div>
    <div className={styles.skeletonContent}>
      <div className={styles.skeletonLine} />
      <div className={styles.skeletonLine} />
      <div className={styles.skeletonLineShort} />
    </div>
  </div>
));

SkeletonMessage.displayName = 'SkeletonMessage';

// === MAIN KOMPONENTE ===
export function LetzteNachrichten({ 
  relay, 
  profileRelays, 
  reload,
  maxMessages = 20,
  showDebugInfo = false,
  autoRefresh = false,
  refreshInterval = 30
}: Props) {
  // === State (alle auf oberster Ebene) ===
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
  // NEU: Separate Anzeige-Limit
  const [displayLimit, setDisplayLimit] = useState(maxMessages);

  // === Memoized Values ===
  // ZUERST: filteredMessages (ohne messageStats dependency)
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
      .slice(0, displayLimit); // Verwende displayLimit statt maxMessages
  }, [messages, searchTerm, dateFilter, displayLimit]); // displayLimit als Dependency

  // DANN: messageStats (mit filteredMessages dependency)
  const messageStats = useMemo(() => {
    return {
      total: messages.length,
      displayed: Math.min(displayLimit, filteredMessages.length),
      today: messages.filter(m => 
        new Date(m.created_at * 1000).toDateString() === new Date().toDateString()
      ).length,
      uniqueUsers: uniquePubkeys.length,
      profilesLoaded: Object.keys(userProfiles).length
    };
  }, [messages, uniquePubkeys, userProfiles, displayLimit, filteredMessages.length]);

  // === Callbacks ===
  const loadProfiles = useCallback(async (pubkeys: string[], pool: SimplePool) => {
    if (pubkeys.length === 0) return {};

    setProfilesLoading(true);
    const profilesFilter: Filter = {
      kinds: [0],
      authors: pubkeys,
      limit: 100,
    };

    try {
      const allRelays = [...new Set([relay, ...profileRelays, ...PROFILE_RELAYS])];
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

      return profiles;
    } catch (e) {
      console.error('Fehler beim Laden der Profile:', e);
      return {};
    } finally {
      setProfilesLoading(false);
    }
  }, [relay]); // Nur relay als dependency

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
      
      console.log('📡 Fetching messages...', { loadMore, since, limit: 20 });
      
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

      console.log('📥 Received messages:', messageData.length);

      if (loadMore) {
        // Beim Nachladen: Neue Nachrichten anhängen
        setMessages(prevMessages => {
          const newMessages = [...prevMessages, ...messageData];
          // Duplikate entfernen
          const uniqueMessages = newMessages.filter((msg, index, arr) => 
            arr.findIndex(m => m.id === msg.id) === index
          );
          const sortedMessages = uniqueMessages.sort((a, b) => b.created_at - a.created_at);
          
          console.log('📊 Total messages after loading more:', sortedMessages.length);
          return sortedMessages;
        });
        
        // NICHT das Display-Limit zurücksetzen beim Nachladen!
      } else {
        // Erstes Laden: Nachrichten ersetzen
        console.log('🔄 Initial load, replacing messages');
        setMessages(messageData);
        setDisplayLimit(maxMessages); // Nur beim ersten Laden zurücksetzen
      }
      
      setLastUpdate(new Date());

      const uniqueKeys = Array.from(new Set(groupEvents.map(e => e.pubkey)));
      setUniquePubkeys(uniqueKeys);

      // Profile laden (vereinfacht)
      const newUsers = uniqueKeys.filter(pubkey => !userProfiles[pubkey]);
      if (newUsers.length > 0) {
        // Profile laden ohne await in der Hauptfunktion
        loadProfiles(newUsers, pool).then(newProfiles => {
          if (!isCancelled) {
            setUserProfiles(prev => ({ ...prev, ...newProfiles }));
          }
        });
      }

      // Verbesserte hasMore Logik
      if (groupEvents.length === 20) {
        setHasMore(true);
        const oldestEvent = [...groupEvents].sort((a, b) => a.created_at - b.created_at)[0];
        if (oldestEvent) {
          setSince(oldestEvent.created_at);
        }
        console.log('✅ hasMore = true, since set to:', oldestEvent?.created_at);
      } else {
        setHasMore(false);
        console.log('❌ hasMore = false (received less than 20 messages)');
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
  }, [relay, groupId, since, maxMessages, userProfiles, loadProfiles]); // Minimal stabile dependencies

  const loadMoreMessages = useCallback(() => {
    if (loading) return;
    
    console.log('🔄 Load More clicked:', {
      currentDisplayLimit: displayLimit,
      totalMessages: messages.length,
      hasMore
    });
    
    // Prüfe ob wir mehr lokale Nachrichten anzeigen können
    if (displayLimit < messages.length) {
      // Zeige mehr von den bereits geladenen Nachrichten
      const newLimit = Math.min(displayLimit + 20, messages.length);
      console.log('📈 Erhöhe Display-Limit von', displayLimit, 'auf', newLimit);
      setDisplayLimit(newLimit);
      return;
    }
    
    // Wenn alle lokalen Nachrichten angezeigt werden und mehr verfügbar sind
    if (hasMore) {
      console.log('📡 Lade weitere Nachrichten vom Server...');
      fetchGroupData(true).then(() => {
        // Erhöhe Display-Limit nach dem Laden
        setDisplayLimit(prev => prev + 20);
      });
    }
  }, [loading, hasMore, displayLimit, messages.length, fetchGroupData]); // fetchGroupData zurück als dependency

  // === Effects ===
  useEffect(() => {
    // Initiales Laden nur einmal
    fetchGroupData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]); // Nur reload dependency

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchGroupData();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshInterval]); // Entferne fetchGroupData dependency

  // Reset displayLimit nur bei Search/Filter Änderungen
  useEffect(() => {
    console.log('🔍 Search/Filter changed, resetting displayLimit to', maxMessages);
    setDisplayLimit(maxMessages);
  }, [searchTerm, dateFilter, maxMessages]);

  // === MessageItem Komponente ===
  const MessageItem = memo(({ message, profile, showDebugInfo }: { 
    message: GroupMessage; 
    profile?: UserProfile;
    showDebugInfo?: boolean;
  }) => {
    const messageDate = new Date(message.created_at * 1000);
    const isToday = messageDate.toDateString() === new Date().toDateString();
    const [isExpanded, setIsExpanded] = useState(false);
    
    const shortContent = message.content.length > 300 
      ? message.content.slice(0, 300) + "..." 
      : message.content;

    const renderContent = useCallback(() => {
      let content = isExpanded || message.content.length <= 300 
        ? message.content 
        : shortContent;

      // Basic link detection
      content = content.replace(
        /(https?:\/\/[^\s]+)/g, 
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="messageLink">$1</a>'
      );

      // Basic mention detection
      content = content.replace(
        /@([a-zA-Z0-9_]+)/g,
        '<span class="mentionTag">@$1</span>'
      );

      return content;
    }, [message.content, isExpanded, shortContent]);

    return (
      <div className={styles.messageCard}>
        <div className={styles.messageHeader}>
          {profile?.picture ? (
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
          ) : (
            <div className={styles.avatarPlaceholder}>
              {profile?.display_name?.[0] || profile?.name?.[0] || '👤'}
            </div>
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
          dangerouslySetInnerHTML={{ __html: renderContent() }}
        />

        {!isExpanded && message.content.length > 300 && (
          <span className={styles.readMore} onClick={() => setIsExpanded(true)}>
            mehr lesen...
          </span>
        )}

        {showDebugInfo && (
          <div className={styles.debugInfo}>
            <small>
              ID: {message.id.slice(0, 8)}... | 
              Kind: {message.kind} | 
              Tags: {message.tags.length} |
              Size: {new Blob([message.content]).size} bytes
            </small>
          </div>
        )}
      </div>
    );
  });

  MessageItem.displayName = 'MessageItem';

  // === Event Handlers ===
  const handleRefresh = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    fetchGroupData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Keine dependencies

  // === Early Returns für Loading/Error States ===
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

  // === Debug Info ===
  console.log('🔍 LetzteNachrichten Render:', {
    totalMessages: messages.length,
    displayLimit,
    filteredLength: filteredMessages.length,
    hasMore,
    loading
  });

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
            onClick={handleRefresh}
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
          <span>📊 {messageStats.displayed}/{messageStats.total} Nachrichten</span>
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
              <MessageItem 
                key={message.id} 
                message={message}
                profile={userProfiles[message.pubkey]}
                showDebugInfo={showDebugInfo}
              />
            ))}
            
            {/* Loading Skeletons nur beim ersten Laden */}
            {loading && messages.length === 0 && (
              <>
                <SkeletonMessage />
                <SkeletonMessage />
                <SkeletonMessage />
              </>
            )}
          </div>
        ) : loading ? (
          <div className={styles.messagesContainer}>
            <SkeletonMessage />
            <SkeletonMessage />
            <SkeletonMessage />
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

        {/* Enhanced Load More Button */}
        {(displayLimit < messages.length || hasMore) && (
          <div className={styles.loadMoreContainer}>
            <button 
              onClick={loadMoreMessages}
              className={styles.loadMoreButton}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className={styles.loadingSpinner}>⏳</span>
                  Lade weitere Nachrichten...
                </>
              ) : (
                <>
                  📥 Weitere Nachrichten laden
                  {displayLimit < messages.length && (
                    <small> ({messages.length - displayLimit} verfügbar)</small>
                  )}
                </>
              )}
            </button>
            <div className={styles.loadMoreInfo}>
              {messageStats.displayed} von {messageStats.total} Nachrichten angezeigt
              {hasMore && ' (weitere auf Server verfügbar)'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}