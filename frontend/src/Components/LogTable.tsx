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

const levelKey = (level: string) => {
  const l = level.toLowerCase();
  if (l === 'error' || l === 'warning' || l === 'info') return l;
  return 'info';
};

const LogTable = ({ logs }: LogTableProps) => {
  if (logs.length === 0) {
    return (
      <div className="lv-empty">
        No logs yet. Drag a log folder into the area above to get started.
      </div>
    );
  }

  return (
    <div className="lv-tablewrap">
      <table className="lv-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Level</th>
            <th>Service</th>
            <th>Event</th>
            <th>Message</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, index) => {
            const lvl = levelKey(log.level);
            // ! buranın direkt date, time olmamasının nedeni genel kullanım bu şekildeymiş. bu projede gereksiz ancak herhangi bir başka projede date time utc gibi 1den fazla boşluk olma duruunda patlamaması için ekstra bir güvenlik önlemiymiş.
            const [date, ...rest] = log.timestamp.split(' ');
            const time = rest.join(' ');
            return (
              <tr key={index}>
                <td className={`lv-td-stripe lv-stripe-${lvl}`}>
                  <span className="lv-ts-date">{date} </span>
                  <span className="lv-ts-time">{time}</span>
                </td>
                <td>
                  <span className={`lv-badge lv-badge-${lvl}`}>
                    {log.level}
                  </span>
                </td>
                <td className="lv-service">{log.service}</td>
                <td className="lv-event">{log.event_type}</td>
                <td className="lv-msg" title={log.message}>
                  {log.message}
                </td>
                <td className="lv-src" title={log.source_path}>
                  {log.source_path}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default LogTable;
