import { useEffect, useState } from 'react';
import FileUploader from './Components/FileUploader';
import LogTable from './Components/LogTable';

import './styles/logviewer.css';

interface LogItem {
  timestamp: string;
  timestamp_iso: string;
  level: string;
  service: string;
  event_type: string;
  message: string;
  source_path: string;
  console: number | null;
  is_service_log: number;
}

function App() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async (targetPage: number) => {
    setLoading(true);
    try {
      const response = await fetch(
        `http://localhost:3000/logs?page=${targetPage}&limit=100`,
      );
      const data = await response.json();
      if (Array.isArray(data)) {
        setLogs(data);
      } else {
        console.error('Response is not an array:', data);
        setLogs([]);
      }
      setPage(targetPage);
    } catch (error) {
      console.error('Fetch failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const onClickResetDatabase = async () => {
    try {
      await fetch('http://localhost:3000/reset', { method: 'POST' });
      setLogs([]);
      setPage(1);
    } catch (error) {
      console.error('Reset failed:', error);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, []);

  return (
    <>
      <div className="lv-shell">
        <header className="lv-header">
          <div className="lv-brand">
            <h1>Log Viewer</h1>
            <span>console inspector</span>
          </div>
          <div className="lv-spacer" />
          <button
            className="lv-btn lv-btn-danger"
            onClick={onClickResetDatabase}
          >
            Clear logs
          </button>
        </header>

        <FileUploader onUploadComplete={() => fetchLogs(1)} />

        <div className="lv-toolbar">
          <button
            className="lv-btn"
            disabled={page === 1 || loading}
            onClick={() => fetchLogs(page - 1)}
          >
            Previous
          </button>
          <span className="lv-page">Page {page}</span>
          <button
            className="lv-btn"
            disabled={logs.length < 100 || loading}
            onClick={() => fetchLogs(page + 1)}
          >
            Next
          </button>
          {loading && <span className="lv-loading">loading…</span>}
        </div>

        <LogTable logs={logs} />
      </div>
    </>
  );
}

export default App;
