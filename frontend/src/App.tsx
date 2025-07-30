import Layout from './components/Layout';
import { useNostrWasm } from './hooks/useNostrWasm';

function App() {
  const { nostr, loading, error } = useNostrWasm();

  return (
    <Layout>
      <h1>Nostr Groups Client</h1>
      {loading && <p>nostr-wasm wird geladen…</p>}
      {error && <p style={{ color: 'red' }}>Fehler: {error}</p>}
      {nostr && (
        <>
          <p>nostr-wasm erfolgreich geladen!</p>
          {/* Hier kann die nostr-API verwendet werden */}
        </>
      )}
    </Layout>
  );
}

export default App;
