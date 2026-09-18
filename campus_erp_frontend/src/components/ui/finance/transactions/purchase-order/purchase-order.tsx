"use client"

import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { BanIcon, MoreVerticalIcon, PencilIcon, Search, Trash2Icon } from "lucide-react"

import { frappe, getErrorMessage } from "@/lib/frappe"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChildTableGrid } from "@/components/sms/ChildTableGrid"
import { FinanceRecordTable, type FinanceRecordColumn } from "@/components/sms/FinanceRecordTable"
import {
  PAGE_SIZE,
  PURCHASE_ORDER_LIST_QUERY_KEY,
  formatCurrency,
  itemsChildTable,
  statusBadgeVariant,
  type PurchaseOrderDetail,
  type PurchaseOrderRow,
} from "./shared"

// A function, not a module-level constant -- `new Date()` needs to run fresh
// every time the form resets, matching the same convention used by the
// Purchase Requisition form this screen mirrors.
function getEmptyForm() {
  return {
    transaction_date: new Date().toISOString().slice(0, 10),
    schedule_date: "",
    company: "",
    supplier: "",
    branch: "",
  }
}

/**
 * Purchase Order (Finance > Transactions): a direct-create form -- header
 * fields + an item grid -- above a searchable, paginated table of existing
 * Purchase Orders, following the same flush-to-page layout as Sundry
 * Accounts and Purchase Requisition. "Add New" and a successful Save both
 * clear the form back to empty; Edit only applies to still-Draft orders,
 * since a submitted Purchase Order's items are no longer freely editable.
 * Creation and update both go through whitelisted RPCs (campus_erp.api.
 * finance_purchasing.create_purchase_order / update_purchase_order) rather
 * than the plain REST resource endpoint, since currency/conversion_rate
 * defaulting is business logic that belongs server-side, not duplicated
 * here.
 */
export function PurchaseOrder() {
  const queryClient = useQueryClient()
  const formRef = useRef<HTMLDivElement>(null)

  const [editingName, setEditingName] = useState<string | null>(null)
  const [form, setForm] = useState(getEmptyForm)
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])

  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [deletingRow, setDeletingRow] = useState<PurchaseOrderRow | null>(null)

  const companiesQuery = useQuery({
    queryKey: ["Company", "list", "purchase-order-form"],
    queryFn: () =>
      // Excludes ERPNext's own "_Test Company..." fixtures -- without this
      // filter they sort ahead of the real company in the default list
      // order, so the auto-default below would silently pick a test company.
      frappe.list<{ name: string }>("Company", {
        fields: ["name"],
        filters: [["name", "not like", "_Test%"]],
        limit_page_length: 20,
      }),
  })
  const suppliersQuery = useQuery({
    queryKey: ["Supplier", "list", "purchase-order-form"],
    queryFn: () =>
      frappe.list<{ name: string; supplier_name: string }>("Supplier", {
        fields: ["name", "supplier_name"],
        limit_page_length: 200,
      }),
  })
  const branchesQuery = useQuery({
    queryKey: ["Branch", "list", "purchase-order-form"],
    queryFn: () => frappe.list<{ name: string }>("Branch", { fields: ["name"], limit_page_length: 100 }),
  })

  const selectedCompany = form.company || companiesQuery.data?.[0]?.name || ""

  const listQuery = useQuery({
    queryKey: PURCHASE_ORDER_LIST_QUERY_KEY,
    queryFn: () =>
      frappe.list<PurchaseOrderRow>("Purchase Order", {
        fields: [
          "name",
          "transaction_date",
          "schedule_date",
          "supplier",
          "supplier_name",
          "branch",
          "grand_total",
          "status",
          "docstatus",
        ],
        order_by: "creation desc",
        limit_page_length: 200,
      }),
  })

  const rows = listQuery.data ?? []
  const filteredRows = rows.filter((r) => {
    if (!search.trim()) return true
    const needle = search.trim().toLowerCase()
    return (
      r.name.toLowerCase().includes(needle) ||
      (r.supplier_name ?? "").toLowerCase().includes(needle) ||
      (r.supplier ?? "").toLowerCase().includes(needle) ||
      (r.transaction_date ?? "").toLowerCase().includes(needle) ||
      (r.status ?? "").toLowerCase().includes(needle)
    )
  })

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function resetForm() {
    setEditingName(null)
    setForm({ ...getEmptyForm(), company: companiesQuery.data?.[0]?.name ?? "" })
    setItems([])
  }

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function handleAddNew() {
    resetForm()
    scrollToForm()
  }

  const computedTotal = items.reduce((sum, row) => sum + Number(row.qty ?? 0) * Number(row.rate ?? 0), 0)

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        supplier: form.supplier,
        transaction_date: form.transaction_date,
        schedule_date: form.schedule_date,
        branch: form.branch || undefined,
        items: items.map((row) => ({
          item_code: row.item_code,
          qty: Number(row.qty ?? 0),
          rate: Number(row.rate ?? 0),
        })),
      }
      return editingName
        ? frappe.call("campus_erp.api.finance_purchasing.update_purchase_order", {
            purchase_order: editingName,
            ...payload,
          })
        : frappe.call("campus_erp.api.finance_purchasing.create_purchase_order", {
            company: selectedCompany,
            ...payload,
          })
    },
    onSuccess: () => {
      toast.success(editingName ? "Purchase order updated" : "Purchase order saved")
      queryClient.invalidateQueries({ queryKey: PURCHASE_ORDER_LIST_QUERY_KEY })
      resetForm()
    },
    onError: (error) => toast.error(`Could not save purchase order: ${getErrorMessage(error)}`),
  })

  async function loadForEdit(row: PurchaseOrderRow) {
    setEditingName(row.name)
    setForm({
      transaction_date: row.transaction_date,
      schedule_date: row.schedule_date ?? "",
      company: form.company,
      supplier: row.supplier,
      branch: row.branch ?? "",
    })
    scrollToForm()
    try {
      const detail = await frappe.getDoc<PurchaseOrderDetail>("Purchase Order", row.name)
      setItems(
        (detail.items ?? []).map((item) => ({
          item_code: item.item_code,
          qty: item.qty,
          rate: item.rate,
        }))
      )
      setForm((f) => ({ ...f, company: detail.company ?? f.company }))
    } catch {
      // best-effort -- form still opens with header fields even if the item fetch fails
    }
  }

  const canSave =
    !!form.supplier &&
    !!form.transaction_date &&
    !!form.schedule_date &&
    (!!editingName || !!selectedCompany) &&
    items.length > 0 &&
    !saveMutation.isPending

  const deleteMutation = useMutation({
    mutationFn: async (row: PurchaseOrderRow) => {
      if (row.docstatus === 1) {
        await frappe.updateDoc("Purchase Order", row.name, { docstatus: 2 })
      } else {
        await frappe.deleteDoc("Purchase Order", row.name)
      }
    },
    onSuccess: (_result, row) => {
      toast.success(row.docstatus === 1 ? "Purchase order cancelled" : "Purchase order deleted")
      queryClient.invalidateQueries({ queryKey: PURCHASE_ORDER_LIST_QUERY_KEY })
      if (editingName === row.name) resetForm()
      setDeletingRow(null)
    },
    onError: (error) => toast.error(`Could not remove purchase order: ${getErrorMessage(error)}`),
  })

  const columns: FinanceRecordColumn<PurchaseOrderRow>[] = [
    { key: "name", label: "PO Number", render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    { key: "transaction_date", label: "Date Created", render: (r) => r.transaction_date },
    { key: "supplier", label: "Supplier", render: (r) => r.supplier_name || r.supplier },
    { key: "grand_total", label: "Total Amount", align: "right", render: (r) => `₱${formatCurrency(r.grand_total)}` },
    {
      key: "status",
      label: "Status",
      render: (r) => <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>,
    },
    {
      key: "actions",
      label: "Actions",
      render: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`More actions for ${r.name}`}
                onClick={(e) => e.stopPropagation()}
              />
            }
          >
            <MoreVerticalIcon className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
            {r.docstatus === 0 && (
              <DropdownMenuItem onClick={() => loadForEdit(r)}>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => setDeletingRow(r)}>
              {r.docstatus === 1 ? <BanIcon /> : <Trash2Icon />}
              {r.docstatus === 1 ? "Cancel" : "Delete"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="grid gap-6">
      <div ref={formRef} className="grid gap-4 scroll-mt-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {editingName ? `Edit Purchase Order — ${editingName}` : "New Purchase Order"}
          </h1>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Date</label>
            <Input
              type="date"
              value={form.transaction_date}
              onChange={(e) => setForm((f) => ({ ...f, transaction_date: e.target.value }))}
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Required By</label>
            <Input
              type="date"
              value={form.schedule_date}
              onChange={(e) => setForm((f) => ({ ...f, schedule_date: e.target.value }))}
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Company</label>
            <Select
              value={selectedCompany}
              onValueChange={(v) => setForm((f) => ({ ...f, company: v ?? "" }))}
              disabled={!!editingName}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select company…" />
              </SelectTrigger>
              <SelectContent>
                {(companiesQuery.data ?? []).map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Supplier</label>
            <Select value={form.supplier} onValueChange={(v) => setForm((f) => ({ ...f, supplier: v ?? "" }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select supplier…" />
              </SelectTrigger>
              <SelectContent>
                {(suppliersQuery.data ?? []).map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.supplier_name || s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs text-muted-foreground">Branch</label>
            <Select value={form.branch} onValueChange={(v) => setForm((f) => ({ ...f, branch: v ?? "" }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select branch…" />
              </SelectTrigger>
              <SelectContent>
                {(branchesQuery.data ?? []).map((b) => (
                  <SelectItem key={b.name} value={b.name}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2 max-w-4xl">
          <label className="text-xs text-muted-foreground">Items</label>
          <ChildTableGrid spec={itemsChildTable} rows={items} onChange={setItems} />
          <div className="text-right text-sm font-medium">Total: ₱{formatCurrency(computedTotal)}</div>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={handleAddNew} disabled={saveMutation.isPending}>
            Add New
          </Button>
          <Button type="button" disabled={!canSave} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? "Saving…" : editingName ? "Update Purchase Order" : "Save Purchase Order"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">Purchase Orders</h2>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by PO number, supplier, date, or status…"
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      <FinanceRecordTable
        columns={columns}
        rows={pageRows}
        rowKey={(r) => r.name}
        isLoading={listQuery.isLoading}
        emptyMessage={search.trim() ? "No matching records." : "No purchase orders yet."}
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing page {currentPage} of {totalPages} ({filteredRows.length} total)
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <AlertDialog open={!!deletingRow} onOpenChange={(open) => !open && setDeletingRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingRow?.docstatus === 1 ? "Cancel" : "Delete"} Purchase Order {deletingRow?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletingRow?.docstatus === 1
                ? "This Purchase Order has already been submitted — this will cancel it instead of deleting it. This action cannot be undone."
                : "This will permanently remove this Purchase Order. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => deletingRow && deleteMutation.mutate(deletingRow)}
            >
              {deleteMutation.isPending
                ? "Working…"
                : deletingRow?.docstatus === 1
                  ? "Cancel Order"
                  : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default PurchaseOrder
