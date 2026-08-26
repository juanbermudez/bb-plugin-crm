import {
  useRpc,
  type PluginRpcCallArgs,
  type PluginRpcResult,
} from "@get-bb/plugin-sdk/app";

import { rpcContract } from "../../../contracts/rpc.js";

/**
 * The record editor only needs the field-definition list and value
 * subresource methods. Keeping this union narrow prevents a record surface
 * from accidentally issuing an unrelated plugin RPC.
 */
export const RECORD_FIELDS_METHODS = [
  "fields_list",
  "fields_values_list",
  "fields_values_create",
  "fields_values_update",
  "fields_values_delete",
] as const;

export type RecordFieldsMethod = (typeof RECORD_FIELDS_METHODS)[number];

type RecordFieldsContract = Pick<
  typeof rpcContract,
  RecordFieldsMethod
>;

/** Contract-derived client used by the reusable record-field editor. */
export type RecordFieldsRpcClient = {
  call<Method extends RecordFieldsMethod>(
    method: Method,
    ...args: PluginRpcCallArgs<RecordFieldsContract[Method]>
  ): Promise<PluginRpcResult<RecordFieldsContract[Method]>>;
};

/** Use the host BB client while preserving the narrowed editor contract. */
export function useRecordFieldsRpc(): RecordFieldsRpcClient {
  return useRpc<typeof rpcContract>() as unknown as RecordFieldsRpcClient;
}
