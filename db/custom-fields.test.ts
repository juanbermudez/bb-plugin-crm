import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { archiveCompany, createCompany } from "./companies.js";
import { createContact } from "./contacts.js";
import { createDeal } from "./deals.js";
import { initializeSchema } from "./schema.js";
import {
  CustomFieldStore,
  CUSTOM_FIELD_BACKFILL_MAX_RECORDS,
  FieldConflictError,
  FieldValueError,
  createFieldDefinition,
  createFieldOption,
  createFieldValue,
  deleteFieldDefinition,
  deleteFieldOption,
  deleteFieldValue,
  getFieldCoverage,
  getFieldDefinition,
  listFieldDefinitions,
  listFieldOptions,
  listFieldValues,
  updateFieldValue,
} from "./custom-fields.js";

function withDatabase() {
  const host = createFakePluginHost({ pluginId: "crm-custom-fields-test" });
  const db = host.bb.storage.database();
  initializeSchema(host.bb, db);
  return { db, lifecycle: host.harness.lifecycle };
}

describe("CRM custom-field persistence", () => {
  it("creates normalized definitions and options with source defaults", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const store = new CustomFieldStore(db);
      const text = store.create({
        id: "field_company_segment",
        entity: "COMPANY",
        label: "  Segment  ",
        type: "TEXT",
        agentBrief: "  Describe the segment. ",
      });
      const select = store.create({
        id: "field_company_tier",
        entity: "COMPANY",
        label: "Tier",
        type: "SELECT",
        showOnFilter: true,
        options: [
          { id: "option_enterprise", label: "Enterprise", position: 91 },
          { id: "option_startup", label: "Startup", position: 2 },
        ],
      });
      const user = store.create({
        id: "field_company_owner",
        entity: "COMPANY",
        label: "Account owner",
        type: "USER",
        showOnFilter: true,
      });

      expect(text).toMatchObject({
        id: "field_company_segment",
        entity: "COMPANY",
        key: "segment",
        label: "Segment",
        type: "TEXT",
        agentFilled: true,
        agentBrief: "Describe the segment.",
        required: false,
        showOnSheet: true,
        showOnTable: false,
        showOnFilter: false,
        position: 0,
        archived: false,
        archivedAt: null,
        options: [],
      });
      expect(select.options.map((option) => [option.id, option.position])).toEqual([
        ["option_enterprise", 0],
        ["option_startup", 1],
      ]);
      expect(user.position).toBe(2);
      expect(store.list("COMPANY").map((field) => field.key)).toEqual([
        "segment",
        "tier",
        "account_owner",
      ]);
      expect(store.filters("COMPANY").map((field) => field.key)).toEqual([
        "tier",
        "account_owner",
      ]);
      expect(store.byKey("COMPANY", "tier").id).toBe(select.id);
      expect(() => store.byKey("COMPANY", "missing")).toThrow("No field");
      expect(() => store.create({ entity: "COMPANY", label: "***", type: "TEXT" })).toThrow(
        "usable key",
      );
      expect(() => store.create({ entity: "COMPANY", label: "Tier", type: "TEXT" })).toThrow(
        FieldConflictError,
      );
      expect(() => store.create({ entity: "CONTACT", label: "Tier", type: "SELECT" })).toThrow(
        "at least one option",
      );
      expect(() => store.create({ entity: "COMPANY", label: "Bad", type: "TEXT", options: [{ label: "x" }] })).toThrow(
        "Only select",
      );
      expect(listFieldDefinitions(db, { entity: "COMPANY", includeArchived: false })).toHaveLength(3);
      expect(getFieldDefinition(db, select.id)?.options).toHaveLength(2);
    } finally {
      await lifecycle.dispose();
    }
  });

  it("updates, reorders, archives, restores, and manages option lifecycle", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const store = new CustomFieldStore(db);
      const first = store.create({
        id: "field_first",
        entity: "CONTACT",
        label: "First",
        type: "SELECT",
        options: [{ id: "option_first", label: "One" }],
      });
      const second = store.create({
        id: "field_second",
        entity: "CONTACT",
        label: "Second",
        type: "TEXT",
      });
      const updated = store.update(first.id, {
        label: "Updated first",
        showOnTable: true,
        options: [
          { id: "option_first", label: "Renamed", position: 40 },
          { label: "Two" },
        ],
      });
      expect(updated).toMatchObject({ label: "Updated first", showOnTable: true });
      expect(updated.options.map((option) => option.label)).toEqual(["Renamed", "Two"]);
      expect(updated.options.map((option) => option.position)).toEqual([0, 1]);
      const newOptionId = updated.options.find((option) => option.label === "Two")!.id;

      const archivedOption = store.archiveOption(newOptionId);
      expect(archivedOption.archived).toBe(true);
      expect(store.listOptions({ fieldId: first.id }).map((option) => option.id)).toEqual(["option_first"]);
      expect(store.listOptions({ fieldId: first.id, includeArchived: true }).map((option) => option.id)).toEqual([
        "option_first",
        newOptionId,
      ]);
      expect(store.restoreOption(newOptionId).archived).toBe(false);
      expect(store.updateOption(newOptionId, { data: { label: "Two revised", position: 8 } })).toMatchObject({
        label: "Two revised",
        position: 8,
      });
      expect(createFieldOption(db, { fieldId: first.id, label: "Three" }).position).toBe(9);

      expect(store.reorder({ entity: "CONTACT", ids: [second.id, first.id] }).map((field) => field.id)).toEqual([
        second.id,
        first.id,
      ]);
      expect(store.list("CONTACT").map((field) => field.id)).toEqual([second.id, first.id]);
      expect(() => store.reorder({ entity: "CONTACT", ids: [first.id, first.id] })).toThrow("repeat");
      expect(() => store.reorder({ entity: "DEAL", ids: [first.id] })).toThrow("not on this record type");

      const archived = store.archive(first.id);
      expect(archived.archived).toBe(true);
      expect(store.list("CONTACT").map((field) => field.id)).toEqual([second.id]);
      expect(store.list({ entity: "CONTACT", includeArchived: true }).map((field) => field.id)).toEqual([
        second.id,
        first.id,
      ]);
      expect(store.get(first.id, { includeArchived: false })).toBeNull();
      expect(store.restore(first.id).archived).toBe(false);

      expect(store.update(second.id, { data: { agentBrief: null, required: true } })).toMatchObject({
        agentBrief: null,
        required: true,
      });
      expect(store.update(first.id, { type: "NUMBER" }).type).toBe("NUMBER");
      expect(deleteFieldOption(db, newOptionId)).toEqual({ id: newOptionId });
      expect(() => store.getRequired("missing_field")).toThrow("No field");
    } finally {
      await lifecycle.dispose();
    }
  });

  it("upserts typed values with entity/type/referential validation and coverage", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const company = createCompany(db, { id: "cmp_fields", name: "Field Co" });
      const contact = createContact(db, { id: "con_fields", firstName: "Ada", companyId: company.id });
      const deal = createDeal(db, { id: "deal_fields", name: "Field deal", companyId: company.id, ownerId: "user_1" });
      const store = new CustomFieldStore(db);
      const text = store.create({ id: "field_text", entity: "COMPANY", label: "Summary", type: "TEXT" });
      const number = store.create({ id: "field_number", entity: "COMPANY", label: "Seats", type: "NUMBER" });
      const date = store.create({ id: "field_date", entity: "COMPANY", label: "Renewal", type: "DATE" });
      const checkbox = store.create({ id: "field_checkbox", entity: "COMPANY", label: "Active", type: "CHECKBOX" });
      const select = store.create({
        id: "field_select",
        entity: "COMPANY",
        label: "Plan",
        type: "SELECT",
        options: [{ id: "option_pro", label: "Pro" }],
      });
      const user = store.create({ id: "field_user", entity: "COMPANY", label: "Rep", type: "USER" });

      expect(createFieldValue(db, { id: "value_text", entity: "COMPANY", recordId: company.id, fieldId: text.id, value: "  hello  " })).toMatchObject({
        id: "value_text",
        value: "hello",
      });
      expect(store.upsertValue({ entity: "COMPANY", recordId: company.id, fieldId: number.id, value: "42" })).toMatchObject({
        value: 42,
      });
      expect(store.upsertValue({ entity: "COMPANY", recordId: company.id, fieldId: date.id, value: "2027-03-31" })).toMatchObject({
        value: "2027-03-31T00:00:00.000Z",
      });
      expect(store.upsertValue({ entity: "COMPANY", recordId: company.id, fieldId: checkbox.id, value: "true" })).toMatchObject({
        value: true,
      });
      expect(store.upsertValue({ entity: "COMPANY", recordId: company.id, fieldId: select.id, value: "pro" })).toMatchObject({
        value: "option_pro",
      });
      expect(store.upsertValue({ entity: "COMPANY", recordId: company.id, fieldId: user.id, value: "user_1" })).toMatchObject({
        value: "user_1",
      });
      expect(listFieldValues(db, { entity: "COMPANY", recordId: company.id }).map((value) => value.fieldId)).toEqual([
        text.id,
        number.id,
        date.id,
        checkbox.id,
        select.id,
        user.id,
      ]);
      expect(getFieldCoverage(db, text.id)).toEqual({ filled: 1, total: 1 });

      const changed = updateFieldValue(db, {
        id: "value_text",
        entity: "COMPANY",
        recordId: company.id,
        fieldId: text.id,
        value: false,
      });
      expect(changed.value).toBe("false");
      expect(store.upsertValue({ entity: "COMPANY", recordId: company.id, fieldId: text.id, value: null })).toMatchObject({
        id: "value_text",
        value: null,
      });
      expect(store.listValues("COMPANY", company.id).some((value) => value.fieldId === text.id)).toBe(false);
      const valueToDelete = store.upsertValue({ entity: "COMPANY", recordId: company.id, fieldId: text.id, value: "delete me" });
      expect(deleteFieldValue(db, {
        id: valueToDelete.id,
        entity: "COMPANY",
        recordId: company.id,
        fieldId: text.id,
      })).toEqual({ id: valueToDelete.id });
      expect(store.listValues("COMPANY", company.id).some((value) => value.id === valueToDelete.id)).toBe(false);
      expect(() => store.upsertValue({ entity: "CONTACT", recordId: contact.id, fieldId: text.id, value: "wrong entity" })).toThrow(
        "belongs to COMPANY",
      );
      expect(() => store.upsertValue({ entity: "COMPANY", recordId: contact.id, fieldId: text.id, value: "wrong record" })).toThrow(
        "No company",
      );
      expect(() => store.upsertValue({ entity: "COMPANY", recordId: company.id, fieldId: select.id, value: "Unknown" })).toThrow(
        FieldValueError,
      );
      expect(() => store.upsertValue({ entity: "COMPANY", recordId: company.id, fieldId: number.id, value: "not a number" })).toThrow(
        FieldValueError,
      );
      expect(() => store.upsertValue({ entity: "COMPANY", recordId: company.id, fieldId: checkbox.id, value: "maybe" })).toThrow(
        FieldValueError,
      );
      expect(() => store.upsertValue({ entity: "COMPANY", recordId: company.id, fieldId: date.id, value: "whenever" })).toThrow(
        FieldValueError,
      );
      expect(() => store.upsertValue({ entity: "COMPANY", recordId: company.id, fieldId: text.id, value: Number.NaN })).toThrow(
        "finite",
      );
      expect(() => store.update(select.id, { type: "TEXT" })).toThrow(FieldConflictError);
      expect(() => store.deleteValue({
        id: "value_text",
        entity: "COMPANY",
        recordId: company.id,
        fieldId: text.id,
        value: "unexpected",
      } as never)).toThrow("unknown key");
      expect(() => store.listValues({ entity: "DEAL", recordId: deal.id })).not.toThrow();
      expect(() => store.listValues({ entity: "CONTACT", recordId: "missing_contact" })).toThrow("No contact");
    } finally {
      await lifecycle.dispose();
    }
  });

  it("archives values with definitions and cascades option/field deletion", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const company = createCompany(db, { id: "cmp_cascade", name: "Cascade Co" });
      const store = new CustomFieldStore(db);
      const field = store.create({
        id: "field_cascade",
        entity: "COMPANY",
        label: "Lifecycle",
        type: "SELECT",
        options: [{ id: "option_cascade", label: "Active" }],
      });
      store.upsertValue({ id: "value_cascade", entity: "COMPANY", recordId: company.id, fieldId: field.id, value: "option_cascade" });
      store.archive(field.id);
      expect(store.listValues({ entity: "COMPANY", recordId: company.id })).toEqual([]);
      expect(store.listValues({ entity: "COMPANY", recordId: company.id, includeArchived: true })).toHaveLength(1);
      store.restore(field.id);
      expect(store.listValues({ entity: "COMPANY", recordId: company.id })).toHaveLength(1);

      deleteFieldDefinition(db, field.id);
      expect(getFieldDefinition(db, field.id)).toBeNull();
      expect(() => listFieldOptions(db, field.id)).toThrow("No field");
      expect(db.prepare("SELECT COUNT(*) AS count FROM field_values WHERE id = 'value_cascade'").pluck().get()).toBe(0);
      expect(db.prepare("SELECT COUNT(*) AS count FROM field_options WHERE id = 'option_cascade'").pluck().get()).toBe(0);
    } finally {
      await lifecycle.dispose();
    }
  });

  it("returns only active records missing a typed value within the backfill cap", async () => {
    const { db, lifecycle } = withDatabase();
    try {
      const first = createCompany(db, { id: "cmp_missing_first", name: "First" });
      const filled = createCompany(db, { id: "cmp_missing_filled", name: "Filled" });
      const archived = createCompany(db, { id: "cmp_missing_archived", name: "Archived" });
      const store = new CustomFieldStore(db);
      const text = store.create({ id: "field_missing_text", entity: "COMPANY", label: "Research note", type: "TEXT" });
      store.upsertValue({ entity: "COMPANY", recordId: filled.id, fieldId: text.id, value: "confirmed" });
      store.archive(text.id);
      expect(() => store.missingRecordIds(text.id)).toThrow("No field");

      const activeText = store.restore(text.id);
      archiveCompany(db, archived.id);
      expect(store.missingRecordIds(activeText.id)).toEqual([first.id]);
      expect(() => store.missingRecordIds(activeText.id, 0)).toThrow("from 1 to");
      expect(() => store.missingRecordIds(activeText.id, CUSTOM_FIELD_BACKFILL_MAX_RECORDS + 1)).toThrow(
        `from 1 to ${CUSTOM_FIELD_BACKFILL_MAX_RECORDS}`,
      );
      for (let index = 0; index < CUSTOM_FIELD_BACKFILL_MAX_RECORDS; index += 1) {
        const suffix = String(index).padStart(3, "0");
        createCompany(db, { id: `cmp_missing_batch_${suffix}`, name: `Batch ${suffix}` });
      }
      expect(store.missingRecordIds(activeText.id)).toHaveLength(CUSTOM_FIELD_BACKFILL_MAX_RECORDS);
    } finally {
      await lifecycle.dispose();
    }
  });
});
