---
name: crm
description: Use the CRM extension to find and maintain contacts, companies, deals, activities, evidence-backed facts, and scheduled research work.
---

# CRM

Use the CRM extension when work depends on customer, company, pipeline, or relationship context.

## Rules

- Search before creating a company, contact, or deal.
- Do not guess a person's identity or employer.
- Record the observed source for every researched fact.
- Apply strong evidence directly. Save ambiguous evidence as a proposal.
- Keep source deal amounts unchanged. Use frozen base amounts for totals.
- State why a follow-up is scheduled.
- Use `bb crm` for repeatable record operations and native CRM tools for focused reads and writes.

## Workflow

1. Search the CRM for an existing record.
2. Read the record history and related records.
3. Perform the smallest requested update.
4. Add a note or evidence source when the update depends on external information.
5. Report the record ID and the exact fields changed.

## Native tools

- `crm_search`: search all records or one record type before creating.
- `crm_get_record`: read one company, contact, or deal with relations and fields.
- `crm_create_record`: create a validated company, contact, or deal.
- `crm_update_record`: apply a narrow partial update to a known record ID.
- `crm_add_activity`: preserve notes, touchpoints, meetings, and follow-up tasks.
- `crm_list_tasks`: review incomplete installation-owned follow-up work.
- `crm_set_field`: set or clear a typed custom field by its stable key.

Use record IDs returned by search and reads. When an operation changes a
relationship or consequential business fact, add a timeline entry explaining
the source and intent.
