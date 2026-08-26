import {
  useRpc,
  type PluginRpcCallArgs,
  type PluginRpcResult,
} from "@get-bb/plugin-sdk/app";

import { rpcContract } from "../../../../contracts/rpc.js";

export const CONNECTION_METHODS = [
  "connections_list",
  "connections_get",
  "connections_health",
  "connections_upsert",
  "connections_disable",
  "connections_syncSuccess",
  "connections_syncFailure",
  "connections_syncCursors",
  "connections_syncResult",
  "connections_syncNow",
  "slack_channels_list",
  "slack_matches_list",
  "slack_channel_join",
  "slack_channel_create",
  "connections_diagnostics",
] as const satisfies readonly (keyof typeof rpcContract)[];

export type ConnectionMethod = (typeof CONNECTION_METHODS)[number];

/**
 * The settings surface deliberately exposes only connection RPCs. Keeping the
 * generic arguments contract-backed gives previews and tests the same input
 * validation shape as the BB host client.
 */
export type ConnectionsRpcClient = {
  call<Method extends ConnectionMethod>(
    method: Method,
    ...args: PluginRpcCallArgs<typeof rpcContract[Method]>
  ): Promise<PluginRpcResult<typeof rpcContract[Method]>>;
};

export function useConnectionsRpc(): ConnectionsRpcClient {
  return useRpc<typeof rpcContract>() as unknown as ConnectionsRpcClient;
}
