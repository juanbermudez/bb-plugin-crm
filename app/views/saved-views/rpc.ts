import { useRpc } from "@get-bb/plugin-sdk/app";

import type {
  SavedView,
  SavedViewCreateInput,
  SavedViewDeleteInput,
  SavedViewDeleteOutput,
  SavedViewListInput,
  SavedViewListOutput,
  SavedViewSetDefaultInput,
  SavedViewUpdateInput,
} from "../../../contracts/core.js";
import { rpcContract } from "../../../contracts/rpc.js";

/** The narrow saved-view RPC surface consumed by SavedViewBar. */
export interface SavedViewsRpcClient {
  call(
    method: "savedViews_list",
    input: SavedViewListInput,
  ): Promise<SavedViewListOutput>;
  call(
    method: "savedViews_create",
    input: SavedViewCreateInput,
  ): Promise<SavedView>;
  call(
    method: "savedViews_update",
    input: SavedViewUpdateInput,
  ): Promise<SavedView>;
  call(
    method: "savedViews_delete",
    input: SavedViewDeleteInput,
  ): Promise<SavedViewDeleteOutput>;
  call(
    method: "savedViews_setDefault",
    input: SavedViewSetDefaultInput,
  ): Promise<SavedView>;
}

/** Use BB's host RPC client while keeping the toolbar injectable in tests. */
export function useSavedViewsRpc(): SavedViewsRpcClient {
  return useRpc<typeof rpcContract>() as unknown as SavedViewsRpcClient;
}
