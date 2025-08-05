import { useEffect, useState, useCallback, useMemo } from 'react';
import { SimplePool } from 'nostr-tools';
import type { Filter } from 'nostr-tools';
import styles from './LetzteNachrichten.module.scss';

type Props = {
  relay: string;
  profileRelays: string[];
  reload?: number;
  maxMessages?: number; // Maximale Anzahl angezeigter Nachrichten
  showDebugInfo?: boolean; // Debug-Informationen anzeigen
  autoRefresh?: boolean; // Automatisches Neuladen alle X Sekunden
  refreshInterval?: number; // Refresh-Intervall in Sekunden
};

interface GroupMessage {
  id: string;
  content: string;
  created_at: number;
  pubkey: string;
  tags: string[][];
  kind: number;
  replies?: number; // Anzahl Antworten (falls implementiert)
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

  // Neue State-Variablen
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week'>('all');

  // Optimiertes Laden mit Pagination
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

  // Gefilterte Nachrichten
  const filteredMessages = useMemo(() => {
    return messages
      .filter(message => {
        // Textfilter
        const matchesSearch = searchTerm === '' || 
          message.content.toLowerCase().includes(searchTerm.toLowerCase());
        
        // Datumsfilter
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

  // === Profile laden (separater Hook) ===
  const loadProfiles = useCallback(async (pubkeys: string[], pool: SimplePool) => {
    if (pubkeys.length === 0) return {};

    setProfilesLoading(true);
    const profilesFilter: Filter = {
      kinds: [0],
      authors: pubkeys,
      limit: 100,
    };

    try {
      
      // Kombiniere alle verfügbaren Relays
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
  }, [relay, profileRelays]);

  // === Hauptfunktion zum Laden der Gruppendaten ===
  const fetchGroupData = useCallback(async (loadMore = false) => {
    if (!groupId) return;
    
    let isCancelled = false;
    const pool = new SimplePool();
    const relaysToUse = [relay];
    
    setLoading(true);
    setError(null);

    try {
      
      // Filter für Nachrichten, mit optionaler Pagination
      const groupMessagesFilter: Filter = {
        kinds: [9],
        '#h': [groupId],
        limit: 20,
        ...(loadMore && since ? { until: since } : {}) // Für ältere Nachrichten
      };
      
      const groupEvents = await pool.querySync(relaysToUse, groupMessagesFilter);

      if (isCancelled) return;

      // 2. Nachrichten-Objekte erzeugen
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

      // 3. Einzigartige Pubkeys extrahieren
      const uniqueKeys = Array.from(new Set(groupEvents.map(e => e.pubkey)));
      setUniquePubkeys(uniqueKeys);

      // 4. Profile laden (nur wenn neue User gefunden)
      const newUsers = uniqueKeys.filter(pubkey => !userProfiles[pubkey]);
      if (newUsers.length > 0) {
        const newProfiles = await loadProfiles(newUsers, pool);
        
        if (!isCancelled) {
          setUserProfiles(prev => ({ ...prev, ...newProfiles }));
        }
      }

      // Pagination-Status setzen
      if (groupEvents.length === 20) {
        setHasMore(true);
        // Setze since auf die älteste Nachricht für nächste Seite
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
  }, [relay, groupId, userProfiles, loadProfiles]);

  // === Effekt für initiales Laden und Reload ===
  useEffect(() => {
    fetchGroupData();
  }, [fetchGroupData, reload]);

  // === Auto-Refresh Effekt ===
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
    
    // Lange Nachrichten abschneiden
    const shortContent = message.content.length > 300 
      ? message.content.slice(0, 300) + "..." 
      : message.content;

    // Verbesserte MessageContent mit Markdown-Support
    // (Entfernt, da ungenutzt)

    return (
      <div key={message.id} className={styles.messageCard}>
        <div className={styles.messageHeader}>
          {profile?.picture && (
            <img 
              src={profile.picture} 
              alt="Avatar" 
              className={styles.userAvatar}
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

        {/* Neues Interaktions-Menü */}
        <div className={styles.messageActions}>
          <button className={styles.actionButton} title="Antworten">↩️</button>
          <button className={styles.actionButton} title="Teilen">🔗</button>
          <button className={styles.actionButton} title="Melden">⚠️</button>
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

  // === Loading State ===
  if (loading && messages.length === 0) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}>⏳</div>
        <div>Lade Gruppennachrichten...</div>
      </div>
    );
  }

  // === Error State ===
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

  // Funktion zum Laden weiterer Nachrichten
  const loadMoreMessages = () => {
    if (loading) return; // Verhindere mehrfaches Laden
    fetchGroupData(true); // true = loadMore
  };

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
            <div className={styles.noMessagesText}>Noch keine Nachrichten</div>
            <div className={styles.noMessagesSubtext}>
              Schreibe die erste Nachricht in diese Gruppe!
            </div>
          </div>
        )}

        {/* Load more button */}
        {hasMore && (
          <div className={styles.loadMoreContainer}>
            <button 
              onClick={loadMoreMessages} // Hier wird die Funktion verwendet
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