import { useRpc } from "@get-bb/plugin-sdk/app";

import type {
  DashboardSummaryInput,
  DashboardSummaryOutput,
} from "../../../contracts/core.js";
import { rpcContract } from "../../../contracts/rpc.js";

/**
 * The dashboard only needs one read method. Keeping this adapter narrow makes
 * the view straightforward to preview and prevents accidental coupling to the
 * rest of the CRM RPC surface.
 */
export interface DashboardRpcClient {
  call(
    method: "dashboard_summary",
    input: DashboardSummaryInput,
  ): Promise<DashboardSummaryOutput>;
}

/** Use BB's host client while retaining a small injectable surface for tests. */
export function useDashboardRpc(): DashboardRpcClient {
  return useRpc<typeof rpcContract>() as unknown as DashboardRpcClient;
}
