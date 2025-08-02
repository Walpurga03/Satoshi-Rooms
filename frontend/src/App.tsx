import { Section } from './components/Section';
import { UserProfile } from './components/UserProfile';
import { RelayStatus } from './components/RelayStatus';
import { GroupInfo } from './components/GroupInfo';
import { AktiveGruppenmitglieder } from './components/AktiveGruppenmitglieder';
import { LetzteNachrichten } from './components/LetzteNachrichten';
import styles from './App.module.scss';


const sectionConfig = [
  {
    title: 'User Profil',
    component: UserProfile,
    props: (npub: string, relays: string[]) => ({ npub, relays }),
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
    props: (_npub: string, relays: string[], groupRelay: string) => ({ relay: groupRelay, profileRelays: relays }),
  },
];

function App() {
  const npub = import.meta.env.VITE_USER_NPUB;
  const relays = (import.meta.env.VITE_NOSTR_RELAY || '').split(',').map((r: string) => r.trim()).filter(Boolean);
  const groupRelay = import.meta.env.VITE_GROUP_RELAY;

  return (
    <div className={styles.appContainer}>
      <h1 className={styles.headline}>Satoshi Room</h1>
      {sectionConfig.map(({ title, component: Component, props }) => (
        <Section title={title} key={title}>
          <Component {...props(npub, relays , groupRelay) as any} />
        </Section>
      ))}
    </div>
  );
}

export default App;
