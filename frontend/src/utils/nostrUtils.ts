// Gruppenprofil per group_id und relay suchen (ohne naddr)
export async function fetchGroupProfileById({ groupId, pubkeyHex, kind, relays }: { groupId: string; pubkeyHex: string; kind: number; relays: string[] }) {
  const pool = new SimplePool();
  const events = await pool.querySync(relays, {
    kinds: [kind],
    authors: [pubkeyHex],
    '#d': [groupId],
    limit: 1,
  });
  let groupProfile: NostrProfile | null = null;
  if (events.length > 0) {
    try {
      groupProfile = JSON.parse(events[0].content);
    } catch {
      groupProfile = { raw: events[0].content };
    }
  }
  return { groupProfile, event: events[0] };
}
// Gruppenprofil (z.B. NIP-39/NIP-29) per naddr laden
export async function fetchGroupProfileByNaddr({ naddr, relays }: { naddr: string; relays: string[] }) {
  // naddr dekodieren (nostr:naddr...)
  const decoded = nip19.decode(naddr);
  if (decoded.type !== 'naddr') throw new Error('Ungültige naddr');
  const { data } = decoded as any;
  // data enthält: identifier, pubkey, kind, relays (optional)
  const { identifier, pubkey, kind } = data;
  const pool = new SimplePool();
  // Suche nach dem Gruppenprofil-Event (z.B. kind 34550 für NIP-39, kind 1420 für NIP-29)
  const events = await pool.querySync(relays, {
    kinds: [kind],
    authors: [pubkey],
    '#d': [identifier],
    limit: 1,
  });
  let groupProfile: NostrProfile | null = null;
  if (events.length > 0) {
    try {
      groupProfile = JSON.parse(events[0].content);
    } catch {
      groupProfile = { raw: events[0].content };
    }
  }
  return { groupProfile, event: events[0] };
}
import { SimplePool, nip19, type Event } from 'nostr-tools';

export type NostrProfile = {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  [key: string]: any;
};

export async function fetchProfileAndEvents({ npub, relays, limit = 10 }: { npub: string; relays: string[]; limit?: number }) {
  const pubkey = nip19.decode(npub).data as string;
  const pool = new SimplePool();
  // Fetch profile (kind 0)
  const profileEvents = await pool.querySync(relays, { kinds: [0], authors: [pubkey], limit: 1 });
  let profile: NostrProfile | null = null;
  if (profileEvents.length > 0) {
    try {
      profile = JSON.parse(profileEvents[0].content);
    } catch {
      profile = { raw: profileEvents[0].content };
    }
  }
  // Fetch events (kind 1)
  const events: Event[] = await pool.querySync(relays, { kinds: [1], authors: [pubkey], limit });
  return { profile, events };
}
