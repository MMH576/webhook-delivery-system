import StatusBadge from './StatusBadge';
import EmptyState from './EmptyState';
import { formatRelativeTime } from '../utils/time';

const WebhooksTable = ({ webhooks, onRowClick }) => {
  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target URL</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {webhooks.length > 0 ? (
            webhooks.map((webhook) => (
              <tr key={webhook.id} onClick={() => onRowClick(webhook)} className="hover:bg-gray-50 transition-colors duration-200 cursor-pointer">
                <td className="px-6 py-4 text-sm font-mono text-gray-500">{webhook.id.slice(0, 8)}...</td>
                <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">{webhook.target_url}</td>
                <td className="px-6 py-4">
                  <StatusBadge status={webhook.status} />
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {formatRelativeTime(webhook.created_at)}
                </td>
              </tr>
            ))
          ) : (
            <EmptyState message="No webhooks found" />
          )}
        </tbody>
      </table>
    </div>
  );
};

export default WebhooksTable;
