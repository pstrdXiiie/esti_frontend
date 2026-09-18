"use client"

import { useState, type ReactNode } from "react"
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Printer, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { frappe, getErrorMessage } from "@/lib/frappe"
import type { EntrySpec } from "@/lib/forms/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FinanceEntryScreen } from "@/components/finance/FinanceEntryScreen"

/**
 * Finance-styled counterpart to EntryListScreen: same spec-driven table,
 * but "New"/row-click opens the form either in a Dialog (default) or
 * inline on the same page (formDisplay="inline"), instead of navigating to
 * a separate route. Registrar's curriculum/permits keep using
 * EntryListScreen + real routes; this is finance-only.
 *
 * formDisplay defaults to "dialog" so existing consumers (Chart of
 * Accounts, Sundry Account, Cash Receipt, Discounts, etc.) keep their
 * current popup behavior unchanged. Pass formDisplay="inline" for screens
 * that should show the form embedded above the table instead (Student
 * Accounts, Purchase Order, Purchase Requisition).
 *
 * cardStyle is a purely visual opt-in (default false, so every existing
 * consumer is unchanged): swaps the outer wrapper and toolbar row for the
 * rounded-2xl card shell + bottom-border toolbar used by the bespoke
 * Curriculum Offered screen, and adds a leading icon to the Add button.
 * No behavior changes — same data flow, same dialog/inline form logic.
 *
 * Table rows are click-anywhere (Registrar/Student's MasterDetailScreen
 * pattern) — the whole <TableRow> opens the edit dialog, with
 * cursor-pointer/hover cues; the Edit/Delete buttons in the Actions column
 * call e.stopPropagation() so they act independently rather than double-
 * firing the row's own click-to-edit.
 *
 * If spec has a "root_type" field, a Root Type filter dropdown is rendered
 * above the table (driven by that field's options string), and a Print
 * button becomes available that renders ALL records (ignoring the active
 * filter) grouped into sections by root_type, then calls window.print().
 * Follows the same window.print()-on-visible-DOM convention as
 * ReportScreen.tsx; no dedicated print stylesheet exists elsewhere in the
 * app, so print-only content is toggled via Tailwind's print:/hidden
 * utilities instead.
 */
export function FinanceEntryListScreen({
  spec,
  renderExtra,
  formDisplay = "dialog",
  allowCreate = true,
  initialSearch,
  cardStyle = false,
}: {
  spec: EntrySpec
  /** Extra content rendered below the form, only when editing an existing record. */
  renderExtra?: (name: string) => ReactNode
  /** "dialog" (default, unchanged popup behavior) or "inline" (form embedded above the table). */
  formDisplay?: "dialog" | "inline"
  /** false hides "Add {title}" and disables creating new records — read/edit/delete only (e.g. Student Accounts). */
  allowCreate?: boolean
  /** Seeds the search box, e.g. from a `?q=` link in from another module's quickLinks. */
  initialSearch?: string
  /** Purely visual opt-in: rounded-2xl card shell + bordered toolbar matchingCurriculum Offered. Default false leaves existing consumers unchanged. */
  cardStyle?: boolean
}) {
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null)
  const [activeName, setActiveName] = useState<string | undefined>(undefined)
  const [formOpen, setFormOpen] = useState(false)
  const [rootTypeFilter, setRootTypeFilter] = useState<string>("all")
  const [search, setSearch] = useState(initialSearch ?? "")

  const listColumns = spec.fields.filter((f) => f.inListView)
  const columns = listColumns.length ? listColumns : spec.fields.slice(0, 4)

  const linkColumns = columns.filter(
    (c) => c.fieldtype === "Link" && c.options && c.linkLabelFields?.length
  )

  const linkLabelQueries = useQueries({
    queries: linkColumns.map((c) => ({
      queryKey: ["Link", "labels", c.options, c.linkLabelFields],
      queryFn: () =>
        frappe.list<Record<string, unknown> & { name: string }>(c.options as string, {
          fields: ["name", ...(c.linkLabelFields ?? [])],
          limit_page_length: 1000,
        }),
    })),
  })

  const linkLabelMaps = linkColumns.reduce<Record<string, Record<string, string>>>((acc, c, i) => {
    const rows = linkLabelQueries[i]?.data ?? []
    acc[c.fieldname] = Object.fromEntries(
      rows.map((r) => [
        r.name,
        (c.linkLabelFields ?? []).map((f) => r[f]).filter(Boolean).join(" ") || r.name,
      ])
    )
    return acc
  }, {})

  function formatCell(c: (typeof columns)[number], row: Record<string, unknown>): string {
    const raw = row[c.fieldname]
    if (c.fieldtype === "Link" && linkLabelMaps[c.fieldname]) {
      return linkLabelMaps[c.fieldname][String(raw)] ?? String(raw ?? "")
    }
    return String(raw ?? "")
  }

  const rootTypeField = spec.fields.find((f) => f.fieldname === "root_type")
  const rootTypeOptions = rootTypeField?.options
    ? rootTypeField.options.split("\n").filter(Boolean)
    : []

  const filters: [string, string, unknown][] | undefined =
    rootTypeFilter !== "all" ? [["root_type", "=", rootTypeFilter]] : undefined

  const { data, isLoading } = useQuery({
    queryKey: [spec.doctype, "list", rootTypeFilter],
    queryFn: () =>
      frappe.list(spec.doctype, {
        fields: ["name", ...spec.fields.map((f) => f.fieldname)],
        filters,
        limit_page_length: 100,
      }),
  })

  // Client-side, across raw field values — matches EntryListScreen's own
  // search, and (deliberately) filters on the raw stored value rather than
  // formatCell's resolved Link label, so a quickLinks-driven `?q=<name>`
  // from another module's own record id lines up exactly.
  const filteredData = (data ?? []).filter(
    (row) =>
      !search.trim() ||
      columns.some((c) => String(row[c.fieldname] ?? "").toLowerCase().includes(search.trim().toLowerCase()))
  )

  // Always unfiltered, regardless of the on-screen Root Type filter above —
  // "Print" means the full chart, grouped by type, not just what's currently
  // narrowed down on screen.
  const { data: printData } = useQuery({
    queryKey: [spec.doctype, "list", "print-all"],
    queryFn: () =>
      frappe.list(spec.doctype, {
        fields: ["name", ...spec.fields.map((f) => f.fieldname)],
        limit_page_length: 500,
      }),
    enabled: rootTypeOptions.length > 0,
  })

  const printGroups =
    rootTypeOptions.length > 0 && printData
      ? [...rootTypeOptions, "Other"]
          .map((groupType) => ({
            type: groupType,
            rows: (printData as Array<Record<string, unknown>>)
              .filter((row) =>
                groupType === "Other"
                  ? !rootTypeOptions.includes(String(row.root_type ?? ""))
                  : row.root_type === groupType
              )
              .sort((a, b) =>
                String(a.account_number ?? a.account_name ?? "").localeCompare(
                  String(b.account_number ?? b.account_name ?? "")
                )
              ),
          }))
          .filter((g) => g.rows.length > 0)
      : []

  const deleteMutation = useMutation({
    mutationFn: async (name: string) => frappe.deleteDoc(spec.doctype, name),
    onSuccess: () => {
      toast.success(`${spec.title} deleted`)
      queryClient.invalidateQueries({ queryKey: [spec.doctype, "list"] })
      setDeleteTarget(null)
      if (deleteTarget?.name === activeName) closeForm()
    },
    onError: (error) => {
      toast.error(`Could not delete ${spec.title}: ${getErrorMessage(error)}`)
      setDeleteTarget(null)
    },
  })

  function openNew() {
    if (!allowCreate) return
    setActiveName(undefined)
    setFormOpen(true)
  }

  function openRow(name: string) {
    setActiveName(name)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setActiveName(undefined)
    queryClient.invalidateQueries({ queryKey: [spec.doctype, "list"] })
  }

  const inline = formDisplay === "inline"

  return (
    <div
      className={
        cardStyle
          ? "rounded-2xl border border-border h-full p-6 flex flex-col gap-5 overflow-y-auto"
          : "grid gap-4"
      }
    >
      <div
        className={
          cardStyle
            ? "print-hide flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4"
            : "print-hide flex items-center justify-between"
        }
      >
        <h1 className="text-2xl font-semibold">{spec.title}</h1>
        <div className="flex items-center gap-2">
          {rootTypeOptions.length > 0 && (
            <>
              <Select
                value={rootTypeFilter}
                onValueChange={(value) => setRootTypeFilter(value ?? "all")}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {rootTypeOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!printGroups.length}
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </>
          )}
          {allowCreate && !(inline && formOpen) && (
            <Button onClick={openNew}>
              {cardStyle && <Plus className="h-4 w-4" />}
              Add {spec.title}
            </Button>
          )}
        </div>
      </div>

      <div className="print-hide relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={`Search ${spec.title.toLowerCase()}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Inline form panel — embedded on the same page, above the table. */}
      {inline && formOpen && (
        <div className="print-hide rounded-md border">
          <FinanceEntryScreen
            spec={spec}
            name={activeName}
            onSaved={(savedName) => {
              setActiveName(savedName)
              closeForm()
            }}
            onCancel={closeForm}
          />
          {activeName && renderExtra?.(activeName)}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="print-hide h-64 w-full" />
      ) : (
        <div className="print-hide overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.fieldname}>
                    {c.label}
                  </TableHead>
                ))}
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((row) => (
                <TableRow
                  key={String(row.name)}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => openRow(String(row.name))}
                >
                  {columns.map((c) => (
                    <TableCell key={c.fieldname}>
                      {formatCell(c, row) || String(row.name)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${spec.title}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          openRow(String(row.name))
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${spec.title}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget(row)
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="text-muted-foreground text-center">
                    {search.trim() ? "No matching records." : "No records yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Print-only view: hidden on screen, shown only when printing. */}
      {printGroups.length > 0 && (
        <div className="print-only">
          <h1 className="mb-4 text-xl font-semibold">{spec.title}</h1>
          {printGroups.map((group) => (
            <div key={group.type} className="mb-6 break-inside-avoid">
              <h2 className="mb-1 border-b border-black pb-1 text-sm font-bolduppercase">
                {group.type}
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black text-left">
                    {columns.map((c) => (
                      <th key={c.fieldname} className="py-1 pr-4 font-semibold">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={String(row.name)} className="border-b border-border">
                      {columns.map((c) => (
                        <td key={c.fieldname} className="py-1 pr-4">
                          {formatCell(c, row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {!inline && (
        <Dialog open={formOpen} onOpenChange={(open) => !open && closeForm()}>
          <DialogContent
            showCloseButton={false}
            className="max-h-[90vh] w-fit max-w-[calc(100%-2rem)] overflow-y-auto border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-2xl"
          >
            <DialogTitle className="sr-only">
              {activeName ? `Edit ${spec.title} — ${activeName}` : `New ${spec.title}`}
            </DialogTitle>
            <FinanceEntryScreen
              spec={spec}
              name={activeName}
              onSaved={(savedName) => {
                setActiveName(savedName)
                closeForm()
              }}
            />
            {activeName && renderExtra?.(activeName)}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {spec.title}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove this {spec.title.toLowerCase()} record. This action cannot be
            undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget?.name && deleteMutation.mutate(String(deleteTarget.name))}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
