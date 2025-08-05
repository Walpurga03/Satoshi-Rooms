import { useState, useCallback } from 'react';
import { Section } from './components/Section';
import { UserProfile } from './components/UserProfile';
import { RelayStatus } from './components/RelayStatus';
import { GroupInfo } from './components/GroupInfo';
import { AktiveGruppenmitglieder } from './components/AktiveGruppenmitglieder';
import { LetzteNachrichten } from './components/LetzteNachrichten';
import { NsecLogin } from './components/NsecLogin';
import { MessageComposer } from './components/MessageComposer';
import styles from './App.module.scss';


function App() {
  // State für Login
  const [privkey, setPrivkey] = useState<string | null>(
    localStorage.getItem('nostr_privkey') || null
  );
  const [npub, setNpub] = useState<string | null>(
    localStorage.getItem('nostr_npub') || null
  );

  // Vereinfachter Logout-Handler
  const handleLogout = useCallback(() => {
    console.log('🚪 Benutzer wird abgemeldet...');
    
    // LocalStorage leeren
    localStorage.clear(); // Alles löschen für sauberen Zustand
    
    // Seite neu laden
    window.location.reload();
  }, []);

  const relays = (import.meta.env.VITE_NOSTR_RELAY || '').split(',').map((r: string) => r.trim()).filter(Boolean);
  const groupRelay = import.meta.env.VITE_GROUP_RELAY;

  // WICHTIG: sectionConfig nach innen verschieben, damit handleLogout verfügbar ist
  const sectionConfig = [
    {
      title: 'User Profil',
      component: UserProfile,
      props: (npub: string, relays: string[], _groupRelay: string, _privkey: string) => ({ 
        npub, 
        relays,
        onLogout: handleLogout, // Dies sollte jetzt funktionieren
        showLogout: true 
      }),
    },
    {
      title: 'Relay Status',
      component: RelayStatus,
      props: (_npub: string, relays: string[], _groupRelay: string) => ({ relays }),
    },
    {
      title: 'Group Info',
      component: GroupInfo,
      props: (_npub: string, _relays: string[], groupRelay: string) => ({ relay: groupRelay }),
    },
    {
      title: 'Aktive Gruppenmitglieder',
      component: AktiveGruppenmitglieder,
      props: (_npub: string, _relays: string[], groupRelay: string) => ({ relay: groupRelay }),
    },
    {
      title: 'Letzte Nachrichten',
      component: LetzteNachrichten,
      props: (_npub: string, relays: string[], groupRelay: string) => ({
        relay: groupRelay,
        profileRelays: relays,
        reload: 0,
      }),
    },
    {
      title: 'Nachricht schreiben',
      component: MessageComposer,
      props: (npub: string, relays: string[], _unused: string, privkey: string) => ({
        privkey,
        npub,
        relays,
        groupId: import.meta.env.VITE_GROUP_ID,
        onSend: () => {},
      }),
    },
  ];

  // Wenn nicht eingeloggt, Login anzeigen
  if (!privkey || !npub) {
    return (
      <div className={styles.appContainer}>
        <h1 className={styles.headline}>Satoshi Room</h1>
        <Section title="Login">
          <NsecLogin
            onLogin={(priv, npub) => {
              setPrivkey(priv);
              setNpub(npub);
            }}
          />
        </Section>
      </div>
    );
  }

  // Nach Login: App wie gehabt, aber mit npub aus Login
  return (
    <div className={styles.appContainer}>
      <h1 className={styles.headline}>Satoshi Room</h1>
      {sectionConfig.map(({ title, component: Component, props }) => (
        <Section title={title} key={title}>
          <Component {...props(npub, relays, groupRelay, privkey) as any} />
        </Section>
      ))}
    </div>
  );
}

export default App;
