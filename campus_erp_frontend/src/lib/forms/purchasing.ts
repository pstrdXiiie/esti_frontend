import type { EntrySpec } from "@/lib/forms/types"

/**
 * Finance Purchasing module specs (blueprint Phase 2). Procurement
 * deliberately reuses ERPNext's own Material Request (as the legacy's
 * "Purchase Requisition") and Purchase Order doctypes rather than
 * duplicating them — see campus_erp/setup/custom_fields_finance.py for the
 * handful of Custom Fields (requested_by, pr_purpose, justification, branch,
 * total_amount, approval_status, recommending_approval, approved_by,
 * approval_date, approval_remarks on Material Request; supplier on Material
 * Request Item; branch, settlement_reference, payables_settled on Purchase
 * Order) that carry the legacy-specific data those native doctypes were
 * missing. The approval_status/recommending_approval/approved_by/
 * approval_date/approval_remarks quintet backs the Purchase Requisition
 * Approval flow (campus_erp.api.finance_purchasing.approve_purchase_requisition)
 * and is deliberately left off requisitionSpec.fields below — it's driven
 * directly by that whitelisted call from the bespoke Purchase Requisition
 * screen (src/components/ui/finance/transactions/purchase-requisition/),
 * not edited as a flat field on this spec's other consumers
 * (finance/requisitions, the Maintenance tab). Field lists were
 * checked against the real installed DocTypes:
 *   apps/erpnext/erpnext/stock/doctype/material_request/material_request.json
 *   apps/erpnext/erpnext/stock/doctype/material_request_item/material_request_item.json
 *   apps/erpnext/erpnext/buying/doctype/purchase_order/purchase_order.json
 * `naming_series` / `amended_from` are left out the same way registrar's and
 * finance_billing's specs do: the series has a single fixed default and the
 * amended-from link only matters after a cancel/amend.
 */

export const requisitionSpec: EntrySpec = {
  doctype: "Material Request",
  title: "Purchase Requisitions",
  submittable: true,
  fields: [
    { fieldname: "transaction_date", label: "Date", fieldtype: "Date", required: true, inListView: true },
    // Native schedule_date is optional at the header level, but Material
    // Request's own validate_schedule_date() only back-fills each item
    // row's (required) schedule_date from this header value when it's set —
    // and this form's Material Request Item columns don't expose a
    // per-row schedule_date — so it's promoted to required here to avoid a
    // "Row #1: Required By is mandatory" surprise on save.
    { fieldname: "schedule_date", label: "Required By", fieldtype: "Date", required: true },
    // Material Request is a general-purpose ERPNext doctype (Purpose:
    // Purchase / Material Transfer / Material Issue / Manufacture /
    // Customer Provided) with no default for that field; this screen only
    // ever creates Purchase Requisitions, so the option list is pinned to
    // the one valid choice rather than leaving it to chance.
    { fieldname: "material_request_type", label: "Purpose", fieldtype: "Select", options: "Purchase", required: true },
    { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", required: true },
    { fieldname: "requested_by", label: "Requested By", fieldtype: "Link", options: "Employee", inListView: true },
    { fieldname: "pr_purpose", label: "Purpose / Remarks", fieldtype: "Small Text" },
    { fieldname: "justification", label: "Justification", fieldtype: "Small Text" },
    { fieldname: "branch", label: "Branch", fieldtype: "Link", options: "Branch", inListView: true },
    { fieldname: "total_amount", label: "Total Amount", fieldtype: "Currency", readOnly: true, inListView: true },
    // Status is system-managed (Material Request.validate() defaults it to
    // "Draft" and later transitions advance it) rather than hand-edited.
    {
      fieldname: "status",
      label: "Status",
      fieldtype: "Select",
      options:
        "Draft\nSubmitted\nStopped\nCancelled\nPending\nPartially Ordered\nPartially Received\nOrdered\nIssued\nTransferred\nReceived",
      readOnly: true,
      inListView: true,
    },
  ],
  childTable: {
    fieldname: "items",
    doctype: "Material Request Item",
    columns: [
      { fieldname: "item_code", label: "Item Code", fieldtype: "Link", options: "Item", required: true },
      { fieldname: "qty", label: "Qty", fieldtype: "Float", required: true },
      { fieldname: "rate", label: "Rate", fieldtype: "Currency" },
      // Custom field — required by create_purchase_orders_from_requisition
      // (every line needs a Supplier before Purchase Orders can be split
      // out), even though it isn't reqd at the DocType level.
      { fieldname: "supplier", label: "Supplier", fieldtype: "Link", options: "Supplier", required: true },
    ],
  },
}

export const purchaseOrderSpec: EntrySpec = {
  doctype: "Purchase Order",
  title: "Purchase Orders",
  submittable: true,
  fields: [
    { fieldname: "transaction_date", label: "Date", fieldtype: "Date", required: true, inListView: true },
    { fieldname: "supplier", label: "Supplier", fieldtype: "Link", options: "Supplier", required: true, inListView: true },
    { fieldname: "branch", label: "Branch", fieldtype: "Link", options: "Branch", inListView: true },
    { fieldname: "grand_total", label: "Grand Total", fieldtype: "Currency", readOnly: true, inListView: true },
    { fieldname: "settlement_reference", label: "Settlement Voucher", fieldtype: "Link", options: "Journal Entry", readOnly: true },
    { fieldname: "payables_settled", label: "Payables Settled", fieldtype: "Check" },
    {
      fieldname: "status",
      label: "Status",
      fieldtype: "Select",
      options: "Draft\nOn Hold\nTo Receive and Bill\nTo Bill\nTo Receive\nCompleted\nCancelled\nClosed\nDelivered",
      readOnly: true,
      inListView: true,
    },
  ],
  // Item lines (Purchase Order Item) are intentionally not exposed on this
  // reduced-field Maintenance spec, which still only supports generating a
  // PO via campus_erp.api.finance_purchasing.
  // create_purchase_orders_from_requisition (the Requisition detail page's
  // "Create Purchase Order(s)" button). Direct, from-scratch PO creation
  // with an item grid lives on its own bespoke screen instead — see
  // src/components/ui/finance/transactions/purchase-order/ — which calls
  // the sibling create_purchase_order / update_purchase_order RPCs that
  // resolve company/currency/conversion_rate server-side.
}

export const canteenPcvSpec: EntrySpec = {
  doctype: "SMS Canteen PCV",
  title: "Canteen PCVs",
  submittable: true,
  fields: [
    { fieldname: "ref_date", label: "Reference Date", fieldtype: "Date", required: true, inListView: true },
    { fieldname: "payee", label: "Payee", fieldtype: "Data", required: true, inListView: true },
    { fieldname: "amount", label: "Amount", fieldtype: "Currency", readOnly: true, inListView: true },
    { fieldname: "description", label: "Description", fieldtype: "Small Text" },
    { fieldname: "branch", label: "Branch", fieldtype: "Link", options: "Branch", inListView: true },
    { fieldname: "encoder", label: "Encoder", fieldtype: "Link", options: "User", readOnly: true },
    { fieldname: "replenished", label: "Replenished", fieldtype: "Check", readOnly: true, inListView: true },
    {
      fieldname: "replenishment_reference",
      label: "Replenishment Reference",
      fieldtype: "Link",
      options: "Journal Entry",
      readOnly: true,
    },
  ],
  childTable: {
    fieldname: "details",
    doctype: "SMS Canteen PCV Detail",
    columns: [
      { fieldname: "account", label: "Account", fieldtype: "Link", options: "Account", required: true },
      { fieldname: "debit_amount", label: "Debit Amount", fieldtype: "Currency", required: true },
      { fieldname: "branch", label: "Branch", fieldtype: "Link", options: "Branch" },
    ],
  },
}
