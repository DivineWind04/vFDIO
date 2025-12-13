import { faGear } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  configSelector, 
  envSelector, 
  login, 
  setEnv, 
  vatsimTokenSelector, 
  logout, 
  sessionSelector, 
  logoutThunk 
} from "../redux/slices/authSlice";
import { useRootDispatch, useRootSelector } from "../redux/hooks";
import { DOMAIN, VATSIM_CLIENT_ID } from "../utils/constants";
import { IconProp } from "@fortawesome/fontawesome-svg-core";

// Simple styles for now
const loginStyles = {
  bg: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1a1a1a',
    zIndex: -1,
  },
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    color: 'white',
  },
  waiting: {
    textAlign: 'center' as const,
    margin: '20px 0',
  },
  logoutButton: {
    padding: '10px 20px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    margin: '10px',
  },
};

function redirectLogin() {
  window.location.href = `https://auth.vatsim.net/oauth/authorize?client_id=${VATSIM_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    `${DOMAIN}/login`
  )}&response_type=code&scope=vatsim_details`;
}

const Login = () => {
  const dispatch = useRootDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");
  const vatsimToken = useRootSelector(vatsimTokenSelector);
  const config = useRootSelector(configSelector);
  const env = useRootSelector(envSelector);
  const hubSession = useRootSelector(sessionSelector);

  useEffect(() => {
    if (code && env) {
      dispatch(
        login({
          code,
          redirectUrl: encodeURIComponent(`${DOMAIN}/login`),
        })
      );
    }
  }, [code, dispatch, env]);

  const handleLogout = () => {
    dispatch(logoutThunk(true));
  };

  useEffect(() => {
    if (vatsimToken) {
      // Navigate to main app after successful login
      // The hub connection will be handled by HubContextProvider
      navigate("/", { replace: true });
    }
  }, [navigate, vatsimToken]);

  return (
    <>
      <div style={loginStyles.bg} />
      <div style={loginStyles.root}>
        <div>
          <h1>vFDIO Login</h1>
          {vatsimToken ? (
            <>
              <div style={loginStyles.waiting}>
                <br />
                Login successful! Redirecting...
                <br />
              </div>
              <button type="button" onClick={handleLogout} style={loginStyles.logoutButton}>
                Logout
              </button>
            </>
          ) : (
            <>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    dispatch(setEnv(e.target.value));
                  }
                }}
                value={env?.name}
              >
                {config &&
                  config.environments.map((e) => (
                    <option key={e.name} disabled={e.isDisabled}>
                      {e.name}
                    </option>
                  ))}
              </select>
              <button type="button" disabled={code !== null} onClick={redirectLogin}>
                {code ? <FontAwesomeIcon icon={faGear as IconProp} className="fa-spin" /> : "Login with VATSIM"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
};

const LoginProvider = () => (
  <React.StrictMode>
    <Login />
  </React.StrictMode>
);

export default LoginProvider;
