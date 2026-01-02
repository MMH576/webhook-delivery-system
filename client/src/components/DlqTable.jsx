import EmptyState from './EmptyState';
import { formatRelativeTime } from '../utils/time';

const DlqTable = ({ dlq, retryWebhook, retryingIds, onRowClick }) => {
  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Webhook ID</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target URL</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Moved At</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {dlq.length > 0 ? (
            dlq.map((entry) => {
              const isRetrying = retryingIds.includes(entry.id);
              return (
              <tr key={entry.id} onClick={() => onRowClick({
                  id: entry.webhook_id,
                  status: entry.webhook_status,
                  target_url: entry.target_url,
                  payload: entry.payload,
                  updated_at: entry.moved_at,
              })} className="hover:bg-gray-50 transition-colors duration-200 cursor-pointer">
                <td className="px-6 py-4 text-sm font-mono text-gray-500">{entry.webhook_id.slice(0, 8)}...</td>
                <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">{entry.target_url}</td>
                <td className="px-6 py-4 text-sm text-red-600 max-w-xs truncate">{entry.reason}</td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {formatRelativeTime(entry.moved_at)}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      retryWebhook(entry.id);
                    }}
                    disabled={isRetrying}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {isRetrying ? 'Retrying...' : 'Retry'}
                  </button>
                </td>
              </tr>
              );
            })
          ) : (
            <EmptyState message="No failed webhooks in DLQ" />
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DlqTable;
