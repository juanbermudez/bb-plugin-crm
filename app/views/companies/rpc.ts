import { useRpc } from "@get-bb/plugin-sdk/app";

import type {
  Company,
  CompanyCreateInput,
  CompanyListInput,
  CompanyListOutput,
  CompanySetPrimaryContactInput,
  CompanyUpdateInput,
  Contact,
  ContactCreateInput,
  Deal,
  DealCreateInput,
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
  call(
    method: "companies_setPrimaryContact",
    input: CompanySetPrimaryContactInput,
  ): Promise<{ id: Id; primaryContactId: Id | null }>;
  call(method: "companies_archive", input: { id: Id }): Promise<Company>;
  call(method: "companies_restore", input: { id: Id }): Promise<Company>;
  call(method: "companies_purge", input: { id: Id }): Promise<Company>;
  call(method: "contacts_create", input: ContactCreateInput): Promise<Contact>;
  call(method: "deals_create", input: DealCreateInput): Promise<Deal>;
  call(
    method: "companies_enrich" | "companies_research",
    input: { id: Id; agentId?: Id },
  ): Promise<{ id: Id; queued: boolean; status?: string; runId?: Id | null; reason?: string | null }>;
  call(
    method: "companies_bulkEnrich",
    input: { ids: Id[] },
  ): Promise<{ requested: number; succeeded: number; skipped?: number; failed: number; message: string | null }>;
}

/** Use the BB client but expose only the typed methods this view consumes. */
export function useCompaniesRpc(): CompaniesRpcClient {
  return useRpc<typeof rpcContract>() as unknown as CompaniesRpcClient;
}
