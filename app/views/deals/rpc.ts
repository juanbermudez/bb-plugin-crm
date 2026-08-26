import { useRpc } from "@get-bb/plugin-sdk/app";

import type {
  Deal,
  DealCreateInput,
  DealListInput,
  DealListOutput,
  DealUpdateInput,
  ContactListInput,
  ContactListOutput,
  CompanyListInput,
  CompanyListOutput,
  Id,
  SetDealStageInput,
} from "../../../contracts/core.js";
import { rpcContract } from "../../../contracts/rpc.js";

/** The narrow, typed RPC surface consumed by the deals workspace. */
export interface DealsRpcClient {
  call(method: "deals_list", input: DealListInput): Promise<DealListOutput>;
  call(method: "deals_get", input: { id: Id }): Promise<Deal>;
  call(method: "deals_create", input: DealCreateInput): Promise<Deal>;
  call(method: "deals_update", input: DealUpdateInput): Promise<Deal>;
  call(method: "deals_setStage", input: SetDealStageInput): Promise<Deal>;
  call(method: "deals_archive", input: { id: Id }): Promise<Deal>;
  call(method: "deals_restore", input: { id: Id }): Promise<Deal>;
  call(method: "deals_purge", input: { id: Id }): Promise<Deal>;
  call(method: "companies_list", input: CompanyListInput): Promise<CompanyListOutput>;
  call(method: "contacts_list", input: ContactListInput): Promise<ContactListOutput>;
  call(
    method: "deals_contacts_attach",
    input: { dealId: Id; contactId: Id; role?: string | null },
  ): Promise<Deal>;
  call(
    method: "deals_contacts_detach",
    input: { dealId: Id; contactId: Id },
  ): Promise<Deal>;
  call(
    method: "deals_contacts_updateRole",
    input: { dealId: Id; contactId: Id; role: string | null },
  ): Promise<Deal>;
}

/** Use BB's host RPC client while keeping the view easy to preview and test. */
export function useDealsRpc(): DealsRpcClient {
  return useRpc<typeof rpcContract>() as unknown as DealsRpcClient;
}
