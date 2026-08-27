import { useState, useEffect } from 'react';

function App() {
  const [healthStatus, setHealthStatus] = useState('Checking...');

  useEffect(() => {
    // Attempt to hit the backend health check
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    fetch(`${baseUrl}/api/health`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setHealthStatus(`Connected: ${data.message}`);
      })
      .catch((err) => {
        setHealthStatus(`Could not connect to backend: ${err.message}`);
      });
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>NoHallucinate - Phase 1 Loaded</h1>
      <p>This is the minimal unstyled placeholder proving the React application boots successfully.</p>
      <div style={{ padding: '1rem', background: '#f5f5f5', borderRadius: '4px', marginTop: '1rem' }}>
        <strong>Backend Connection Check:</strong>
        <p>{healthStatus}</p>
      </div>
    </div>
  );
}

export default App;
