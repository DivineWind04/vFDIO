import { VNAS_CONFIG_URL, VATSIM_CLIENT_ID } from '../utils/constants';

type LoginDto = {
  nasToken: string;
  vatsimToken: string;
};

export const login = async (apiBaseUrl: string, code: string, redirectUrl: string) => {
  return fetch(`${apiBaseUrl}/auth/login?code=${code}&redirectUrl=${redirectUrl}&clientId=${VATSIM_CLIENT_ID}`, {
    credentials: "include",
  }).then((response) => {
    return response.json().then((data: LoginDto) => ({
      ...data,
      statusText: response.statusText,
      ok: response.ok,
    }));
  });
};

export const refreshToken = async (apiBaseUrl: string, vatsimToken: string) => {
  return fetch(`${apiBaseUrl}/auth/refresh?vatsimToken=${vatsimToken}`).then((r) =>
    r.text().then((data) => ({ data, statusText: r.statusText, ok: r.ok }))
  );
};

export const fetchVnasConfiguration = async () => {
  const response = await fetch(VNAS_CONFIG_URL);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch vNAS configuration: ${response.statusText}`);
  }
  
  return await response.json();
};
