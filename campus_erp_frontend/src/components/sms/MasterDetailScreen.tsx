"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  EyeIcon,
  FilterIcon,
  MoreVerticalIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  UserXIcon,
  XIcon,
} from "lucide-react"

import { frappe, getErrorMessage } from "@/lib/frappe"
import type { FieldSpec, FormSpec, WizardLayout } from "@/lib/forms/types"
import { itemLabel, singularize, useCascadeDelete } from "@/lib/cascadeDelete"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { WizardFormLayout } from "@/components/sms/WizardFormLayout"
import { DynamicField } from "@/components/sms/DynamicField"
import type { StudentOption } from "@/components/sms/StudentSearch"
import { OfficialTranscriptOfRecords } from "@/components/ui/registrar/reports/student-credentials/official-transcript-of-records"
import { StudentGrades } from "@/components/ui/registrar/grades/student-grades/student-grades"

const PAGE_SIZE = 10

/**
 * Groups fields by their (optional) `section` for the edit dialog, in order
 * of first appearance — fields with no section fall into one ungrouped
 * bucket rendered inline, same as before this grouping existed. Consecutive
 * or scattered fields sharing a section name are merged into one group.
 */
function groupFieldsBySection(fields: FieldSpec[]): Array<{ section: string | null; fields: FieldSpec[] }> {
  const groups: Array<{ section: string | null; fields: FieldSpec[] }> = []
  const indexBySection = new Map<string | null, number>()

  for (const field of fields) {
    const key = field.section ?? null
    let idx = indexBySection.get(key)
    if (idx === undefined) {
      idx = groups.length
      indexBySection.set(key, idx)
      groups.push({ section: key, fields: [] })
    }
    groups[idx].fields.push(field)
  }

  return groups
}

/**
 * The ~115 legacy Master/Detail screens (blueprint §5.1): a list view plus an
 * Add/Edit detail panel, backed by one Frappe DocType.
 */
export function MasterDetailScreen({
  spec,
  initialSearch,
}: {
  spec: FormSpec & { wizard?: WizardLayout }
  /** Seeds the list's search box, e.g. from a `?q=` link in from another module's quickLinks. */
  initialSearch?: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [gradesOpen, setGradesOpen] = useState(false)
  const [relatedRecordName, setRelatedRecordName] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState(initialSearch ?? "")
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterField, setFilterField] = useState<string>("")
  const [filterValue, setFilterValue] = useState("")
  const [sort, setSort] = useState<{ field: string; dir: "asc" | "desc" } | null>(null)
  const [page, setPage] = useState(1)

  const wizard = spec.wizard

  const listColumns = spec.fields.filter((f) => f.inListView)
  const columns = listColumns.length ? listColumns : spec.fields.slice(0, 4)
  const searchableColumns = columns.filter((c) =>
    ["Data", "Text", "Small Text", "Link", "Select"].includes(c.fieldtype)
  )

  const { data, isLoading } = useQuery({
    queryKey: [spec.doctype, "list"],
    queryFn: () =>
      frappe.list(spec.doctype, {
        fields: ["name", ...spec.fields.map((f) => f.fieldname)],
        limit_page_length: 100,
      }),
  })

  const filteredRows = useMemo(() => {
    let rows = data ?? []

    if (search.trim()) {
      const needle = search.trim().toLowerCase()
      const haystack = searchableColumns.length ? searchableColumns : columns
      rows = rows.filter(
        (row) =>
          haystack.some((c) => String(row[c.fieldname] ?? "").toLowerCase().includes(needle)) ||
          // Also match the record's own id — not shown as a column on most
          // specs, but it's what a quickLinks `?q=` from another module
          // passes (that module only has the raw Link value, not this
          // doctype's own display columns to search by).
          String(row.name ?? "").toLowerCase().includes(needle)
      )
    }

    if (filterField && filterValue.trim()) {
      const needle = filterValue.trim().toLowerCase()
      rows = rows.filter((row) => String(row[filterField] ?? "").toLowerCase().includes(needle))
    }

    if (sort) {
      const { field, dir } = sort
      rows = [...rows].sort((a, b) => {
        const av = a[field]
        const bv = b[field]
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av ?? "").localeCompare(String(bv ?? ""))
        return dir === "asc" ? cmp : -cmp
      })
    }

    return rows
  }, [data, search, filterField, filterValue, sort, columns, searchableColumns])

  const total = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(currentPage * PAGE_SIZE, total)
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function applyFilter(field: string, value: string) {
    setFilterField(field)
    setFilterValue(value)
    setPage(1)
  }

  function toggleSort(field: string) {
    setSort((prev) => {
      if (!prev || prev.field !== field) return { field, dir: "asc" }
      if (prev.dir === "asc") return { field, dir: "desc" }
      return null
    })
  }

  const form = useForm<Record<string, unknown>>({ defaultValues: {} })

  const relatedFieldNames = new Set([
    ...(spec.relatedRecord?.fields.map((f) => f.fieldname) ?? []),
    ...(spec.relatedRecord?.additionalCreateFields?.map((f) => f.fieldname) ?? []),
  ])

  const dialogFields = useMemo(() => {
    if (!spec.relatedRecord) return spec.fields
    const { relatedRecord } = spec
    const hasRelated = !!relatedRecordName
    // With allowCreate, there's nothing to edit yet but the fields should
    // still accept input (the user is filling them in to create the
    // related record on save) -- only the plain default (no allowCreate)
    // forces them readOnly when nothing exists.
    const editable = hasRelated || !!relatedRecord.allowCreate
    return [
      ...spec.fields,
      ...relatedRecord.fields.map((f) => ({
        ...f,
        section: relatedRecord.section,
        readOnly: f.readOnly || !editable,
      })),
      ...(!hasRelated && relatedRecord.allowCreate
        ? (relatedRecord.additionalCreateFields ?? []).map((f) => ({ ...f, section: relatedRecord.section }))
        : []),
    ]
  }, [spec, relatedRecordName])

  const saveMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const baseValues: Record<string, unknown> = {}
      const relatedValues: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(values)) {
        if (relatedFieldNames.has(key)) relatedValues[key] = value
        else baseValues[key] = value
      }

      const result = editing?.name
        ? await frappe.updateDoc(spec.doctype, String(editing.name), baseValues)
        : await frappe.createDoc(spec.doctype, baseValues)

      if (spec.relatedRecord && relatedRecordName) {
        await frappe.updateDoc(spec.relatedRecord.doctype, relatedRecordName, relatedValues)
        queryClient.invalidateQueries({ queryKey: [spec.relatedRecord.doctype, "list"] })
      } else if (
        spec.relatedRecord?.allowCreate &&
        // Only create once the user actually picked something -- leaving
        // every related field blank stays a no-op, same as before this
        // capability existed, instead of inserting an empty record.
        Object.values(relatedValues).some((v) => v !== undefined && v !== null && v !== "")
      ) {
        const parentName = editing?.name ?? (result as { name?: string } | undefined)?.name
        if (parentName) {
          await frappe.createDoc(spec.relatedRecord.doctype, {
            [spec.relatedRecord.linkField]: parentName,
            ...relatedValues,
          })
          queryClient.invalidateQueries({ queryKey: [spec.relatedRecord.doctype, "list"] })
        }
      }

      return result
    },
    onSuccess: () => {
      toast.success(`${spec.title} saved`)
      queryClient.invalidateQueries({ queryKey: [spec.doctype, "list"] })
      setDialogOpen(false)
    },
    onError: (error) => toast.error(`Could not save ${spec.title}: ${getErrorMessage(error)}`),
  })

  const { deleteMutation, deleteWithCascade } = useCascadeDelete(spec)

  const dropMutation = useMutation({
    mutationFn: (name: string) =>
      frappe.updateDoc(spec.doctype, name, {
        [spec.statusField!.fieldname]: spec.statusField!.droppedValue,
      }),
    onSuccess: () => {
      toast.success(`${singularize(spec.title)} marked as ${spec.statusField!.droppedValue}`)
      queryClient.invalidateQueries({ queryKey: [spec.doctype, "list"] })
    },
    onError: (error) =>
      toast.error(`Could not update ${spec.title}: ${getErrorMessage(error)}`),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (names: string[]) => {
      await Promise.all(names.map((name) => deleteWithCascade(name)))
    },
    onSuccess: (_data, names) => {
      toast.success(`Deleted ${names.length} ${itemLabel(spec.title, names.length)}`)
      queryClient.invalidateQueries({ queryKey: [spec.doctype, "list"] })
      setSelected(new Set())
    },
    onError: (error) => toast.error(`Could not delete ${spec.title}: ${getErrorMessage(error)}`),
  })

  const bulkDropMutation = useMutation({
    mutationFn: async (names: string[]) => {
      await Promise.all(
        names.map((name) =>
          frappe.updateDoc(spec.doctype, name, {
            [spec.statusField!.fieldname]: spec.statusField!.droppedValue,
          })
        )
      )
    },
    onSuccess: (_data, names) => {
      toast.success(
        `Marked ${names.length} ${itemLabel(spec.title, names.length)} as ${spec.statusField!.droppedValue}`
      )
      queryClient.invalidateQueries({ queryKey: [spec.doctype, "list"] })
      setSelected(new Set())
    },
    onError: (error) => toast.error(`Could not update ${spec.title}: ${getErrorMessage(error)}`),
  })

  function toggleRow(name: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(name)
      else next.delete(name)
      return next
    })
  }

  function toggleAll(rows: Record<string, unknown>[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const row of rows) {
        if (checked) next.add(String(row.name))
        else next.delete(String(row.name))
      }
      return next
    })
  }

  function openNew() {
    setEditing(null)
    setRelatedRecordName(null)
    form.reset({})
    setDialogOpen(true)
  }

  async function openRow(row: Record<string, unknown>) {
    setEditing(row)
    form.reset(row)
    setDialogOpen(true)

    if (!spec.relatedRecord) {
      setRelatedRecordName(null)
      return
    }

    const { relatedRecord } = spec
    const [related] = await frappe.list<Record<string, unknown>>(relatedRecord.doctype, {
      filters: [[relatedRecord.linkField, "=", String(row.name)]],
      fields: ["name", ...relatedRecord.fields.map((f) => f.fieldname)],
      order_by: `${relatedRecord.orderBy} desc`,
      limit_page_length: 1,
    })
    setRelatedRecordName(related ? String(related.name) : null)
    // related.name is the Program Enrollment's own name, not the Student's —
    // spreading it in would clobber row.name in form state (submitted back
    // as the base doctype's `name`, which Frappe reads as a rename request).
    // relatedRecordName above is the only place that name is needed.
    const relatedValues = Object.fromEntries(
      Object.entries(related ?? {}).filter(([key]) => key !== "name")
    )
    form.reset({ ...row, ...relatedValues })
  }

  // Only the Student screen gets a Transcript of Records shortcut — this
  // component serves ~115 other doctypes that have no such record.
  const editingStudent: StudentOption | null =
    spec.doctype === "Student" && editing
      ? {
          name: String(editing.name),
          student_name: String(editing.student_name ?? ""),
          stdnt_cno: (editing.stdnt_cno as string | null | undefined) ?? null,
        }
      : null

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{spec.title}</h1>
        <Button onClick={() => (spec.addPath ? router.push(spec.addPath) : openNew())}>Add {spec.title}</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder={`Search ${spec.title.toLowerCase()}...`}
            className="pl-8"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setFilterOpen((v) => !v)}
        >
          <FilterIcon />
          Filter
        </Button>
        {filterField && filterValue.trim() && (
          <Button type="button" variant="ghost" size="sm" onClick={() => applyFilter("", "")}>
            Clear filter
            <XIcon />
          </Button>
        )}
      </div>

      {filterOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
          <Select value={filterField} onValueChange={(value) => applyFilter(value ?? "", filterValue)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by column" />
            </SelectTrigger>
            <SelectContent>
              {columns.map((c) => (
                <SelectItem key={c.fieldname} value={c.fieldname}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={filterValue}
            onChange={(e) => applyFilter(filterField, e.target.value)}
            placeholder="Value contains..."
            disabled={!filterField}
            className="w-48"
          />
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    aria-label="Select all rows"
                    checked={pageRows.length > 0 && pageRows.every((row) => selected.has(String(row.name)))}
                    onChange={(e) => toggleAll(pageRows, e.target.checked)}
                  />
                </TableHead>
                {columns.map((c) => (
                  <TableHead key={c.fieldname}>
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort(c.fieldname)}
                    >
                      {c.label}
                      {sort?.field === c.fieldname ? (
                        sort.dir === "asc" ? (
                          <ArrowUpIcon className="size-3.5" />
                        ) : (
                          <ArrowDownIcon className="size-3.5" />
                        )
                      ) : (
                        <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </TableHead>
                ))}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow
                  key={String(row.name)}
                  className="cursor-pointer"
                  onClick={() => openRow(row)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      aria-label={`Select ${String(row.name)}`}
                      checked={selected.has(String(row.name))}
                      onChange={(e) => toggleRow(String(row.name), e.target.checked)}
                    />
                  </TableCell>
                  {columns.map((c) => (
                    <TableCell key={c.fieldname}>
                      {String(row[c.fieldname] ?? "")}
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {spec.detailPath && (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`View ${spec.title}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(
                              `${spec.detailPath}/${encodeURIComponent(String(row.name))}`
                            )
                          }}
                        >
                          <EyeIcon />
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`More actions for ${itemLabel(spec.title, 1)}`}
                              onClick={(e) => e.stopPropagation()}
                            />
                          }
                        >
                          <MoreVerticalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => openRow(row)}>
                            <PencilIcon />
                            Edit
                          </DropdownMenuItem>
                          {spec.statusField && (
                            <DropdownMenuItem
                              disabled={dropMutation.isPending}
                              onClick={() => dropMutation.mutate(String(row.name))}
                            >
                              <UserXIcon />
                              {spec.statusField.label ?? "Drop"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete this ${itemLabel(spec.title, 1)}? This cannot be undone.`
                                )
                              ) {
                                deleteMutation.mutate(String(row.name))
                              }
                            }}
                          >
                            <Trash2Icon />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total === 0
              ? `Showing 0 from 0`
              : `Showing ${pageStart}-${pageEnd} from ${total}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={currentPage <= 1}
              aria-label="Previous page"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeftIcon />
            </Button>
            <span>
              {currentPage} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={currentPage >= totalPages}
              aria-label="Next page"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className={cn(
            // DialogContent's own base classes set `sm:max-w-sm` — an
            // unscoped `max-w-*` here doesn't win the cascade against that
            // sm: variant (twMerge only dedupes same-variant conflicts), so
            // the override must carry a matching `sm:` prefix to actually
            // take effect at any real viewport width.
            // flex-col + the inner div's own overflow-y-auto (rather than
            // this whole popup scrolling as one block) is what keeps the
            // Save/Transcript of Records footer pinned in view instead of
            // scrolling away with a long field list.
            "flex w-full max-h-[85vh] flex-col overflow-hidden max-w-2xl sm:max-w-3xl",
            wizard && "sm:max-w-4xl"
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${spec.title}` : `New ${spec.title}`}
            </DialogTitle>
          </DialogHeader>
          {editing && spec.quickLinks && spec.quickLinks.length > 0 && (
            <div className="-mt-2 flex flex-wrap gap-4">
              {spec.quickLinks.map((ql) => {
                const href = ql.hrefFor(editing)
                if (!href) return null
                return (
                  <Link key={ql.label} href={href} className="text-sm font-medium text-primary hover:underline">
                    {ql.label} →
                  </Link>
                )
              })}
            </div>
          )}
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) =>
                saveMutation.mutate(values)
              )}
              className="flex min-h-0 flex-1 flex-col gap-4"
            >
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {wizard ? (
                  <WizardFormLayout spec={spec} layout={wizard} control={form.control} />
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {groupFieldsBySection(dialogFields).map((group, idx) =>
                      group.section ? (
                        <div
                          key={group.section}
                          className="relative rounded-md border p-3 pt-4 sm:col-span-2"
                        >
                          <span className="absolute -top-2.5 left-3 bg-card px-1 text-xs font-medium">
                            {group.section}
                          </span>
                          {group.section === spec.relatedRecord?.section && !relatedRecordName && (
                            <p className="mb-2 text-xs text-muted-foreground">
                              {spec.relatedRecord.missingRecordHint}
                            </p>
                          )}
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {group.fields.map((f) => (
                              <DynamicField key={f.fieldname} control={form.control} spec={f} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div key={`ungrouped-${idx}`} className="contents">
                          {group.fields.map((f) => (
                            <DynamicField key={f.fieldname} control={form.control} spec={f} />
                          ))}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                {editingStudent && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false)
                      setTranscriptOpen(true)
                    }}
                  >
                    Transcript of Records
                  </Button>
                )}
                {editingStudent && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false)
                      setGradesOpen(true)
                    }}
                  >
                    Grades
                  </Button>
                )}
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {spec.doctype === "Student" && (
        <OfficialTranscriptOfRecords
          open={transcriptOpen}
          onOpenChange={setTranscriptOpen}
          initialStudent={editingStudent}
        />
      )}

      {spec.doctype === "Student" && (
        <StudentGrades open={gradesOpen} onOpenChange={setGradesOpen} student={editingStudent} />
      )}

      {selected.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border bg-background px-4 py-2 shadow-lg">
            <span className="text-sm font-medium">
              {selected.size} {itemLabel(spec.title, selected.size)} selected
            </span>
            {spec.statusField && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={bulkDropMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Mark ${selected.size} selected ${itemLabel(spec.title, selected.size)} as ${spec.statusField!.droppedValue}?`
                    )
                  ) {
                    bulkDropMutation.mutate(Array.from(selected))
                  }
                }}
              >
                <UserXIcon />
                {bulkDropMutation.isPending ? "Updating…" : (spec.statusField.label ?? "Drop")}
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="rounded-full"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete ${selected.size} selected ${itemLabel(spec.title, selected.size)}? This cannot be undone.`
                  )
                ) {
                  bulkDeleteMutation.mutate(Array.from(selected))
                }
              }}
            >
              <Trash2Icon />
              {bulkDeleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label="Clear selection"
              onClick={() => setSelected(new Set())}
            >
              <XIcon />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}