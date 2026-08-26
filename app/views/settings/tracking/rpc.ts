import {
  useRpc,
  type PluginRpcCallArgs,
  type PluginRpcResult,
} from "@get-bb/plugin-sdk/app";

import { rpcContract } from "../../../../contracts/rpc.js";

export const TRACKING_METHODS = [
  "tracking_sites_list",
  "tracking_sites_get",
  "tracking_sites_create",
  "tracking_sites_update",
  "tracking_sites_verify",
  "tracking_sites_pause",
  "tracking_sites_rotate",
  "tracking_tokens_list",
  "tracking_tokens_provision",
  "tracking_tokens_rotate",
  "tracking_tokens_revoke",
  "tracking_aggregates_list",
  "tracking_aggregates_rollup",
  "tracking_aggregates_prune",
  "tracking_traffic_sources_list",
] as const satisfies readonly (keyof typeof rpcContract)[];

export type TrackingMethod = (typeof TRACKING_METHODS)[number];

export type TrackingRpcClient = {
  call<Method extends TrackingMethod>(
    method: Method,
    ...args: PluginRpcCallArgs<typeof rpcContract[Method]>
  ): Promise<PluginRpcResult<typeof rpcContract[Method]>>;
};

export function useTrackingRpc(): TrackingRpcClient {
  return useRpc<typeof rpcContract>() as unknown as TrackingRpcClient;
}
