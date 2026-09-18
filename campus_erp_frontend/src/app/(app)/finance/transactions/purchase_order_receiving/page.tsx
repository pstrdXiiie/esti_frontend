"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Upload } from "lucide-react"

import { frappe } from "@/lib/frappe"
import {
  PurchaseOrderReceivingItemGrid,
  type ReceivingItemRow,
} from "@/components/sms/PurchaseOrderReceivingItemGrid"
import { financeRowInput, financePrimaryButton } from "@/lib/finance-ui"
import { FinancePropertySection } from "@/components/finance/FinancePropertyPanel"
import { FinanceRecordTable, type FinanceRecordColumn } from "@/components/sms/FinanceRecordTable"

// Built from a screenshot of "Purchase Order Receiving," not a FormSpec —
// doctype/field names below are best-guess. The banner text says this
// module updates Items Onhand Quantity from what's received, and that
// "Once Posted to GL PO can never be canceled anymore" — modeled as a
// one-way Draft -> Confirmed -> Posted status below; confirm the real
// workflow states/names against the backend.

type ReceivingStatus = "Draft" | "Confirmed" | "Posted" | "Cancelled"

interface PurchaseOrderSummary {
  name: string
  po_date: string
  supplier_code: string
  supplier_name: string
  po_total: number
  po_terms: string
  po_tax: number
  status: ReceivingStatus
}

interface PurchaseOrderItemSource {
  item_code: string
  item_description: string
  qty: number
  rate: number
  qty_received: number // running total already received against this PO, guessed field name
}

const poMatchColumns: FinanceRecordColumn<PurchaseOrderSummary>[] = [
  { key: "name", label: "PO #", render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
  { key: "supplier_name", label: "Supplier", render: (r) => <span className="text-muted-foreground">{r.supplier_name}</span> },
  { key: "po_total", label: "Total", align: "right", render: (r) => `₱${Number(r.po_total).toFixed(2)}` },
]

const today = () => new Date().toISOString().slice(0, 10)

export default function PurchaseOrderReceivingPage() {
  const [poSearch, setPoSearch] = useState("")
  const [selected, setSelected] = useState<PurchaseOrderSummary | null>(null)
  const [deliveryDate, setDeliveryDate] = useState(today())
  const [siNumber, setSiNumber] = useState("")
  const [items, setItems] = useState<ReceivingItemRow[]>([])

  const [deliveryReceiptFile, setDeliveryReceiptFile] = useState<File | null>(null)
  const [officialReceiptFile, setOfficialReceiptFile] = useState<File | null>(null)

  // Only POs not yet fully cancelled/posted should be receivable — guessed
  // filter, confirm the real "open for receiving" condition on your side.
  const { data: matches = [] } = useQuery({
    queryKey: ["SMS Purchase Order", "receivable-search", poSearch],
    queryFn: () =>
      frappe.list<PurchaseOrderSummary>("SMS Purchase Order", {
        fields: ["name", "po_date", "supplier_code", "supplier_name", "po_total", "po_terms", "po_tax", "status"],
        filters: {
          status: ["!=", "Posted"],
          ...(poSearch ? { name: ["like", `%${poSearch}%`] } : {}),
        },
        limit_page_length: 20,
      }),
    enabled: poSearch.length > 0,
  })

  const { data: sourceItems = [] } = useQuery({
    queryKey: ["SMS Purchase Order Item", "list", selected?.name],
    queryFn: () =>
      frappe.list<PurchaseOrderItemSource>("SMS Purchase Order Item", {
        fields: ["item_code", "item_description", "qty", "rate", "qty_received"],
        filters: { parent: selected?.name },
        limit_page_length: 200,
      }),
    enabled: !!selected,
  })

  const sourceRows: ReceivingItemRow[] = sourceItems.map((i) => ({
    item_code: i.item_code,
    item_description: i.item_description,
    qty_ordered: i.qty,
    qty_previously_received: i.qty_received,
    qty_received: 0,
    rate: i.rate,
  }))
  const receivingItems = items.length > 0 ? items : sourceRows

  const isFullyReceived =
    receivingItems.length > 0 && receivingItems.every((r) => r.qty_previously_received + r.qty_received >= r.qty_ordered)
  const hasAnyReceiving = receivingItems.some((r) => r.qty_received > 0)
  const isPosted = selected?.status === "Posted"
  const isCancelled = selected?.status === "Cancelled"

  const canAct = selected !== null && !isPosted && !isCancelled

  function handleSelect(po: PurchaseOrderSummary) {
    setSelected(po)
    setSiNumber("")
    setItems([])
  }

  function buildPayload(nextStatus: ReceivingStatus) {
    if (!selected) return null
    return {
      purchase_order: selected.name,
      delivery_date: deliveryDate,
      si_number: siNumber,
      items: receivingItems.map((r) => ({
        item_code: r.item_code,
        qty_received: r.qty_received,
      })),
      status: nextStatus,
    }
  }

  function handleConfirm() {
    const payload = buildPayload("Confirmed")
    if (!payload) return
    // TODO: wire up to real persistence — marks the receipt confirmed but
    // not yet posted to GL / onhand quantity.
    console.log(payload)
  }

  function handlePost() {
    if (!hasAnyReceiving) return
    const payload = buildPayload("Posted")
    if (!payload) return
    // TODO: wire up to real persistence. Per the banner text, this is the
    // point that should update Items Onhand Quantity and, per the warning
    // text, become irreversible — no "Cancel" after this.
    console.log(payload)
  }

  function handleCancel() {
    if (isPosted) return // guarded client-side per the "can never be
    // canceled" warning; the real enforcement should live server-side too.
    const payload = buildPayload("Cancelled")
    if (!payload) return
    // TODO: wire up to real persistence
    console.log(payload)
  }

  function handlePrint() {
    window.print()
  }

  // TODO: wire up to the real file upload endpoint (e.g. frappe's
  // /api/method/upload_file). Field names "delivery_receipt_attachment" /
  // "official_receipt_attachment" are guessed.
  function handleUpload(kind: "delivery" | "official") {
    const file = kind === "delivery" ? deliveryReceiptFile : officialReceiptFile
    if (!file || !selected) return
    console.log("upload", kind, selected.name, file.name)
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Purchase Order Receiving</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update items on-hand quantity based on items received from the Purchase Order. Once posted to GL, a PO
          receipt can never be cancelled.
        </p>
      </div>

      <FinancePropertySection title="PO Lookup">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            PO #
            <input
              className={`rounded border border-border ${financeRowInput}`}
              type="text"
              value={poSearch}
              onChange={(e) => setPoSearch(e.target.value)}
              placeholder="Search PO number…"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            PO Date
            <input
              className={`rounded border border-border bg-muted text-muted-foreground ${financeRowInput}`}
              type="text"
              value={selected?.po_date ?? "—"}
              readOnly
            />
          </label>
        </div>

        {poSearch && matches.length > 0 && !selected && (
          <div className="mt-2 rounded border border-border">
            <FinanceRecordTable
              columns={poMatchColumns}
              rows={matches}
              rowKey={(r) => r.name}
              onSelectRow={handleSelect}
            />
          </div>
        )}
      </FinancePropertySection>

      <FinancePropertySection title="Supplier & Totals">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Supplier Code
            <input
              className={`rounded border border-border bg-muted text-muted-foreground ${financeRowInput}`}
              type="text"
              value={selected?.supplier_code ?? "—"}
              readOnly
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
            Supplier
            <input
              className={`rounded border border-border bg-muted text-muted-foreground ${financeRowInput}`}
              type="text"
              value={selected?.supplier_name ?? "—"}
              readOnly
            />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            PO Totals
            <input
              className={`rounded border border-border bg-muted text-right text-muted-foreground ${financeRowInput}`}
              type="text"
              value={selected ? `₱${Number(selected.po_total).toFixed(2)}` : "—"}
              readOnly
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Terms
            <input
              className={`rounded border border-border bg-muted text-muted-foreground ${financeRowInput}`}
              type="text"
              value={selected?.po_terms ?? "—"}
              readOnly
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Tax
            <input
              className={`rounded border border-border bg-muted text-right text-muted-foreground ${financeRowInput}`}
              type="text"
              value={selected ? Number(selected.po_tax).toFixed(2) : "—"}
              readOnly
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Delivery Date
            <input
              className={`rounded border border-border ${financeRowInput}`}
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              disabled={!canAct}
            />
          </label>
        </div>
        <div className="mt-3">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground sm:w-1/3">
            S.I. Number
            <input
              className={`rounded border border-border ${financeRowInput}`}
              type="text"
              value={siNumber}
              onChange={(e) => setSiNumber(e.target.value)}
              placeholder="Supplier invoice #"
              disabled={!canAct}
            />
          </label>
        </div>
      </FinancePropertySection>

      <PurchaseOrderReceivingItemGrid rows={receivingItems} onChange={setItems} disabled={!canAct} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={financePrimaryButton}
          onClick={handleConfirm}
          disabled={!canAct || receivingItems.length === 0}
        >
          Confirmed P.O.
        </button>
        <button
          type="button"
          className={financePrimaryButton}
          onClick={handlePost}
          disabled={!canAct || !hasAnyReceiving}
        >
          Post P.O.
        </button>
        <button
          type="button"
          className="rounded border border-border px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-40"
          onClick={handleCancel}
          disabled={!canAct}
        >
          Cancel P.O.
        </button>
        <button
          type="button"
          className="rounded border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          onClick={handlePrint}
          disabled={!selected}
        >
          Print P.O.
        </button>
        <button
          type="button"
          className="ml-auto rounded border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          onClick={() => history.back()}
        >
          Exit
        </button>
      </div>

      {isPosted && (
        <p className="text-xs text-destructive">This PO has already been posted to GL and can no longer be edited or cancelled.</p>
      )}
      {isFullyReceived && !isPosted && (
        <p className="text-xs text-primary">All items on this PO have been fully received.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FinancePropertySection title="Upload the Scanned Delivery Receipt">
          <div className="flex items-center gap-2">
            <input
              type="file"
              onChange={(e) => setDeliveryReceiptFile(e.target.files?.[0] ?? null)}
              disabled={!canAct}
              className="flex-1 text-xs text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => handleUpload("delivery")}
              disabled={!canAct || !deliveryReceiptFile}
              className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </button>
          </div>
        </FinancePropertySection>
        <FinancePropertySection title="Upload the Scanned Official Receipt">
          <div className="flex items-center gap-2">
            <input
              type="file"
              onChange={(e) => setOfficialReceiptFile(e.target.files?.[0] ?? null)}
              disabled={!canAct}
              className="flex-1 text-xs text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => handleUpload("official")}
              disabled={!canAct || !officialReceiptFile}
              className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </button>
          </div>
        </FinancePropertySection>
      </div>
    </div>
  )
}
