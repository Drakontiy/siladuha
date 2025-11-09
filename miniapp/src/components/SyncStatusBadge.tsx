import React, { useEffect, useState } from 'react';
import { getSyncStatus, subscribeToSyncStatus, SyncStatus } from '../utils/userStateSync';

const SyncStatusBadge: React.FC = () => {
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus());

  useEffect(() => {
    return subscribeToSyncStatus(setStatus);
  }, []);

  if (status.isSyncing) {
    return (
      <div className="sync-status sync-status--syncing">
        Сохраняем изменения…
      </div>
    );
  }

  if (status.error) {
    return (
      <div className="sync-status sync-status--error">
        Не удалось синхронизировать. Изменения сохранятся локально.
      </div>
    );
  }

  return null;
};

export default SyncStatusBadge;


