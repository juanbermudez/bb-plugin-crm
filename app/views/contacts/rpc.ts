import { useRpc } from "@get-bb/plugin-sdk/app";

import type {
  Contact,
  ContactCreateInput,
  ContactListInput,
  ContactListOutput,
  ContactUpdateInput,
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
}

/** Use BB's host RPC client while keeping the view easy to preview and test. */
export function useContactsRpc(): ContactsRpcClient {
  return useRpc<typeof rpcContract>() as unknown as ContactsRpcClient;
}
