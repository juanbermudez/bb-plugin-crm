import { useRpc } from "@get-bb/plugin-sdk/app";

import type {
  Company,
  CompanyCreateInput,
  CompanyListInput,
  CompanyListOutput,
  CompanyUpdateInput,
  Id,
} from "../../../contracts/core.js";
import { rpcContract } from "../../../contracts/rpc.js";

/**
 * The company view's narrow RPC surface. Keeping the method/input/output
 * pairing here makes the view independent from the broader contract while the
 * server grows contacts, deals, and settings methods in parallel.
 */
export interface CompaniesRpcClient {
  call(method: "companies_list", input: CompanyListInput): Promise<CompanyListOutput>;
  call(method: "companies_get", input: { id: Id }): Promise<Company>;
  call(method: "companies_create", input: CompanyCreateInput): Promise<Company>;
  call(method: "companies_update", input: CompanyUpdateInput): Promise<Company>;
  call(method: "companies_archive", input: { id: Id }): Promise<Company>;
  call(method: "companies_restore", input: { id: Id }): Promise<Company>;
  call(method: "companies_purge", input: { id: Id }): Promise<Company>;
}

/** Use the BB client but expose only the typed methods this view consumes. */
export function useCompaniesRpc(): CompaniesRpcClient {
  return useRpc<typeof rpcContract>() as unknown as CompaniesRpcClient;
}
