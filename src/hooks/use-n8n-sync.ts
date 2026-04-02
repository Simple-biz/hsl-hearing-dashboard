import { useState } from 'react';

export interface SyncPayload {
  recordId: string;
  newStatus: string;
  needsFollowUp: boolean;
  // [key: string]: unknown; 
}

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