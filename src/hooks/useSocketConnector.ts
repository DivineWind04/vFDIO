import { useCallback } from 'react';

export const useSocketConnector = () => {
  const disconnectSocket = useCallback(() => {
    console.log('Disconnecting socket');
    // Implementation for socket disconnection
  }, []);

  return { disconnectSocket };
};
