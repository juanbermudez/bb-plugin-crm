import { useRpc } from "@get-bb/plugin-sdk/app";

import type {
  ActivityCreateInput,
  ActivityEntry,
  CompleteActivityInput,
  TimelineCountsInput,
  TimelineCountsOutput,
  TimelineInput,
  TimelineOutput,
} from "../../../contracts/core.js";
import { rpcContract } from "../../../contracts/rpc.js";

/**
 * The timeline intentionally consumes only the four activity operations it
 * needs. Keeping this narrow makes the component easy to preview with a local
 * fake while preserving the BB contract's strict input/output pairs.
 */
export interface ActivityRpcClient {
  call(method: "activity_timeline", input: TimelineInput): Promise<TimelineOutput>;
  call(
    method: "activity_timelineCounts",
    input: TimelineCountsInput,
  ): Promise<TimelineCountsOutput>;
  call(method: "activity_create", input: ActivityCreateInput): Promise<ActivityEntry>;
  call(
    method: "activity_complete",
    input: CompleteActivityInput,
  ): Promise<ActivityEntry>;
}

/** Use BB's host client while keeping the timeline injectable in tests/previews. */
export function useActivityRpc(): ActivityRpcClient {
  return useRpc<typeof rpcContract>() as unknown as ActivityRpcClient;
}
