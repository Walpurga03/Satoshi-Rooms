import Layout from './components/Layout';
import KeyManagement from './components/KeyManagement';

function App() {
  return (
    <Layout>
      <h1>Nostr Groups Client</h1>
      <KeyManagement />
    </Layout>
  );
}

export default App;
