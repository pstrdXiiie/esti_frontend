import type { ChildTableSpec } from "@/lib/forms/types"

export type PurchaseOrderStatus =
  | "Draft"
  | "On Hold"
  | "To Receive and Bill"
  | "To Bill"
  | "To Receive"
  | "Completed"
  | "Cancelled"
  | "Closed"
  | "Delivered"

export interface PurchaseOrderRow {
  name: string
  transaction_date: string
  schedule_date: string | null
  supplier: string
  supplier_name: string | null
  branch: string | null
  grand_total: number
  status: PurchaseOrderStatus
  docstatus: number
}

export interface PurchaseOrderItemRow {
  item_code: string
  qty: number
  rate: number
}

export interface PurchaseOrderDetail extends PurchaseOrderRow {
  company?: string
  items: PurchaseOrderItemRow[]
}

export const PURCHASE_ORDER_LIST_QUERY_KEY = ["Purchase Order", "list", "purchase-order"]

export const PAGE_SIZE = 5

export const itemsChildTable: ChildTableSpec = {
  fieldname: "items",
  doctype: "Purchase Order Item",
  columns: [
    {
      fieldname: "item_code",
      label: "Item",
      fieldtype: "Link",
      options: "Item",
      required: true,
      searchable: true,
      searchFields: ["item_code", "item_name"],
    },
    { fieldname: "qty", label: "Qty", fieldtype: "Float", required: true },
    { fieldname: "rate", label: "Unit Cost", fieldtype: "Currency" },
  ],
}

export function formatCurrency(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function statusBadgeVariant(status: PurchaseOrderStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Completed" || status === "Delivered") return "default"
  if (status === "Cancelled" || status === "Closed") return "destructive"
  if (status === "Draft") return "secondary"
  return "outline"
}
