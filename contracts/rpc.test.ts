import { describe, expect, it } from "vitest";
import { rpcContract } from "./rpc.js";

describe("CRM RPC contract", () => {
  it("uses deterministic flat method names for the company and contact surfaces", () => {
    expect(Object.keys(rpcContract)).toEqual([
      "status",
      "companies_list",
      "companies_get",
      "companies_create",
      "companies_update",
      "companies_archive",
      "companies_restore",
      "companies_purge",
      "companies_bulkAssignOwner",
      "companies_bulkArchive",
      "companies_bulkRestore",
      "companies_bulkPurge",
      "contacts_list",
      "contacts_get",
      "contacts_create",
      "contacts_update",
      "contacts_archive",
      "contacts_restore",
      "contacts_purge",
      "contacts_bulkAssignOwner",
      "contacts_bulkAssignCompany",
      "contacts_bulkArchive",
      "contacts_bulkRestore",
      "contacts_bulkPurge",
    ]);
  });

  it("keeps company RPC inputs and outputs strict", () => {
    expect(
      rpcContract.companies_create.input.safeParse({
        name: "Acme",
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.companies_list.input.safeParse({
        page: 1,
        pageSize: 25,
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it("keeps contact RPC inputs strict", () => {
    expect(
      rpcContract.contacts_create.input.safeParse({
        firstName: "Ada",
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.contacts_list.input.safeParse({
        page: 1,
        pageSize: 25,
        unexpected: true,
      }).success,
    ).toBe(false);
  });
});
