import { Section } from './components/Section';
import { UserProfile } from './components/UserProfile';
import { RelayStatus } from './components/RelayStatus';
import { GroupInfo } from './components/GroupInfo';
//import { AktiveGruppenmitglieder } from './components/AktiveGruppenmitglieder';
//import { LetzteNachrichten } from './components/LetzteNachrichten '; // Fix: match filename with space

import './styles/index.scss';


function App() {
  const npub = import.meta.env.VITE_USER_NPUB;
  const relays = (import.meta.env.VITE_NOSTR_RELAY || '').split(',').map((r: string) => r.trim()).filter(Boolean);
  // Gruppen-Parameter aus .env
  const groupRelay = import.meta.env.VITE_GROUP_RELAY;

  return (
    <div className="appContainer">
      <h1 className="headline">Satoshi Room</h1>
      <Section title="User Profil">
        <UserProfile npub={npub} relays={relays} />
      </Section>
      <Section title="Relay Status">
        <RelayStatus relays={relays} />
      </Section>
      <Section title="Group Info">
        <GroupInfo relay={groupRelay} />
      </Section>
    </div>
  );
}

export default App;
