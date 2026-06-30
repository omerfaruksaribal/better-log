import { useEffect, useState } from 'react';
import FileUploader from './Components/FileUploader';
import LogTable from './Components/LogTable';

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

      // ! protection for the bigint trouble. there are 2 step to fix, first one is at the backend the second is here:
      // if the value is not a array (i.e. error object) create an empty array for the state.
      if (Array.isArray(data)) {
        setLogs(data);
      } else {
        console.error('the value is not form of array, the data is:', data);
        setLogs([]);
      }
      setPage(targetPage);
    } catch (error) {
      console.error('an error occured: ', error);
    } finally {
      setLoading(false);
    }
  };

  const onClickResetDatabase = async () => {
    try {
      await fetch('http://localhost:3000/reset', {
        method: 'POST',
      });
      setLogs([]);
      setPage(1);
    } catch (error) {
      console.error('database could not resetted, error: ', error);
    }
  };

  // after the f5 if there are any logs, fetch it.
  useEffect(() => {
    fetchLogs(1);
  }, []);

  return (
    <div
      style={{
        padding: '30px',
        fontFamily: 'sans-serif',
        maxWidth: '1200px',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'between',
          alignItems: 'center',
          marginBottom: '20px',
        }}
      >
        <h2>LOGS</h2>
        <button
          onClick={onClickResetDatabase}
          style={{
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            padding: '10px 15px',
            borderRadius: '5px',
            cursor: 'pointer',
            marginLeft: 'auto',
          }}
        >
          Clear database
        </button>
      </div>

      {/* file uploader, after the upload; fetch logs with first page */}
      <FileUploader onUploadComplete={() => fetchLogs(1)} />

      {/* Page controls */}
      <div
        style={{
          marginTop: '20px',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
        }}
      >
        <button
          disabled={page === 1 || loading}
          onClick={() => fetchLogs(page - 1)}
        >
          Previous PAGE
        </button>
        <span>Page: {page}</span>
        <button
          disabled={logs.length < 100 || loading}
          onClick={() => fetchLogs(page + 1)}
        >
          Next Page
        </button>
        {loading && <span style={{ color: '#666' }}>Loading...</span>}
      </div>

      {/* TODO: THAT TABLE WILL CHANGE WITH REACT-WINDOW. THIS IS ONLY FOR TESTCASE. */}
      <LogTable logs={logs} />
    </div>
  );
}

export default App;
