import { useState } from 'react';
import { nip19, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import styles from './NsecLogin.module.scss';

type Props = {
  onLogin: (privkey: string, npub: string) => void;
};

export function NsecLogin({ onLogin }: Props) {
  const [nsec, setNsec] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    try {
      console.log('Eingegebener nsec:', nsec);
      const { type, data } = nip19.decode(nsec.trim());
      console.log('Decoded:', { type, data });
      if (type !== 'nsec') throw new Error('Kein gültiger nsec!');
      const privkey = bytesToHex(data);
      const pubkey = getPublicKey(data); // hex
      const npub = nip19.npubEncode(pubkey); // npub-Format
      console.log('Privkey (hex):', privkey);
      console.log('Pubkey (hex):', pubkey);
      console.log('Abgeleitete npub:', npub);
      onLogin(privkey, npub); // <-- npub-Format!
      setError('');
    } catch (e: any) {
      setError('Ungültiger nsec!');
      console.error('Fehler beim Login:', e);
    }
  };

  return (
    <div className={styles.nsecLoginRoot}>
      <div className={styles.nsecInputRow}>
        <input
          className={styles.nsecInput}
          type="password"
          value={nsec}
          onChange={e => setNsec(e.target.value)}
          placeholder="nsec eingeben"
        />
        <button className={styles.nsecButton} onClick={handleLogin}>Anmelden</button>
      </div>
      {error && <div className={styles.nsecError}>{error}</div>}
    </div>
  );
}