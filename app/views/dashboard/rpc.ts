import { useRpc } from "@get-bb/plugin-sdk/app";

import type {
  ActivityEntry,
  CompleteActivityInput,
  DashboardSummaryInput,
  DashboardSummaryOutput,
} from "../../../contracts/core.js";
import { rpcContract } from "../../../contracts/rpc.js";

/**
 * Keep the dashboard adapter narrow to the summary read and its task lifecycle
 * mutation so the view cannot accidentally couple to the rest of the RPC
 * surface.
 */
export interface DashboardRpcClient {
  call(
    method: "dashboard_summary",
    input: DashboardSummaryInput,
  ): Promise<DashboardSummaryOutput>;
  call(
    method: "activity_complete",
    input: CompleteActivityInput,
  ): Promise<ActivityEntry>;
}

/** Use BB's host client while retaining a small injectable surface for tests. */
export function useDashboardRpc(): DashboardRpcClient {
  return useRpc<typeof rpcContract>() as unknown as DashboardRpcClient;
}
