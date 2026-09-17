"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"

import { frappe } from "@/lib/frappe"
import { formatAcademicYearLabel } from "@/lib/utils"
import { LETTERHEAD_STYLE, ensurePrintHeader, renderLetterhead, usePrintHeader, waitForImagesToLoad } from "@/lib/print-header"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

/** Matches official-transcript-of-records.tsx's own helper — each print
 * call site keeps its own copy rather than sharing one across unrelated
 * report screens. */
function escapeHtml(value: unknown): string {
  const str = value === null || value === undefined || value === "" ? "—" : String(value)
  return str.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      default:
        return "&#39;"
    }
  })
}

interface AcademicYearRow {
  name: string
  academic_year_name: string
}

interface ProgramRow {
  name: string
  program_name: string
}

interface CurriculumRow {
  name: string
  curriculum_code: string
  curriculum_year: string | null
}

interface EnrollmentRow {
  name: string
  student: string
  student_name: string
  first_name: string | null
  middle_name: string | null
  last_name: string | null
  program: string
  program_name: string
  curriculum: string | null
  year_level: number | null
  student_batch_name: string | null
  gender: string | null
  stdnt_cno: string | null
  sms_status: string | null
  enrollment_date: string
  date_of_birth: string | null
  address: string | null
  prior_school: string | null
  prior_school_year: number | null
  father_name: string | null
  mother_name: string | null
}

function curriculumLabel(c: CurriculumRow): string {
  return c.curriculum_year ? `${c.curriculum_code} (${c.curriculum_year})` : c.curriculum_code
}

/** "Last, First M." — matches enrollment-listing-with-subjects.tsx's own
 * legacyName helper (each print call site keeps its own copy). */
function legacyName(row: EnrollmentRow): string {
  const last = row.last_name?.trim()
  const first = row.first_name?.trim()
  if (!last && !first) return row.student_name
  const middle = row.middle_name?.trim()
  // Some records carry a placeholder like "-" for "no middle name" instead
  // of leaving the field blank — matches the backend's own
  // campus_erp.registrar.student_number.sanitize_student_name rule (no
  // alphanumeric characters at all, not just a bare "-").
  const middleInitial = middle && /[a-zA-Z0-9]/.test(middle) ? ` ${middle.charAt(0).toUpperCase()}.` : ""
  return [last, first].filter(Boolean).join(", ") + middleInitial
}

function formatDateMDY(iso: string | null): string {
  if (!iso) return ""
  const [year, month, day] = iso.split("-")
  return year && month && day ? `${month}/${day}/${year}` : iso
}

interface PrintGroup {
  label: string
  subgroups: Array<{
    label: string
    yearLevels: Array<{ label: string; rows: EnrollmentRow[] }>
  }>
}

/** Groups rows by Program(+Section) -> Curriculum(+Section) -> Year Level,
 * matching the legacy Enrollment Listing report's own nested layout —
 * a roster spanning several programs/curricula/year levels prints as one
 * continuous document with a group heading per level rather than a flat
 * table that can't show which section/year each row belongs to.
 *
 * Grouping keys are built from the underlying Program/Curriculum IDs (not
 * the display label) so two different entities can never collide into one
 * printed group just because "<name>-<section>" happens to match — e.g. a
 * Program named "BSED-ENGLISH" with no section vs. a "BSED" Program
 * sectioned "ENGLISH" would otherwise both stringify to "BSED-ENGLISH".
 * Rows are pre-sorted by name so each innermost Year Level bucket ends up
 * name-ordered; the groups/subgroups/year levels themselves are then
 * explicitly sorted afterwards, since Map insertion order (first-name-seen)
 * is not a program/curriculum/year order. */
function groupForPrint(rows: EnrollmentRow[]): PrintGroup[] {
  const sorted = [...rows].sort((a, b) => legacyName(a).localeCompare(legacyName(b)))

  type MutableSubgroup = { label: string; yearLevels: Map<string, { label: string; yearLevel: number | null; rows: EnrollmentRow[] }> }
  type MutableGroup = { label: string; subgroups: Map<string, MutableSubgroup> }
  const groups = new Map<string, MutableGroup>()

  for (const row of sorted) {
    const section = row.student_batch_name

    const groupKey = `${row.program}::${section ?? ""}`
    const groupLabel = section ? `${row.program_name}-${section}` : row.program_name
    let group = groups.get(groupKey)
    if (!group) {
      group = { label: groupLabel, subgroups: new Map() }
      groups.set(groupKey, group)
    }

    const curriculumKey = row.curriculum ?? `program:${row.program}`
    const curriculumLabel = row.curriculum ?? row.program_name
    const subgroupKey = `${curriculumKey}::${section ?? ""}`
    const subgroupLabel = section ? `${curriculumLabel}-${section}` : curriculumLabel
    let subgroup = group.subgroups.get(subgroupKey)
    if (!subgroup) {
      subgroup = { label: subgroupLabel, yearLevels: new Map() }
      group.subgroups.set(subgroupKey, subgroup)
    }

    const yearKey = row.year_level != null ? String(row.year_level) : "—"
    let yearGroup = subgroup.yearLevels.get(yearKey)
    if (!yearGroup) {
      yearGroup = { label: yearKey, yearLevel: row.year_level, rows: [] }
      subgroup.yearLevels.set(yearKey, yearGroup)
    }
    yearGroup.rows.push(row)
  }

  return Array.from(groups.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((group) => ({
      label: group.label,
      subgroups: Array.from(group.subgroups.values())
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((subgroup) => ({
          label: subgroup.label,
          yearLevels: Array.from(subgroup.yearLevels.values())
            .sort((a, b) => (a.yearLevel ?? Infinity) - (b.yearLevel ?? Infinity))
            .map((yl) => ({ label: yl.label, rows: yl.rows })),
        })),
    }))
}

interface EnrollmentListingProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Enrollment Listing (Enrollment Reports tab): the plain "who's enrolled"
 * roster for a School Year — one row per Program Enrollment, unlike
 * Enrollment Statistics' aggregated headcounts.
 */
export function EnrollmentListing({ open, onOpenChange }: EnrollmentListingProps) {
  const [academicYear, setAcademicYear] = useState("")
  const [program, setProgram] = useState("")
  const [curriculum, setCurriculum] = useState("")

  const academicYearsQuery = useQuery({
    queryKey: ["Academic Year", "list", "enrollment-listing"],
    queryFn: () =>
      frappe.list<AcademicYearRow>("Academic Year", {
        fields: ["name", "academic_year_name"],
        order_by: "year_start_date desc",
        limit_page_length: 50,
      }),
    enabled: open,
  })

  const programsQuery = useQuery({
    queryKey: ["Program", "list", "enrollment-listing"],
    queryFn: () =>
      frappe.list<ProgramRow>("Program", {
        fields: ["name", "program_name"],
        limit_page_length: 100,
      }),
    enabled: open,
  })

  const curriculumsQuery = useQuery({
    queryKey: ["SMS Curriculum", "list", "enrollment-listing", program],
    queryFn: () =>
      frappe.list<CurriculumRow>("SMS Curriculum", {
        fields: ["name", "curriculum_code", "curriculum_year"],
        filters: program ? [["course", "=", program]] : undefined,
        limit_page_length: 100,
      }),
    enabled: open,
  })

  const enrollmentsQuery = useQuery({
    queryKey: ["enrollment-listing", academicYear, program, curriculum],
    queryFn: () =>
      frappe.call<EnrollmentRow[]>("campus_erp.api.registrar.list_enrollments", {
        academic_year: academicYear,
        program: program || undefined,
        curriculum: curriculum || undefined,
      }),
    enabled: open && !!academicYear,
  })

  // Print-only: the school letterhead, not needed for the on-screen table.
  const printHeaderQuery = usePrintHeader(open)

  const rows = enrollmentsQuery.data ?? []

  const yearName = academicYearsQuery.data?.find((ay) => ay.name === academicYear)?.academic_year_name
  const yearLabel = yearName ? formatAcademicYearLabel(yearName) : academicYear
  const programLabel = program
    ? programsQuery.data?.find((p) => p.name === program)?.program_name ?? program
    : "All Programs"
  const curriculumLabelText = curriculum
    ? curriculumsQuery.data?.find((c) => c.name === curriculum)?.curriculum_code ?? curriculum
    : "All Curricula"

  async function handlePrint() {
    const printWindow = window.open("", "_blank", "width=1100,height=1000")
    if (!printWindow) {
      toast.error("Could not open the print window. Check your browser's popup blocker.")
      return
    }

    const header = await ensurePrintHeader(printHeaderQuery)

    const bodyRows = groupForPrint(rows)
      .map(
        (group) => `
          <tr><td colspan="10" class="group-1">${escapeHtml(group.label)}</td></tr>
          ${group.subgroups
            .map(
              (sub) => `
                <tr><td colspan="10" class="group-2">${escapeHtml(sub.label)}</td></tr>
                ${sub.yearLevels
                  .map(
                    (yl) => `
                      <tr><td colspan="10" class="group-3">${escapeHtml(yl.label)}</td></tr>
                      ${yl.rows
                        .map(
                          (row, i) => `
                            <tr>
                              <td class="num">${i + 1}.</td>
                              <td>${escapeHtml(row.stdnt_cno)}</td>
                              <td>${escapeHtml(legacyName(row))}</td>
                              <td>${escapeHtml(row.gender)}</td>
                              <td>${escapeHtml(formatDateMDY(row.date_of_birth))}</td>
                              <td>${escapeHtml(row.address)}</td>
                              <td>${escapeHtml(row.prior_school)}</td>
                              <td class="num">${escapeHtml(row.prior_school_year)}</td>
                              <td>${escapeHtml(row.father_name)}</td>
                              <td>${escapeHtml(row.mother_name)}</td>
                            </tr>`
                        )
                        .join("")}`
                  )
                  .join("")}`
            )
            .join("")}`
      )
      .join("")

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Enrollment Listing — ${escapeHtml(yearLabel)}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 1.5rem 2rem; color: #111; }
            ${LETTERHEAD_STYLE}
            h1 { font-size: 1.3rem; margin: 0.5rem 0 1rem; text-align: center; }
            .meta { text-align: center; color: #555; font-size: 0.85rem; margin-bottom: 1rem; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #999; padding: 0.3rem 0.5rem; font-size: 0.75rem; text-align: left; }
            th { background: #f3f3f3; }
            th.num, td.num { text-align: right; }
            td.group-1, td.group-2, td.group-3 { border-left: none; border-right: none; font-weight: bold; }
            td.group-1 { padding-left: 0.5rem; }
            td.group-2 { padding-left: 1.5rem; font-weight: normal; }
            td.group-3 { padding-left: 2.5rem; font-weight: normal; }
          </style>
        </head>
        <body>
          ${renderLetterhead(header)}
          <h1>Enrollment Listing</h1>
          <div class="meta">${escapeHtml(yearLabel)} — ${escapeHtml(programLabel)} — ${escapeHtml(curriculumLabelText)} — ${rows.length} student${rows.length === 1 ? "" : "s"}</div>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Student ID</th>
                <th>Name</th>
                <th>Gender</th>
                <th>Date Of Birth</th>
                <th>Address</th>
                <th>School Graduated</th>
                <th class="num">Year Graduated</th>
                <th>Father</th>
                <th>Mother</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    await waitForImagesToLoad(printWindow.document)
    printWindow.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-5xl sm:max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enrollment Listing</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-5 items-end pb-3">
          <div className="grid gap-1.5">
            <label htmlFor="enrollment-listing-school-year">School Year</label>
            <Select value={academicYear} onValueChange={(v) => setAcademicYear(v ?? "")}>
              <SelectTrigger id="enrollment-listing-school-year" className="w-48">
                <SelectValue placeholder="Select School Year" />
              </SelectTrigger>
              <SelectContent>
                {(academicYearsQuery.data ?? []).map((ay) => (
                  <SelectItem key={ay.name} value={ay.name}>
                    {formatAcademicYearLabel(ay.academic_year_name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="enrollment-listing-program">Course</label>
            <Select
              value={program}
              onValueChange={(v) => {
                setProgram(v ?? "")
                setCurriculum("")
              }}
            >
              <SelectTrigger id="enrollment-listing-program" className="w-56">
                <SelectValue placeholder="All Courses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Courses</SelectItem>
                {(programsQuery.data ?? []).map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.program_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="enrollment-listing-curriculum">Curriculum</label>
            <Select value={curriculum} onValueChange={(v) => setCurriculum(v ?? "")}>
              <SelectTrigger id="enrollment-listing-curriculum" className="w-48">
                <SelectValue placeholder="All Curricula" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Curricula</SelectItem>
                {(curriculumsQuery.data ?? []).map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {curriculumLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!academicYear ? (
          <p className="text-sm text-muted-foreground">Select a School Year to view the enrollment listing.</p>
        ) : enrollmentsQuery.isFetching ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No enrollment found for this School Year.</p>
        ) : (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              {rows.length} student{rows.length === 1 ? "" : "s"}
            </p>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Student No.</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Curriculum</TableHead>
                    <TableHead>Year Level</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enrollment Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.student_name}</TableCell>
                      <TableCell>{row.stdnt_cno ?? "—"}</TableCell>
                      <TableCell>{row.gender || "—"}</TableCell>
                      <TableCell>{row.program_name}</TableCell>
                      <TableCell>{row.curriculum ?? "—"}</TableCell>
                      <TableCell>{row.year_level ?? "—"}</TableCell>
                      <TableCell>{row.student_batch_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={row.sms_status === "Active" ? "secondary" : "outline"}>
                          {row.sms_status ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.enrollment_date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" disabled={rows.length === 0} onClick={handlePrint}>
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
