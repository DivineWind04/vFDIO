import React from 'react';
import { useRootDispatch } from '../redux/hooks';
import { logoutThunk } from '../redux/slices/authSlice';
import { useHubConnector } from '../hooks/useHubConnector';

const Header = () => {
  const dispatch = useRootDispatch();
  const { disconnectHub } = useHubConnector();

  const handleLogout = () => {
        disconnectHub();
        dispatch(logoutThunk(true));
      };

  return (
    <div className='terminal-header'>
        <h1 className='fixed top-4 left-4'>FDIO ALPHA</h1>
        <button onClick={handleLogout} className='logout-btn fixed top-4 right-4 border-2 text-sm border-fdio-green py-2 px-2 hover:bg-fdio-green hover:text-black duration-500'>
            LOGOUT
        </button>
    </div>
    
  )
}

export default Header