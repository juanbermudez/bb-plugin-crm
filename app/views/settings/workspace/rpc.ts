import {
  useRpc,
  type PluginRpcCallArgs,
  type PluginRpcResult,
} from "@get-bb/plugin-sdk/app";

import { rpcContract } from "../../../../contracts/rpc.js";

export const WORKSPACE_METHODS = [
  "workspace_identity_get",
  "workspace_identity_update",
] as const satisfies readonly (keyof typeof rpcContract)[];

export type WorkspaceMethod = (typeof WORKSPACE_METHODS)[number];

export type WorkspaceRpcClient = {
  call<Method extends WorkspaceMethod>(
    method: Method,
    ...args: PluginRpcCallArgs<typeof rpcContract[Method]>
  ): Promise<PluginRpcResult<typeof rpcContract[Method]>>;
};

export function useWorkspaceRpc(): WorkspaceRpcClient {
  return useRpc<typeof rpcContract>() as unknown as WorkspaceRpcClient;
}
