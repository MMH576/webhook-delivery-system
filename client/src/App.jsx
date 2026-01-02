import { useState, useEffect } from 'react';
import Header from './components/Header';
import StatsCard from './components/StatsCard';
import Tabs from './components/Tabs';
import WebhooksTable from './components/WebhooksTable';
import DlqTable from './components/DlqTable';
import LoadingSpinner from './components/LoadingSpinner';
import Toast from './components/Toast';
import { useToast } from './hooks/useToast';
import WebhookDetailModal from './components/WebhookDetailModal';

function App() {
  const [stats, setStats] = useState(null);
  const [webhooks, setWebhooks] = useState([]);
  const [dlq, setDlq] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [retryingIds, setRetryingIds] = useState([]);
  const { toast, showToast, dismissToast } = useToast();
  const [selectedWebhook, setSelectedWebhook] = useState(null);

  const handleOpenModal = (webhook) => {
    setSelectedWebhook(webhook);
  };

  const handleCloseModal = () => {
    setSelectedWebhook(null);
  };

  const fetchData = async () => {
    try {
      const [statsRes, webhooksRes, dlqRes] = await Promise.all([
        fetch('/api/webhooks/stats/overview'),
        fetch('/api/webhooks?limit=20'),
        fetch('/api/webhooks/dlq/list'),
      ]);
      setStats(await statsRes.json());
      setWebhooks((await webhooksRes.json()).webhooks);
      setDlq((await dlqRes.json()).dead_letters);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const retryWebhook = async (dlqId) => {
    setRetryingIds((prev) => [...prev, dlqId]);
    try {
      const res = await fetch(`/api/webhooks/dlq/${dlqId}/retry`, { method: 'POST' });
      if (!res.ok) {
        throw new Error('Failed to retry webhook');
      }
      await fetchData();
      showToast('Webhook re-queued successfully!', 'success');
    } catch (err) {
      console.error('Failed to retry:', err);
      showToast(err.message || 'Failed to re-queue webhook', 'error');
    } finally {
      setRetryingIds((prev) => prev.filter((id) => id !== dlqId));
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toast message={toast?.message} type={toast?.type} onDismiss={dismissToast} />
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8 pt-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <StatsCard title="Total Webhooks" value={stats?.total_webhooks || 0} />
          <StatsCard
            title="Delivered"
            value={stats?.by_status?.delivered || 0}
            color="text-green-600"
          />
          <StatsCard
            title="Failed"
            value={stats?.by_status?.failed || 0}
            color="text-red-600"
          />
          <StatsCard
            title="In DLQ"
            value={stats?.dlq_count || 0}
            color="text-orange-600"
          />
          <StatsCard
            title="Avg Response"
            value={`${stats?.delivery_attempts?.avg_response_time_ms || 0}ms`}
            color="text-blue-600"
          />
        </div>

        <Tabs activeTab={activeTab} setActiveTab={setActiveTab} dlqCount={dlq.length} />

        {activeTab === 'overview' && <WebhooksTable webhooks={webhooks} onRowClick={handleOpenModal} />}
        {activeTab === 'dlq' && <DlqTable dlq={dlq} retryWebhook={retryWebhook} retryingIds={retryingIds} onRowClick={handleOpenModal} />}
      </main>
      <WebhookDetailModal webhook={selectedWebhook} onClose={handleCloseModal} />
    </div>
  );
}

export default App;