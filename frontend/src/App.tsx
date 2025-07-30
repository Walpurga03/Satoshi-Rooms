import Layout from './components/Layout';
import KeyManagement from './components/KeyManagement';
import RelayManagement from './components/RelayManagement';

function App() {
  return (
    <Layout>
      <h1>Nostr Groups Client</h1>
      <KeyManagement />
      <RelayManagement />
    </Layout>
  );
}

export default App;
