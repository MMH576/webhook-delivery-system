import { useState } from 'react';

const STEPS = [
  {
    id: 1,
    title: 'Welcome',
    description: 'Learn how this webhook delivery system works through an interactive demo.',
  },
  {
    id: 2,
    title: 'Create Webhooks',
    description: 'Create 3 webhooks in pending state. They won\'t be processed yet.',
  },
  {
    id: 3,
    title: 'Process Webhooks',
    description: 'Queue the webhooks for delivery. Watch them turn green as they succeed!',
  },
  {
    id: 4,
    title: 'Simulate Failure',
    description: 'Create a webhook that will fail. Watch it retry and move to the Dead Letter Queue.',
  },
  {
    id: 5,
    title: 'Complete',
    description: 'Demo complete! Try the DLQ tab to retry failed webhooks.',
  },
];

export default function DemoWizard({
  isOpen,
  currentStep,
  onClose,
  onNextStep,
  onCreateWebhooks,
  onProcessWebhooks,
  onSimulateFailure,
  onViewDlq,
  createdWebhooks,
  isLoading,
}) {
  if (!isOpen) return null;

  const step = STEPS.find((s) => s.id === currentStep) || STEPS[0];

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Interactive Demo</h3>
              <p className="text-gray-600 text-sm">
                This guided tour shows you the complete webhook lifecycle:
              </p>
            </div>
            <div className="text-left bg-gray-50 rounded-lg p-4 mb-6">
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  Create webhooks in pending state
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  Process and deliver them
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-red-100 text-red-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  See failure handling & DLQ
                </li>
              </ul>
            </div>
            <button
              onClick={onNextStep}
              className="w-full px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              Start Demo
            </button>
          </div>
        );

      case 2:
        return (
          <div>
            <p className="text-gray-600 text-sm mb-4">
              Click below to create 3 sample webhooks. They will appear in the table with <span className="text-yellow-600 font-medium">Pending</span> status.
            </p>
            {createdWebhooks.length > 0 ? (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Created webhooks:</p>
                <div className="space-y-2">
                  {createdWebhooks.map((w) => (
                    <div key={w.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-sm text-gray-600 truncate max-w-[200px]">{w.payload?.event}</span>
                      <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
                        {w.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex gap-3">
              {createdWebhooks.length === 0 ? (
                <button
                  onClick={onCreateWebhooks}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Creating...' : 'Create 3 Webhooks'}
                </button>
              ) : (
                <button
                  onClick={onNextStep}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Next: Process Them
                </button>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div>
            <p className="text-gray-600 text-sm mb-4">
              Now queue these webhooks for delivery. Watch the status change from <span className="text-yellow-600 font-medium">Pending</span> to <span className="text-green-600 font-medium">Delivered</span> in the table!
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-700">
                <strong>Tip:</strong> Watch the table below - webhooks will turn green as they're delivered!
              </p>
            </div>
            <button
              onClick={onProcessWebhooks}
              disabled={isLoading}
              className="w-full px-4 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Processing...' : 'Process Webhooks'}
            </button>
          </div>
        );

      case 4:
        return (
          <div>
            <p className="text-gray-600 text-sm mb-4">
              Now let's see what happens when delivery fails. This creates a webhook targeting an endpoint that returns errors.
            </p>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-orange-700">
                <strong>What to watch:</strong> The webhook will retry twice, then move to the Dead Letter Queue (DLQ).
              </p>
            </div>
            <button
              onClick={onSimulateFailure}
              disabled={isLoading}
              className="w-full px-4 py-2.5 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : 'Simulate Failure'}
            </button>
          </div>
        );

      case 5:
        return (
          <div className="text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Demo Complete!</h3>
              <p className="text-gray-600 text-sm">
                You've seen the complete webhook delivery lifecycle.
              </p>
            </div>
            <div className="text-left bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm font-medium text-gray-700 mb-2">What you experienced:</p>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>✓ Webhook creation with signature generation</li>
                <li>✓ Background processing with Bull Queue</li>
                <li>✓ Automatic retries with exponential backoff</li>
                <li>✓ Dead Letter Queue for failed deliveries</li>
              </ul>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
              <button
                onClick={onViewDlq}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                View DLQ Tab
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-24 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{step.title}</h2>
            <p className="text-xs text-gray-500">Step {currentStep} of {STEPS.length}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {STEPS.map((s, idx) => (
              <div key={s.id} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    s.id < currentStep
                      ? 'bg-green-500 text-white'
                      : s.id === currentStep
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {s.id < currentStep ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    s.id
                  )}
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`w-8 h-0.5 mx-1 transition-colors ${
                      s.id < currentStep ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {renderStepContent()}
        </div>
      </div>
    </div>
  );
}
