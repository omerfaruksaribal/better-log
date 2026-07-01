import { List, type RowComponentProps } from 'react-window';

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
  onNearEnd: () => void;
}

const levelKey = (level: string) => {
  const l = level.toLowerCase();
  if (l === 'error' || l === 'warning' || l === 'info') return l;
  return 'info';
};

const FETCH_THRESHOLD = 300;

function LogRow({
  index,
  style,
  logs,
}: RowComponentProps<{
  logs: LogItem[];
}>) {
  const log = logs[index];
  const lvl = levelKey(log.level);
  const [date, ...rest] = log.timestamp.split(' ');
  const time = rest.join(' ');

  return (
    // style: react-window'un satır başına hesapladığı dinamik konum (top/height).
    // Bu tek satır zorunlu istisna — her virtualization kütüphanesinde aynı gereklilik var,
    // çünkü değer satırdan satıra değişiyor, CSS class'a (statik kural) taşınamaz.
    <div className="lv-vrow" style={style}>
      <div
        className={`lv-vcell lv-col-timestamp lv-td-stripe lv-stripe-${lvl}`}
      >
        <span className="lv-ts-date">{date} </span>
        <span className="lv-ts-time">{time}</span>
      </div>
      <div className="lv-vcell lv-col-level">
        <span className={`lv-badge lv-badge-${lvl}`}>{log.level}</span>
      </div>
      <div className="lv-vcell lv-col-service lv-service" title={log.service}>
        {log.service}
      </div>
      <div className="lv-vcell lv-col-event lv-event" title={log.event_type}>
        {log.event_type}
      </div>
      <div className="lv-vcell lv-col-message lv-msg" title={log.message}>
        {log.message}
      </div>
      <div className="lv-vcell lv-col-source lv-src" title={log.source_path}>
        {log.source_path}
      </div>
    </div>
  );
}

const LogTableReactWindow = ({ logs, onNearEnd }: LogTableProps) => {
  if (logs.length === 0) {
    return (
      <div className="lv-empty">
        No logs yet. Drag a log folder into the area above to get started.
      </div>
    );
  }

  return (
    <div className="lv-tablewrap">
      <div className="lv-vheader">
        <div className="lv-vheader-cell lv-col-timestamp">Timestamp</div>
        <div className="lv-vheader-cell lv-col-level">Level</div>
        <div className="lv-vheader-cell lv-col-service">Service</div>
        <div className="lv-vheader-cell lv-col-event">Event</div>
        <div className="lv-vheader-cell lv-col-message">Message</div>
        <div className="lv-vheader-cell lv-col-source">Source</div>
      </div>

      <List
        rowComponent={LogRow}
        rowCount={logs.length}
        rowHeight={44}
        rowProps={{ logs }}
        className="lv-vlist"
        onRowsRendered={(visibleRows) => {
          if (visibleRows.stopIndex >= logs.length - FETCH_THRESHOLD) {
            onNearEnd();
          }
        }}
      />
    </div>
  );
};

export default LogTableReactWindow;
