"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { MoreVerticalIcon, PencilIcon, PrinterIcon, Search } from "lucide-react"

import { frappe, getErrorMessage } from "@/lib/frappe"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
  REQUISITION_LIST_QUERY_KEY,
  formatCurrency,
  itemsChildTable,
  statusBadgeVariant,
  type RequisitionDetail,
  type RequisitionRow,
} from "./shared"

// A function, not a module-level constant -- `new Date()` needs to run
// fresh every time the form resets, not once when this file first loads
// (which would freeze "today" to whatever date the server process started
// on, on a long-running dev/prod server).
function getEmptyForm() {
  return {
    transaction_date: new Date().toISOString().slice(0, 10),
    schedule_date: "",
    company: "",
    requested_by: "",
    branch: "",
    pr_purpose: "",
    justification: "",
  }
}

/**
 * Purchase Requisition & Approval (Finance > Transactions): the entry form
 * and the approval table live on one page again -- "+ New Requisition"
 * resets the (always-visible) form and scrolls to it instead of navigating
 * anywhere, and Edit loads a row back into that same form. There's no
 * separate Clear/Add button in the form itself: Save is the only reset,
 * clearing the form on a successful save the same way Sundry Accounts does.
 * Approval decisions live strictly inside the Review/Approve dialog.
 */
export function PurchaseRequisitionApprovalPage() {
  const queryClient = useQueryClient()
  const formRef = useRef<HTMLDivElement>(null)

  const [editingName, setEditingName] = useState<string | null>(null)
  const [form, setForm] = useState(getEmptyForm)
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])

  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [reviewingName, setReviewingName] = useState<string | null>(null)
  const [printingName, setPrintingName] = useState<string | null>(null)
  const [decisionRemarks, setDecisionRemarks] = useState("")
  const [recommendingApproval, setRecommendingApproval] = useState("")

  const companiesQuery = useQuery({
    queryKey: ["Company", "list", "requisition-form"],
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
  const employeesQuery = useQuery({
    queryKey: ["Employee", "list", "requisition-form"],
    queryFn: () =>
      frappe.list<{ name: string; employee_name: string }>("Employee", {
        fields: ["name", "employee_name"],
        limit_page_length: 200,
      }),
  })
  const branchesQuery = useQuery({
    queryKey: ["Branch", "list", "requisition-form"],
    queryFn: () => frappe.list<{ name: string }>("Branch", { fields: ["name"], limit_page_length: 100 }),
  })

  const selectedCompany = form.company || companiesQuery.data?.[0]?.name || ""

  const listQuery = useQuery({
    queryKey: REQUISITION_LIST_QUERY_KEY,
    queryFn: () =>
      frappe.list<RequisitionRow>("Material Request", {
        fields: [
          "name",
          "transaction_date",
          "schedule_date",
          "requested_by",
          "branch",
          "pr_purpose",
          "justification",
          "total_amount",
          "approval_status",
          "docstatus",
          "recommending_approval",
          "approved_by",
          "approval_date",
          "approval_remarks",
        ],
        filters: [["material_request_type", "=", "Purchase"]],
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
      (r.requested_by ?? "").toLowerCase().includes(needle) ||
      (r.branch ?? "").toLowerCase().includes(needle) ||
      (r.pr_purpose ?? "").toLowerCase().includes(needle)
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

  function handleNewRequisition() {
    resetForm()
    scrollToForm()
  }

  const computedTotal = items.reduce((sum, row) => sum + Number(row.qty ?? 0) * Number(row.rate ?? 0), 0)

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        transaction_date: form.transaction_date,
        schedule_date: form.schedule_date || undefined,
        material_request_type: "Purchase",
        company: selectedCompany,
        requested_by: form.requested_by || undefined,
        branch: form.branch || undefined,
        pr_purpose: form.pr_purpose || undefined,
        justification: form.justification || undefined,
        total_amount: computedTotal,
        items,
      }
      return editingName
        ? frappe.updateDoc("Material Request", editingName, payload)
        : frappe.createDoc("Material Request", payload)
    },
    onSuccess: () => {
      toast.success(editingName ? "Requisition updated" : "Requisition saved as pending")
      queryClient.invalidateQueries({ queryKey: REQUISITION_LIST_QUERY_KEY })
      resetForm()
    },
    onError: (error) => toast.error(`Could not save requisition: ${getErrorMessage(error)}`),
  })

  async function loadForEdit(row: RequisitionRow) {
    setEditingName(row.name)
    setForm({
      transaction_date: row.transaction_date,
      schedule_date: row.schedule_date ?? "",
      company: form.company,
      requested_by: row.requested_by ?? "",
      branch: row.branch ?? "",
      pr_purpose: row.pr_purpose ?? "",
      justification: row.justification ?? "",
    })
    scrollToForm()
    try {
      const detail = await frappe.getDoc<RequisitionDetail>("Material Request", row.name)
      setItems((detail.items ?? []) as unknown as Array<Record<string, unknown>>)
      setForm((f) => ({ ...f, company: detail.company ?? f.company }))
    } catch {
      // best-effort -- form still opens with header fields even if the item fetch fails
    }
  }

  const canSave =
    !!form.transaction_date && !!selectedCompany && items.length > 0 && !saveMutation.isPending

  const reviewQuery = useQuery({
    queryKey: ["Material Request", reviewingName, "detail"],
    queryFn: () => frappe.getDoc<RequisitionDetail>("Material Request", reviewingName!),
    enabled: !!reviewingName,
  })

  const printQuery = useQuery({
    queryKey: ["Material Request", printingName, "detail"],
    queryFn: () => frappe.getDoc<RequisitionDetail>("Material Request", printingName!),
    enabled: !!printingName,
  })

  useEffect(() => {
    if (!printingName || !printQuery.data) return
    const timer = setTimeout(() => window.print(), 50)
    return () => clearTimeout(timer)
  }, [printingName, printQuery.data])

  useEffect(() => {
    function clearPrinting() {
      setPrintingName(null)
    }
    window.addEventListener("afterprint", clearPrinting)
    return () => window.removeEventListener("afterprint", clearPrinting)
  }, [])

  function openReview(row: RequisitionRow) {
    setReviewingName(row.name)
    setDecisionRemarks("")
    setRecommendingApproval("")
  }

  const decisionMutation = useMutation({
    mutationFn: (approval_status: "Approved" | "Rejected" | "Revision Requested") =>
      frappe.call<{ name: string; approval_status: string; docstatus: number }>(
        "campus_erp.api.finance_purchasing.approve_purchase_requisition",
        {
          material_request: reviewingName,
          approval_status,
          recommending_approval: recommendingApproval || undefined,
          approval_remarks: decisionRemarks || undefined,
        }
      ),
    onSuccess: (result) => {
      toast.success(`Requisition ${result.approval_status.toLowerCase()}`)
      queryClient.invalidateQueries({ queryKey: REQUISITION_LIST_QUERY_KEY })
      setReviewingName(null)
    },
    onError: (error) => toast.error(`Could not record decision: ${getErrorMessage(error)}`),
  })

  const columns: FinanceRecordColumn<RequisitionRow>[] = [
    { key: "name", label: "Requisition ID", render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    { key: "transaction_date", label: "Date Requested", render: (r) => r.transaction_date },
    { key: "branch", label: "Department / Requester", render: (r) => `${r.branch || "—"} / ${r.requested_by || "—"}` },
    { key: "total_amount", label: "Total Amount", align: "right", render: (r) => `₱${formatCurrency(r.total_amount)}` },
    {
      key: "approval_status",
      label: "Status",
      render: (r) => <Badge variant={statusBadgeVariant(r.approval_status)}>{r.approval_status}</Badge>,
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
            <DropdownMenuItem onClick={() => openReview(r)}>Review / Approve</DropdownMenuItem>
            {r.docstatus === 0 && (
              <DropdownMenuItem onClick={() => loadForEdit(r)}>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setPrintingName(r.name)}>
              <PrinterIcon />
              Print / View
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <>
      <div className="grid gap-6 print:hidden">
        <div ref={formRef} className="grid gap-4 scroll-mt-4">
          <h1 className="text-2xl font-semibold">
            {editingName ? `Edit Purchase Requisition — ${editingName}` : "New Purchase Requisition"}
          </h1>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">Date Requested</label>
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
              <Select value={selectedCompany} onValueChange={(v) => setForm((f) => ({ ...f, company: v ?? "" }))}>
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
              <label className="text-xs text-muted-foreground">Requester</label>
              <Select
                value={form.requested_by}
                onValueChange={(v) => setForm((f) => ({ ...f, requested_by: v ?? "" }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select requester…" />
                </SelectTrigger>
                <SelectContent>
                  {(employeesQuery.data ?? []).map((e) => (
                    <SelectItem key={e.name} value={e.name}>
                      {e.employee_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">Department / Branch</label>
              <Select value={form.branch} onValueChange={(v) => setForm((f) => ({ ...f, branch: v ?? "" }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select department…" />
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

          <div className="grid gap-4 sm:grid-cols-2 max-w-4xl">
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">Purpose</label>
              <Textarea
                value={form.pr_purpose}
                onChange={(e) => setForm((f) => ({ ...f, pr_purpose: e.target.value }))}
                placeholder="What this requisition is for…"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">Justification</label>
              <Textarea
                value={form.justification}
                onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))}
                placeholder="Why this requisition is needed…"
              />
            </div>
          </div>

          <div className="grid gap-2 max-w-4xl">
            <label className="text-xs text-muted-foreground">Items</label>
            <ChildTableGrid spec={itemsChildTable} rows={items} onChange={setItems} />
            <div className="text-right text-sm font-medium">Total: ₱{formatCurrency(computedTotal)}</div>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={resetForm} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button type="button" disabled={!canSave} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Saving…" : editingName ? "Update Requisition" : "Save Requisition"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-6">
          <h2 className="text-lg font-semibold">
            Purchase Requisition Approval
          </h2>
          {/* <Button type="button" onClick={handleNewRequisition}>
            + New Requisition
          </Button> */}
        </div>

        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by requisition ID, requester, or department…"
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
          emptyMessage={search.trim() ? "No matching records." : "No purchase requisitions yet."}
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

      <Dialog open={!!reviewingName} onOpenChange={(open) => !open && setReviewingName(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Purchase Requisition Approval — {reviewingName}</DialogTitle>
          </DialogHeader>
          {reviewQuery.isLoading || !reviewQuery.data ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Requester:</span> {reviewQuery.data.requested_by || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Department:</span> {reviewQuery.data.branch || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Date Requested:</span> {reviewQuery.data.transaction_date}
                </div>
                <div>
                  <span className="text-muted-foreground">Total Amount:</span> ₱
                  {formatCurrency(reviewQuery.data.total_amount)}
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Purpose:</span> {reviewQuery.data.pr_purpose || "—"}
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Justification:</span>{" "}
                  {reviewQuery.data.justification || "—"}
                </div>
              </div>

              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="p-2 font-medium">Item</th>
                      <th className="p-2 font-medium">Qty</th>
                      <th className="p-2 font-medium text-right">Unit Cost</th>
                      <th className="p-2 font-medium">Supplier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reviewQuery.data.items ?? []).map((item, i) => (
                      <tr key={i} className="border-b border-border last:border-b-0">
                        <td className="p-2">{item.item_code}</td>
                        <td className="p-2">{item.qty}</td>
                        <td className="p-2 text-right font-mono">₱{formatCurrency(item.rate)}</td>
                        <td className="p-2">{item.supplier || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} />
                      <td className="p-2 text-right font-semibold">₱{formatCurrency(reviewQuery.data.total_amount)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {reviewQuery.data.approval_status !== "Pending" ? (
                <div className="rounded-md border p-3 text-sm">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-muted-foreground">Decision:</span>
                    <Badge variant={statusBadgeVariant(reviewQuery.data.approval_status)}>
                      {reviewQuery.data.approval_status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground">
                    By {reviewQuery.data.approved_by || "—"} on {reviewQuery.data.approval_date || "—"}
                  </div>
                  {reviewQuery.data.approval_remarks && <div className="mt-1">{reviewQuery.data.approval_remarks}</div>}
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <label className="text-xs text-muted-foreground">Recommending Approval (optional)</label>
                    <Select value={recommendingApproval} onValueChange={(v) => setRecommendingApproval(v ?? "")}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select employee…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(employeesQuery.data ?? []).map((e) => (
                          <SelectItem key={e.name} value={e.name}>
                            {e.employee_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs text-muted-foreground">Comments / Approval Notes</label>
                    <Textarea
                      value={decisionRemarks}
                      onChange={(e) => setDecisionRemarks(e.target.value)}
                      placeholder="Remarks for the requester…"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={decisionMutation.isPending}
                      onClick={() => decisionMutation.mutate("Approved")}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={decisionMutation.isPending}
                      onClick={() => decisionMutation.mutate("Rejected")}
                    >
                      Reject
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={decisionMutation.isPending}
                      onClick={() => decisionMutation.mutate("Revision Requested")}
                    >
                      Request Revision
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {printingName && printQuery.data && (
        <div className="hidden print:block p-8 text-sm">
          <h1 className="mb-6 text-xl font-bold">Purchase Requisition Voucher — {printQuery.data.name}</h1>
          <div className="mb-4 grid gap-1">
            <div>
              <span className="font-semibold">Requester:</span> {printQuery.data.requested_by || "—"}
            </div>
            <div>
              <span className="font-semibold">Department:</span> {printQuery.data.branch || "—"}
            </div>
            <div>
              <span className="font-semibold">Date Requested:</span> {printQuery.data.transaction_date}
            </div>
            <div>
              <span className="font-semibold">Purpose:</span> {printQuery.data.pr_purpose || "—"}
            </div>
            <div>
              <span className="font-semibold">Justification:</span> {printQuery.data.justification || "—"}
            </div>
            <div>
              <span className="font-semibold">Status:</span> {printQuery.data.approval_status}
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-black p-1 text-left">Item</th>
                <th className="border border-black p-1 text-left">Qty</th>
                <th className="border border-black p-1 text-right">Unit Cost</th>
                <th className="border border-black p-1 text-left">Supplier</th>
              </tr>
            </thead>
            <tbody>
              {(printQuery.data.items ?? []).map((item, i) => (
                <tr key={i}>
                  <td className="border border-black p-1">{item.item_code}</td>
                  <td className="border border-black p-1">{item.qty}</td>
                  <td className="border border-black p-1 text-right">₱{formatCurrency(item.rate)}</td>
                  <td className="border border-black p-1">{item.supplier || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 text-right font-semibold">
            Total: ₱{formatCurrency(printQuery.data.total_amount)}
          </div>
        </div>
      )}
    </>
  )
}

export default PurchaseRequisitionApprovalPage
