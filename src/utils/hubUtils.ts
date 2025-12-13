import type { HubConnection } from "@microsoft/signalr";
import { HubConnectionState } from "@microsoft/signalr/dist/esm/HubConnection";

export type HubInvocation<T> = (connection: HubConnection) => Promise<T>;

const ensureConnected = async (
  hubConnection: HubConnection | null,
  connectHub: () => Promise<void>
): Promise<HubConnection | null> => {
  if (!hubConnection) {
    await connectHub();
    return hubConnection;
  }
  
  if (hubConnection.state !== HubConnectionState.Connected) {
    await connectHub();
  }
  
  return hubConnection;
};

export const invokeHub = async <T>(
  hubConnection: HubConnection | null,
  connectHub: () => Promise<void>,
  invocation: HubInvocation<T>
): Promise<T | void> => {
  const connection = await ensureConnected(hubConnection, connectHub);
  if (!connection) return;

  try {
    return await invocation(connection);
  } catch (error) {
    console.log("Hub invocation error:", error);
  }
};
