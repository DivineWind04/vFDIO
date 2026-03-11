import type { HubConnection } from "@microsoft/signalr";
import { HubConnectionState } from "@microsoft/signalr";

export type HubInvocation<T> = (connection: HubConnection) => Promise<T>;

const ensureConnected = async (
  getHubConnection: () => HubConnection | null,
  connectHub: () => Promise<void>
): Promise<HubConnection | null> => {
  let hubConnection = getHubConnection();

  if (!hubConnection) {
    await connectHub();
    return getHubConnection();
  }
  
  if (hubConnection.state !== HubConnectionState.Connected) {
    await connectHub();
  }
  
  return getHubConnection();
};

export const invokeHub = async <T>(
  getHubConnection: () => HubConnection | null,
  connectHub: () => Promise<void>,
  invocation: HubInvocation<T>
): Promise<T | void> => {
  const connection = await ensureConnected(getHubConnection, connectHub);
  if (!connection) return;

  try {
    return await invocation(connection);
  } catch (error) {
    console.log("Hub invocation error:", error);
  }
};
