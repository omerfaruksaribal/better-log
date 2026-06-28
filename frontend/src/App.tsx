import { useEffect, useState } from 'react';

interface Log {
  timestamp: string;
  level: string;
  service: string;
  event_type: string;
  message: string;
}

const LEVEL_COLORS: Record<string, string> = {
  info: '#4ade80',
  warning: '#facc15',
  error: '#f87171',
};

export default function App() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://localhost:3000/logs')
      .then((res) => res.json())
      .then((data) => {
        setLogs(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Backend'e bağlanılamadı");
        setLoading(false);
      });
  }, []);

  if (loading) return <p style={{ padding: 24 }}>Yükleniyor...</p>;
  if (error) return <p style={{ padding: 24, color: 'red' }}>{error}</p>;

  return (
    <div style={{ padding: 24, fontFamily: 'monospace' }}>
      <h2 style={{ marginBottom: 16 }}>
        Log Viewer — Phase 1 ({logs.length} satır)
      </h2>
      <table
        style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}
      >
        <thead>
          <tr
            style={{ background: '#1e1e1e', color: '#fff', textAlign: 'left' }}
          >
            <th style={th}>Timestamp</th>
            <th style={th}>Level</th>
            <th style={th}>Service</th>
            <th style={th}>Event Type</th>
            <th style={th}>Message</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, i) => (
            <tr
              key={i}
              style={{
                background: i % 2 === 0 ? '#111' : '#1a1a1a',
                color: '#ccc',
              }}
            >
              <td style={td}>{log.timestamp}</td>
              <td
                style={{
                  ...td,
                  color: LEVEL_COLORS[log.level] ?? '#fff',
                  fontWeight: 'bold',
                }}
              >
                {log.level}
              </td>
              <td style={td}>{log.service}</td>
              <td style={td}>{log.event_type}</td>
              <td style={td}>{log.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #333',
};
const td: React.CSSProperties = {
  padding: '6px 12px',
  borderBottom: '1px solid #222',
};
