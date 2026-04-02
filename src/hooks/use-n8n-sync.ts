import { useState } from 'react';

// 1. THE BLUEPRINT (Fixes Error 1)
// This tells TypeScript exactly what to expect when you call triggerSync()
export interface SyncPayload {
  recordId: string;
  newStatus: string;
  needsFollowUp: boolean;
  // If you ever need to pass other random data, uncomment the line below!
  // [key: string]: unknown; 
}

/**
 * Custom Hook: useN8nSync
 * Import this into any component or modal to easily trigger your automation!
 */
export function useN8nSync() {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // We assign the 'SyncPayload' type to recordData here!
  const triggerSync = async (recordData: SyncPayload) => {
    setIsSyncing(true);
    setSyncError(null);

    try {
      const response = await fetch('/api/update-record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(recordData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync with database/n8n');
      }

      return data; 

    } catch (error: unknown) {
      console.error('Sync Hook Error:', error);
      
      // 2. THE ERROR CHECK (Fixes Error 2)
      // We safely check if the error is a standard Error object before reading it
      if (error instanceof Error) {
        setSyncError(error.message);
      } else {
        setSyncError(String(error));
      }
      
      throw error;
    } finally {
      setIsSyncing(false); 
    }
  };

  return { triggerSync, isSyncing, syncError };
}