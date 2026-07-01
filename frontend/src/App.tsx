import { useEffect, useRef, useState } from 'react';
import FileUploader from './Components/FileUploader';
import LogTableReactWindow from './Components/LogTableReactWindow';

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

// Her fetch'te backend'den kaç satır istenecek. Bu, ekranda hiç görünmeyen
// bir "chunk boyutu" — kullanıcı sadece kesintisiz kaydırır, bunu görmez.
const PAGE_SIZE = 3000;
// Listenin sonuna kaç satır kala bir sonraki chunk istensin (boşluk hissi olmasın diye erken tetiklenir)
const FETCH_THRESHOLD = 300;

function App() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false); // aynı anda ikinci fetch tetiklenmesin

  const loadPage = async (targetPage: number, replace: boolean) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const response = await fetch(
        `http://localhost:3000/logs?page=${targetPage}&limit=${PAGE_SIZE}`,
      );
      const data = await response.json();

      if (!Array.isArray(data)) {
        console.error('Response is not an array:', data);
        if (replace) setLogs([]);
        return;
      }

      setLogs((prev) => (replace ? data : [...prev, ...data]));
      setHasMore(data.length === PAGE_SIZE); // tam PAGE_SIZE gelmediyse veri bitmiştir
      setPage(targetPage);
    } catch (error) {
      console.error('Fetch failed:', error);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  };

  // react-window'dan gelen: kullanıcı listenin sonuna yaklaştı
  const handleNearEnd = () => {
    if (!hasMore || fetchingRef.current) return;
    loadPage(page + 1, false);
  };

  const onClickResetDatabase = async () => {
    try {
      await fetch('http://localhost:3000/reset', { method: 'POST' });
      setLogs([]);
      setPage(1);
      setHasMore(true);
    } catch (error) {
      console.error('Reset failed:', error);
    }
  };

  useEffect(() => {
    loadPage(1, true);
  }, []);

  return (
    <div className="lv-shell">
      <header className="lv-header">
        <div className="lv-brand">
          <h1>Log Viewer</h1>
          <span>console inspector</span>
        </div>
        <div className="lv-spacer" />
        <button className="lv-btn lv-btn-danger" onClick={onClickResetDatabase}>
          Clear logs
        </button>
      </header>

      <FileUploader
        onUploadComplete={() => {
          setHasMore(true);
          loadPage(1, true);
        }}
      />

      <div className="lv-toolbar">
        <span className="lv-page">
          {logs.length.toLocaleString()} satır yüklendi
        </span>
        {loading && <span className="lv-loading">loading…</span>}
      </div>

      <LogTableReactWindow logs={logs} onNearEnd={handleNearEnd} />
    </div>
  );
}

export default App;
