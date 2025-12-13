import { useContext } from 'react';
import { HubContext } from '../contexts/HubContext';

export const useHubConnector = () => {
  const context = useContext(HubContext);
  
  if (!context) {
    throw new Error('useHubConnector must be used within a HubContextProvider');
  }
  
  return context;
};
