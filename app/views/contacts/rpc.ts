import { useRpc } from "@get-bb/plugin-sdk/app";

import type {
  Contact,
  ContactCreateInput,
  ContactListInput,
  ContactListOutput,
  ContactUpdateInput,
  CompanyListInput,
  CompanyListOutput,
  CompanySetPrimaryContactInput,
  CompanySetPrimaryContactOutput,
  Id,
} from "../../../contracts/core.js";
import { rpcContract } from "../../../contracts/rpc.js";

/** The narrow, typed RPC surface consumed by the contacts workspace. */
export interface ContactsRpcClient {
  call(method: "contacts_list", input: ContactListInput): Promise<ContactListOutput>;
  call(method: "contacts_get", input: { id: Id }): Promise<Contact>;
  call(method: "contacts_create", input: ContactCreateInput): Promise<Contact>;
  call(method: "contacts_update", input: ContactUpdateInput): Promise<Contact>;
  call(method: "contacts_archive", input: { id: Id }): Promise<Contact>;
  call(method: "contacts_restore", input: { id: Id }): Promise<Contact>;
  call(method: "contacts_purge", input: { id: Id }): Promise<Contact>;
  call(method: "companies_list", input: CompanyListInput): Promise<CompanyListOutput>;
  call(
    method: "companies_setPrimaryContact",
    input: CompanySetPrimaryContactInput,
  ): Promise<CompanySetPrimaryContactOutput>;
  call(
    method: "contacts_enrich",
    input: { id: Id; agentId?: Id },
  ): Promise<{ id: Id; queued: boolean; status?: string; runId?: Id | null; reason?: string | null }>;
  call(
    method: "contacts_bulkEnrich",
    input: { ids: Id[] },
  ): Promise<{ requested: number; succeeded: number; skipped?: number; failed: number; message: string | null }>;
  call(
    method: "contacts_research",
    input: { id: Id; focus?: "socials" | "work-history" | "brief"; agentId?: Id },
  ): Promise<{ id: Id; queued: boolean; status?: string; runId?: Id | null; reason?: string | null }>;
}

/** Use BB's host RPC client while keeping the view easy to preview and test. */
export function useContactsRpc(): ContactsRpcClient {
  return useRpc<typeof rpcContract>() as unknown as ContactsRpcClient;
}
