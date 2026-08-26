import { describe, expect, it } from "vitest";
import { rpcContract } from "./rpc.js";

describe("CRM RPC contract", () => {
  it("uses deterministic flat method names for the company surface", () => {
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
});
