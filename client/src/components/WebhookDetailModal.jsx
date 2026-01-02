import { useState, useEffect } from 'react';
import StatusBadge from './StatusBadge';
import { formatRelativeTime } from '../utils/time';

const WebhookDetailModal = ({ webhook, onClose }) => {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (webhook) {
      setLoading(true);
      fetch(`/api/webhooks/${webhook.id}/attempts`)
        .then(res => res.json())
        .then(data => {
          setAttempts(data.attempts);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to fetch attempts:', err);
          setLoading(false);
        });
    }
  }, [webhook]);

  if (!webhook) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Webhook Details</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-3xl leading-none">&times;</button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div><strong>ID:</strong> <span className="font-mono text-sm">{webhook.id}</span></div>
          <div><strong>Status:</strong> <StatusBadge status={webhook.status} /></div>
          <div className="col-span-2"><strong>Target URL:</strong> <a href={webhook.target_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{webhook.target_url}</a></div>
          {webhook.created_at && <div><strong>Created:</strong> {formatRelativeTime(webhook.created_at)}</div>}
          {webhook.updated_at && <div><strong>Last Updated:</strong> {formatRelativeTime(webhook.updated_at)}</div>}
        </div>

        <h3 className="text-lg font-bold mb-2">Payload</h3>
        <pre className="bg-gray-100 p-4 rounded-md text-sm mb-6 overflow-auto max-h-40">{JSON.stringify(webhook.payload, null, 2)}</pre>

        <h3 className="text-lg font-bold mb-2">Delivery Attempts ({attempts.length})</h3>
        <div className="overflow-auto max-h-60 border rounded-md">
          {loading ? (
            <div className="p-4 text-center">Loading attempts...</div>
          ) : attempts.length > 0 ? (
            attempts.map(attempt => (
              <div key={attempt.id} className="p-4 border-b last:border-b-0">
                <div className="flex justify-between items-center">
                  <span className="font-bold">Attempt #{attempt.attempt_number}</span>
                  <span className={`text-sm font-bold ${attempt.response_status >= 200 && attempt.response_status < 300 ? 'text-green-600' : 'text-red-600'}`}>
                    {attempt.response_status ? `HTTP ${attempt.response_status}` : 'No Response'}
                  </span>
                </div>
                <div className="text-sm text-gray-500">{attempt.duration_ms}ms</div>
                {attempt.error_message && <div className="text-sm text-red-500 mt-1">{attempt.error_message}</div>}
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-gray-500">No delivery attempts found.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WebhookDetailModal;
