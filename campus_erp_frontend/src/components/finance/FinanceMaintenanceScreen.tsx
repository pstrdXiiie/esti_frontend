"use client"

import { useState, type ReactNode } from "react"
import { useForm } from "react-hook-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  PrinterIcon,
} from "lucide-react"

import { frappe, getErrorMessage } from "@/lib/frappe"
import type { EntrySpec } from "@/lib/forms/types"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FinancePropertySection } from "@/components/finance/FinancePropertyPanel"
import { FinanceDynamicField } from "@/components/finance/FinanceDynamicField"
import { ChildTableGrid } from "@/components/sms/ChildTableGrid"
import { GLEntryGrid } from "@/components/sms/GLEntryGrid"

/** Same dependsOn evaluator as FinanceEntryScreen — duplicated here rather
 * than imported since it isn't exported there; worth factoring into a
 * shared helper if a third consumer shows up. */
function fieldIsVisible(dependsOn: string, watch: (name: string) => unknown): boolean {
  if (dependsOn.startsWith("eval:")) {
    const expr = dependsOn.slice("eval:".length)
    const match = expr.match(/^doc\.(\w+)\s*(==|!=)\s*(.+)$/)
    if (!match) return true
    const [, fieldname, op, rawValue] = match
    const actual = watch(fieldname)
    const unquoted = rawValue.trim().replace(/^["']|["']$/g, "")
    const isNumeric = unquoted !== "" && !Number.isNaN(Number(unquoted))
    const expected: string | number = isNumeric ? Number(unquoted) : unquoted
    const actualComparable: string | number =
      typeof actual === "number" ? actual : String(actual ?? "")
    const isEqual = actualComparable === expected
    return op === "==" ? isEqual : !isEqual
  }
  return Boolean(watch(dependsOn))
}

type Mode = "view" | "edit" | "add"

/**
 * Curriculum-Offered-styled counterpart to FinanceEntryScreen: toolbar
 * (Add/Edit/Delete/Print/Save/Cancel) + record pager, one doctype at a
 * time, fields locked in a <fieldset disabled> until Add or Edit is
 * pressed. Meant for FinanceMaintenancePage's sidebar-switched screens;
 * FinanceEntryListScreen (list+inline-form) stays the pattern for finance
 * screens reached directly from the main sidebar.
 *
 * `extra` is an optional slot for doctype-specific actions that depend on
 * the currently selected record (e.g. Purchase Requisition's Submit /
 * Create Purchase Order(s) buttons) — rendered below the fieldset, only
 * while viewing (not while adding/editing) a saved record.
 */
export function FinanceMaintenanceScreen({
  spec,
  extra,
  bordered = true,
}: {
  spec: EntrySpec
  extra?: (doc: Record<string, unknown> | null, mode: Mode) => ReactNode
  bordered?: boolean
}) {
  const queryClient = useQueryClient()

  const listQuery = useQuery({
    queryKey: [spec.doctype, "list", "maintenance"],
    queryFn: () =>
      frappe.list<Record<string, unknown> & { name: string }>(spec.doctype, {
        fields: ["name", ...spec.fields.map((f) => f.fieldname)],
        limit_page_length: 500,
      }),
  })
  const records = listQuery.data ?? []

  const [initialized, setInitialized] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [pendingSelectName, setPendingSelectName] = useState<string | null>(null)
  const [syncedName, setSyncedName] = useState<string | undefined>(undefined)
  const [mode, setMode] = useState<Mode>("view")
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])

  if (!initialized && records.length > 0) {
    setInitialized(true)
    setSelectedIndex(0)
  }

  const selected = selectedIndex !== null ? records[selectedIndex] : null

  const { data: fullDoc, isFetching: isLoadingDoc } = useQuery({
    queryKey: [spec.doctype, selected?.name, "maintenance"],
    queryFn: () => frappe.getDoc<Record<string, unknown>>(spec.doctype, String(selected!.name)),
    enabled: !!selected,
  })

  const form = useForm<Record<string, unknown>>({ defaultValues: {} })

  if (fullDoc && fullDoc.name !== syncedName) {
    setSyncedName(String(fullDoc.name))
    form.reset(fullDoc)
    const existing = spec.childTable ? fullDoc[spec.childTable.fieldname] : undefined
    setRows(Array.isArray(existing) ? (existing as Array<Record<string, unknown>>) : [])
  }

  if (pendingSelectName) {
    const idx = records.findIndex((r) => String(r.name) === pendingSelectName)
    if (idx !== -1) {
      setSelectedIndex(idx)
      setPendingSelectName(null)
    }
  }

  function handleAdd() {
    setSelectedIndex(null)
    setSyncedName(undefined)
    form.reset({})
    setRows([])
    setMode("add")
  }

  function handleEdit() {
    setMode("edit")
  }

  function handleCancel() {
    if (fullDoc) {
      form.reset(fullDoc)
      const existing = spec.childTable ? fullDoc[spec.childTable.fieldname] : undefined
      setRows(Array.isArray(existing) ? (existing as Array<Record<string, unknown>>) : [])
      setMode("view")
    } else {
      form.reset({})
      setRows([])
      setMode("view")
    }
  }

  function selectRecord(idx: number) {
    if (idx < 0 || idx >= records.length) return
    setSelectedIndex(idx)
    setMode("view")
  }

  const saveMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload = spec.childTable ? { ...values, [spec.childTable.fieldname]: rows } : values
      return selected
        ? frappe.updateDoc(spec.doctype, String(selected.name), payload)
        : spec.primaryApi
          ? frappe.call(spec.primaryApi, payload)
          : frappe.createDoc(spec.doctype, payload)
    },
    onSuccess: async (saved) => {
      toast.success(`${spec.title} saved`)
      const savedName = selected?.name ?? (saved as { name?: string })?.name
      await queryClient.invalidateQueries({ queryKey: [spec.doctype] })
      setMode("view")
      if (savedName) setPendingSelectName(String(savedName))
    },
    onError: (error) => toast.error(`Could not save ${spec.title}: ${getErrorMessage(error)}`),
  })

  const deleteMutation = useMutation({
    mutationFn: () => frappe.deleteDoc(spec.doctype, String(selected!.name)),
    onSuccess: async () => {
      toast.success(`${spec.title} deleted`)
      await queryClient.invalidateQueries({ queryKey: [spec.doctype] })
      handleAdd()
    },
    onError: (error) => toast.error(`Could not delete ${spec.title}: ${getErrorMessage(error)}`),
  })

  if (listQuery.isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  const sectionOrder: string[] = []
  const sectionMap = new Map<string, typeof spec.fields>()
  for (const f of spec.fields) {
    const key = f.section ?? ""
    if (!sectionMap.has(key)) {
      sectionOrder.push(key)
      sectionMap.set(key, [])
    }
    sectionMap.get(key)!.push(f)
  }

  const locked = mode === "view"

  return (
    <div className={`rounded-2xl h-full p-6 flex flex-col gap-5 overflow-y-auto ${bordered ? "border border-border" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
        <Button type="button" onClick={handleAdd} disabled={mode === "add"}>
          <PlusIcon /> Add
        </Button>
        <Button type="button" variant="outline" disabled={!selected || mode !=="view"} onClick={handleEdit}>
          <PencilIcon /> Edit
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!selected || mode !== "view" || deleteMutation.isPending}
          onClick={() => deleteMutation.mutate()}
        >
          <Trash2Icon /> Delete
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          <PrinterIcon /> Print
        </Button>
        {mode !== "view" && (
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              disabled={saveMutation.isPending}
              onClick={form.handleSubmit((values) => saveMutation.mutate(values))}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      {selected && isLoadingDoc ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <fieldset disabled={locked} className="grid gap-5 disabled:opacity-60">
          {sectionOrder.map((sectionKey) => (
            <FinancePropertySection key={sectionKey || "default"} title={sectionKey || "Details"}>
              <div className="grid divide-y divide-border">
                {sectionMap.get(sectionKey)!.map((f) => {
                  if (f.dependsOn && !fieldIsVisible(f.dependsOn, form.watch)) return null
                  return <FinanceDynamicField key={f.fieldname} control={form.control} spec={f} />
                })}
              </div>
            </FinancePropertySection>
          ))}

          {spec.childTable &&
            (spec.childTable.variant === "gl-entries" ? (
              <GLEntryGrid spec={spec.childTable} rows={rows} onChange={setRows} />
            ) : (
              <FinancePropertySection title="Line Items">
                <ChildTableGrid spec={spec.childTable} rows={rows} onChange={setRows} />
              </FinancePropertySection>
            ))}
        </fieldset>
      )}

      {extra && mode === "view" && (
        <div className="border-t border-border pt-4">
          {extra(fullDoc ?? null, mode)}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <div className="text-sm text-muted-foreground">
          {selectedIndex !== null && records.length > 0
            ? `Record ${selectedIndex + 1} of ${records.length}`
            : `New ${spec.title}`}
        </div>
        <div className="flex gap-2">
          <Button type="button" size="icon-sm" variant="outline" disabled={selectedIndex === null || selectedIndex === 0} onClick={() => selectRecord(0)}>
            <ChevronsLeft />
          </Button>
          <Button type="button" size="icon-sm" variant="outline" disabled={selectedIndex === null || selectedIndex === 0} onClick={() => selectRecord((selectedIndex ?? 0) - 1)}>
            <ChevronLeft />
          </Button>
          <Button type="button" size="icon-sm" variant="outline" disabled={selectedIndex === null || selectedIndex >= records.length - 1} onClick={() => selectRecord((selectedIndex ?? -1) + 1)}>
            <ChevronRight />
          </Button>
          <Button type="button" size="icon-sm" variant="outline" disabled={selectedIndex === null || selectedIndex >= records.length - 1} onClick={() => selectRecord(records.length - 1)}>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
