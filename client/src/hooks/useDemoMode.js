import { useState, useCallback, useRef, useEffect } from 'react';

export function useDemoMode(fetchData) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoWebhookIds, setDemoWebhookIds] = useState([]);
  const [demoStep, setDemoStep] = useState(0);
  const pollIntervalRef = useRef(null);
  const timeoutRef = useRef(null);

  // Start fast polling (1 second interval)
  const startFastPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(() => {
      fetchData();
    }, 1000);

    // Auto-disable after 2 minutes (safety)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      stopFastPolling();
    }, 120000);
  }, [fetchData]);

  // Stop fast polling
  const stopFastPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Enter demo mode
  const startDemoMode = useCallback(() => {
    setIsDemoMode(true);
    setDemoStep(1);
    setDemoWebhookIds([]);
    startFastPolling();
  }, [startFastPolling]);

  // Exit demo mode
  const exitDemoMode = useCallback(() => {
    setIsDemoMode(false);
    setDemoStep(0);
    setDemoWebhookIds([]);
    stopFastPolling();
  }, [stopFastPolling]);

  // Track webhook IDs for highlighting
  const addDemoWebhookIds = useCallback((ids) => {
    setDemoWebhookIds((prev) => [...prev, ...ids]);
  }, []);

  // Clear tracked webhook IDs
  const clearDemoWebhookIds = useCallback(() => {
    setDemoWebhookIds([]);
  }, []);

  // Advance to next step
  const nextStep = useCallback(() => {
    setDemoStep((prev) => prev + 1);
  }, []);

  // Go to specific step
  const goToStep = useCallback((step) => {
    setDemoStep(step);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopFastPolling();
    };
  }, [stopFastPolling]);

  return {
    isDemoMode,
    demoStep,
    demoWebhookIds,
    startDemoMode,
    exitDemoMode,
    nextStep,
    goToStep,
    addDemoWebhookIds,
    clearDemoWebhookIds,
    startFastPolling,
    stopFastPolling,
  };
}
