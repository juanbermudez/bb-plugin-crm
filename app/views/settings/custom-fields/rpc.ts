import {
  useRpc,
  type PluginRpcCallArgs,
  type PluginRpcResult,
} from "@get-bb/plugin-sdk/app";

import { rpcContract } from "../../../../contracts/rpc.js";

export const CUSTOM_FIELDS_METHODS = [
  "fields_list",
  "fields_byKey",
  "fields_filters",
  "fields_coverage",
  "fields_backfill",
  "fields_create",
  "fields_update",
  "fields_reorder",
  "fields_archive",
  "fields_restore",
  "fields_delete",
  "fields_options_list",
  "fields_options_create",
  "fields_options_update",
  "fields_options_archive",
  "fields_options_restore",
  "fields_options_delete",
  "fields_values_list",
  "fields_values_create",
  "fields_values_update",
  "fields_values_delete",
] as const satisfies readonly (keyof typeof rpcContract)[];

/**
 * The settings screen only needs the custom-field portion of the plugin
 * contract. Keeping the method name as a contract-derived union means a
 * caller cannot accidentally issue a non-field RPC from this view.
 */
export type CustomFieldsMethod = (typeof CUSTOM_FIELDS_METHODS)[number];

type CustomFieldsContract = typeof rpcContract;

/**
 * Strict, contract-backed custom-field client used by the settings view.
 * `PluginRpcCallArgs` preserves required/optional input behavior and
 * `PluginRpcResult` preserves the schema output for every method.
 */
export type CustomFieldsRpcClient = {
  call<Method extends CustomFieldsMethod>(
    method: Method,
    ...args: PluginRpcCallArgs<CustomFieldsContract[Method]>
  ): Promise<PluginRpcResult<CustomFieldsContract[Method]>>;
};

/**
 * Use BB's host client while exposing only the typed custom-field methods that
 * this settings surface can call.
 */
export function useCustomFieldsRpc(): CustomFieldsRpcClient {
  const client = useRpc<typeof rpcContract>();
  return client;
}

/** Alias for callers that use the shorter feature name. */
export const useFieldsRpc = useCustomFieldsRpc;

/** A named alias is useful to consumers that prefer the shorter term. */
export type FieldsRpcClient = CustomFieldsRpcClient;
