"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { MoreVerticalIcon, PencilIcon, PrinterIcon, Search } from "lucide-react"

import { frappe, getErrorMessage } from "@/lib/frappe"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FinanceRecordTable, type FinanceRecordColumn } from "@/components/sms/FinanceRecordTable"

interface SundryAccountRow {
  name: string
  payee: string
  payment: string | null
  or_num: string | null
  date: string
  amount: number
}

const PAGE_SIZE = 5

const emptyForm = { payee: "", payment: "", or_num: "", date: "", amount: "" }

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function formatCurrency(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Sundry Accounts (Finance > Transactions): a form for one-off payee
 * transactions (a payee that isn't a Student, e.g. a supplier refund or
 * incidental payment) above a searchable, paginated table of recent entries.
 * No border/card shell around the form itself, per the request this screen
 * was rebuilt for — it sits flush in whatever tab/page hosts it.
 *
 * Row click also opens the same record in a Dialog (Registrar/Student's
 * MasterDetailScreen pattern) as an additional entry point alongside the
 * inline form/dropdown-Edit path, which is left unchanged. Both share the
 * same `form`/`editingName` state and the same saveMutation, so editing via
 * either one stays in sync. Action buttons inside each row (the ⋮ dropdown's
 * Edit/Print) already stop propagation, so they don't also open the dialog.
 */
export function SundryAccount() {
  const queryClient = useQueryClient()
  const [editingName, setEditingName] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [printing, setPrinting] = useState<SundryAccountRow | null>(null)

  const listQuery = useQuery({
    queryKey: ["SMS Sundry Account", "list"],
    queryFn: () =>
      frappe.list<SundryAccountRow>("SMS Sundry Account", {
        fields: ["name", "payee", "payment", "or_num", "date", "amount"],
        order_by: "creation desc",
        limit_page_length: 200,
      }),
  })

  const rows = listQuery.data ?? []
  const filteredRows = rows.filter((r) => {
    if (!search.trim()) return true
    const needle = search.trim().toLowerCase()
    return (
      (r.payee ?? "").toLowerCase().includes(needle) ||
      (r.or_num ?? "").toLowerCase().includes(needle) ||
      (r.payment ?? "").toLowerCase().includes(needle)
    )
  })

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function resetForm() {
    setEditingName(null)
    setForm(emptyForm)
  }

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        payee: form.payee.trim(),
        payment: form.payment.trim() || undefined,
        or_num: form.or_num.trim() || undefined,
        date: form.date,
        amount: Number(form.amount),
      }
      return editingName
        ? frappe.updateDoc("SMS Sundry Account", editingName, payload)
        : frappe.createDoc("SMS Sundry Account", payload)
    },
    onSuccess: () => {
      toast.success(editingName ? "Sundry account updated" : "Sundry account saved")
      queryClient.invalidateQueries({ queryKey: ["SMS Sundry Account", "list"] })
      resetForm()
      setDialogOpen(false)
    },
    onError: (error) => toast.error(`Could not save sundry account: ${getErrorMessage(error)}`),
  })

  function loadForEdit(row: SundryAccountRow) {
    setEditingName(row.name)
    setForm({
      payee: row.payee ?? "",
      payment: row.payment ?? "",
      or_num: row.or_num ?? "",
      date: row.date ?? "",
      amount: row.amount != null ? String(row.amount) : "",
    })
  }

  // New row-click entry point: same as loadForEdit, plus opens the dialog.
  // Kept separate from loadForEdit so the dropdown's Edit item (which calls
  // loadForEdit directly) keeps its existing inline-only behavior.
  function openRowInDialog(row: SundryAccountRow) {
    loadForEdit(row)
    setDialogOpen(true)
  }

  // Same window.print()-on-visible-DOM convention used everywhere else in
  // this app (see FinanceEntryListScreen's own comment on this) -- the
  // print-only receipt below becomes the only visible content once print
  // starts, via the print:/hidden Tailwind utilities on each half of this
  // component's markup.
  useEffect(() => {
    if (!printing) return
    const timer = setTimeout(() => window.print(), 50)
    return () => clearTimeout(timer)
  }, [printing])

  useEffect(() => {
    function clearPrinting() {
      setPrinting(null)
    }
    window.addEventListener("afterprint", clearPrinting)
    return () => window.removeEventListener("afterprint", clearPrinting)
  }, [])

  const canSave = !!form.payee.trim() && !!form.date && Number(form.amount) > 0

  const columns: FinanceRecordColumn<SundryAccountRow>[] = [
    {
      key: "or_num",
      label: "OR Number",
      render: (r) => <span className="font-medium text-foreground">{r.or_num || "—"}</span>,
    },
    { key: "payee", label: "Payee", render: (r) => r.payee },
    { key: "payment", label: "Payment For", render: (r) => r.payment || "—" },
    { key: "date", label: "Transaction Date", render: (r) => r.date },
    { key: "amount", label: "Amount", align: "right", render: (r) => `₱${formatCurrency(r.amount)}` },
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
                aria-label={`More actions for ${r.payee}`}
                onClick={(e) => e.stopPropagation()}
              />
            }
          >
            <MoreVerticalIcon className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => loadForEdit(r)}>
              <PencilIcon />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPrinting(r)}>
              <PrinterIcon />
              Print
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <>
      <div className="grid gap-6 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-semibold">
            Sundry Accounts
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
          <Field label="Payee">
            <Input
              value={form.payee}
              onChange={(e) => setForm((f) => ({ ...f, payee: e.target.value }))}
              placeholder="Search or type a payee name…"
            />
          </Field>
          <Field label="Payment For">
            <Input
              value={form.payment}
              onChange={(e) => setForm((f) => ({ ...f, payment: e.target.value}))}
            />
          </Field>
          <Field label="OR Number">
            <Input
              value={form.or_num}
              onChange={(e) => setForm((f) => ({ ...f, or_num: e.target.value }))}
            />
          </Field>
          <Field label="Transaction Date">
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </Field>
          <Field label="Amount">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </Field>
        </div>

        <div>
          <Button
            type="button"
            disabled={!canSave || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by payee, OR number, or payment for…"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <FinanceRecordTable
          columns={columns}
          rows={pageRows}
          rowKey={(r) => r.name}
          onSelectRow={openRowInDialog}
          isLoading={listQuery.isLoading}
          emptyMessage={search.trim() ? "No matching records." : "No sundry account records yet."}
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
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingName ? `Edit Sundry Account — ${editingName}` : "Sundry Account"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payee">
              <Input
                value={form.payee}
                onChange={(e) => setForm((f) => ({ ...f, payee: e.target.value }))}
                placeholder="Search or type a payee name…"
              />
            </Field>
            <Field label="Payment For">
              <Input
                value={form.payment}
                onChange={(e) => setForm((f) => ({ ...f, payment: e.target.value }))}
              />
            </Field>
            <Field label="OR Number">
              <Input
                value={form.or_num}
                onChange={(e) => setForm((f) => ({ ...f, or_num: e.target.value }))}
              />
            </Field>
            <Field label="Transaction Date">
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </Field>
            <Field label="Amount">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button
              type="button"
              disabled={!canSave || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printing && (
        <div className="hidden print:block p-8 text-sm">
          <h1 className="mb-6 text-xl font-bold">Sundry Account Receipt</h1>
          <div className="grid gap-2">
            <div>
              <span className="font-semibold">OR Number:</span> {printing.or_num || "—"}
            </div>
            <div>
              <span className="font-semibold">Payee:</span> {printing.payee}
            </div>
            <div>
              <span className="font-semibold">Payment For:</span> {printing.payment || "—"}
            </div>
            <div>
              <span className="font-semibold">Transaction Date:</span> {printing.date}
            </div>
            <div>
              <span className="font-semibold">Amount:</span> ₱{formatCurrency(printing.amount)}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default SundryAccount
