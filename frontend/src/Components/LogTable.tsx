interface LogItem {
  timestamp: string;
  level: string;
  service: string;
  event_type: string;
  message: string;
  source_path: string;
  console: number | null;
  is_service_log: number;
}

interface LogTableProps {
  logs: LogItem[];
}

const LogTable = ({ logs }: LogTableProps) => {
  if (logs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
        There are not logs, plase upload logs from above.
      </div>
    );
  }

  const getBackgroundColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return '#fef2f2';
      case 'warning':
        return '#fefcbf';
      case 'info':
        return '#eff6ff';
      default:
        return 'transparent';
    }
  };

  return (
    <div style={{ marginTop: '20px', overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          textAlign: 'left',
          fontFamily: 'monospace',
          fontSize: '13px',
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: '#f4f4f5',
              borderBottom: '2px solid #e4e4e7',
            }}
          >
            <th style={{ padding: '10px' }}>Timestamp</th>
            <th style={{ padding: '10px' }}>Level</th>
            <th style={{ padding: '10px' }}>Service</th>
            <th style={{ padding: '10px' }}>Event Type</th>
            <th style={{ padding: '10px' }}>Message</th>
            <th style={{ padding: '10px' }}>Source File</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, index) => (
            <tr
              key={index}
              style={{
                borderBottom: '1px solid #e4e4e7',
                backgroundColor: getBackgroundColor(log.level),
              }}
            >
              <td style={{ padding: '10px', color: '#2563eb' }}>
                {log.timestamp}
              </td>
              <td style={{ padding: '10px', fontWeight: 'bold' }}>
                {log.level.toUpperCase()}
              </td>
              <td style={{ padding: '10px', color: '#0d9488' }}>
                {log.service}
              </td>
              <td style={{ padding: '10px', color: '#4b5563' }}>
                {log.event_type}
              </td>
              <td style={{ padding: '10px' }}>{log.message}</td>
              <td
                style={{ padding: '10px', color: '#71717a', fontSize: '11px' }}
              >
                {log.source_path}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default LogTable;
