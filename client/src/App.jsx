import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import StatsCard from './components/StatsCard';
import Tabs from './components/Tabs';
import WebhooksTable from './components/WebhooksTable';
import DlqTable from './components/DlqTable';
import LoadingSpinner from './components/LoadingSpinner';
import Toast from './components/Toast';
import { useToast } from './hooks/useToast';
import WebhookDetailModal from './components/WebhookDetailModal';
import DemoWizard from './components/DemoWizard';
import { useDemoMode } from './hooks/useDemoMode';

function App() {
  const [stats, setStats] = useState(null);
  const [webhooks, setWebhooks] = useState([]);
  const [dlq, setDlq] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [retryingIds, setRetryingIds] = useState([]);
  const { toast, showToast, dismissToast } = useToast();
  const [selectedWebhook, setSelectedWebhook] = useState(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [createdDemoWebhooks, setCreatedDemoWebhooks] = useState([]);
  const [wizardLoading, setWizardLoading] = useState(false);

  const handleOpenModal = (webhook) => {
    setSelectedWebhook(webhook);
  };

  const handleCloseModal = () => {
    setSelectedWebhook(null);
  };

  const fetchData = useCallback(async () => {
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
  }, []);

  const {
    isDemoMode,
    demoStep,
    demoWebhookIds,
    startDemoMode,
    exitDemoMode,
    nextStep,
    addDemoWebhookIds,
    clearDemoWebhookIds,
  } = useDemoMode(fetchData);

  useEffect(() => {
    fetchData();
    // Only use slow polling when not in demo mode (demo mode has its own fast polling)
    if (!isDemoMode) {
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchData, isDemoMode]);

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

  const runDemo = async () => {
    setDemoLoading(true);
    try {
      const res = await fetch('/api/webhooks/demo/run', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create demo data');
      await fetchData();
      showToast('Demo webhooks created! Click on any row to see details.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to run demo', 'error');
    } finally {
      setDemoLoading(false);
    }
  };

  const clearDemo = async () => {
    setDemoLoading(true);
    try {
      const res = await fetch('/api/webhooks/demo/clear', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to clear demo data');
      await fetchData();
      showToast('All data cleared!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to clear data', 'error');
    } finally {
      setDemoLoading(false);
    }
  };

  // Wizard action handlers
  const handleStartGuidedDemo = async () => {
    // Clear existing data first
    setDemoLoading(true);
    try {
      await fetch('/api/webhooks/demo/clear', { method: 'DELETE' });
      await fetchData();
      setCreatedDemoWebhooks([]);
      clearDemoWebhookIds();
      startDemoMode();
    } catch (err) {
      showToast('Failed to start demo', 'error');
    } finally {
      setDemoLoading(false);
    }
  };

  const handleCreateWebhooks = async () => {
    setWizardLoading(true);
    try {
      const res = await fetch('/api/webhooks/demo/step/create', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create webhooks');
      const data = await res.json();
      setCreatedDemoWebhooks(data.webhooks);
      addDemoWebhookIds(data.webhooks.map((w) => w.id));
      await fetchData();
    } catch (err) {
      showToast(err.message || 'Failed to create webhooks', 'error');
    } finally {
      setWizardLoading(false);
    }
  };

  const handleProcessWebhooks = async () => {
    setWizardLoading(true);
    try {
      const webhookIds = createdDemoWebhooks.map((w) => w.id);
      const res = await fetch('/api/webhooks/demo/step/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookIds }),
      });
      if (!res.ok) throw new Error('Failed to process webhooks');
      showToast('Webhooks queued! Watch them turn green...', 'success');
      // Wait a moment then move to next step
      setTimeout(() => {
        nextStep();
      }, 3000);
    } catch (err) {
      showToast(err.message || 'Failed to process webhooks', 'error');
    } finally {
      setWizardLoading(false);
    }
  };

  const handleSimulateFailure = async () => {
    setWizardLoading(true);
    try {
      const res = await fetch('/api/webhooks/demo/step/fail', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create failing webhook');
      const data = await res.json();
      addDemoWebhookIds([data.webhook.id]);
      showToast('Failing webhook created! Watch it retry...', 'success');
      // Wait for retries and DLQ, then advance
      setTimeout(() => {
        nextStep();
      }, 6000);
    } catch (err) {
      showToast(err.message || 'Failed to simulate failure', 'error');
    } finally {
      setWizardLoading(false);
    }
  };

  const handleCloseWizard = () => {
    exitDemoMode();
    setCreatedDemoWebhooks([]);
  };

  const handleViewDlq = () => {
    exitDemoMode();
    setCreatedDemoWebhooks([]);
    setActiveTab('dlq');
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toast message={toast?.message} type={toast?.type} onDismiss={dismissToast} />
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8 pt-20">
        {/* Demo Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-lg p-6 mb-8 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold mb-1">Welcome to Webhook Delivery System</h2>
              <p className="text-blue-100 text-sm">
                A production-ready webhook service with automatic retries, dead letter queue, and real-time monitoring.
                Click &quot;Guided Demo&quot; to see it in action!
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleStartGuidedDemo}
                disabled={demoLoading}
                className="px-5 py-2.5 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {demoLoading ? 'Loading...' : 'Guided Demo'}
              </button>
              <button
                onClick={runDemo}
                disabled={demoLoading}
                className="px-5 py-2.5 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Quick Demo
              </button>
              <button
                onClick={clearDemo}
                disabled={demoLoading}
                className="px-5 py-2.5 bg-blue-700 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

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

        {activeTab === 'overview' && (
          <WebhooksTable
            webhooks={webhooks}
            onRowClick={handleOpenModal}
            highlightIds={demoWebhookIds}
          />
        )}
        {activeTab === 'dlq' && <DlqTable dlq={dlq} retryWebhook={retryWebhook} retryingIds={retryingIds} onRowClick={handleOpenModal} />}
      </main>

      <WebhookDetailModal webhook={selectedWebhook} onClose={handleCloseModal} />

      <DemoWizard
        isOpen={isDemoMode}
        currentStep={demoStep}
        onClose={handleCloseWizard}
        onNextStep={nextStep}
        onCreateWebhooks={handleCreateWebhooks}
        onProcessWebhooks={handleProcessWebhooks}
        onSimulateFailure={handleSimulateFailure}
        onViewDlq={handleViewDlq}
        createdWebhooks={createdDemoWebhooks}
        isLoading={wizardLoading}
      />
    </div>
  );
}

export default App;