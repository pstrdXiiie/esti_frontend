"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"

import { frappe } from "@/lib/frappe"
import { formatAcademicYearLabel } from "@/lib/utils"
import { LETTERHEAD_STYLE, renderLetterhead, usePrintHeader } from "@/lib/print-header"
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

interface AcademicTermRow {
  name: string
  term_name: string
}

interface EnrolledSubject {
  course: string
  course_name: string
  subject_code: string | null
  unit: number
  status: string
  is_nstp_or_ms: boolean
}

interface EnrollmentRow {
  name: string
  student: string
  student_name: string
  first_name: string | null
  middle_name: string | null
  last_name: string | null
  gender: string | null
  program: string
  program_name: string
  academic_term: string | null
  year_level: number | null
  student_batch_name: string | null
  subjects: EnrolledSubject[]
  total_units: number
}

interface EnrollmentListingWithSubjectsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function subjectLabel(subject: EnrolledSubject): string {
  return subject.subject_code ? `${subject.subject_code} — ${subject.course_name}` : subject.course_name
}

/** "Last, First M." — the legacy Enrollment List's own name format, built
 * from Student's first/middle/last name rather than the freeform
 * student_name, so it comes out consistently regardless of how student_name
 * itself happens to be entered. Falls back to student_name if the split
 * name fields aren't on file (e.g. an older or hand-entered record). */
function legacyName(row: EnrollmentRow): string {
  const last = row.last_name?.trim()
  const first = row.first_name?.trim()
  if (!last && !first) return row.student_name
  const middle = row.middle_name?.trim()
  const middleInitial = middle && middle !== "-" ? ` ${middle.charAt(0).toUpperCase()}.` : ""
  return [last, first].filter(Boolean).join(", ") + middleInitial
}

function sexLetter(gender: string | null): string {
  return gender ? gender.charAt(0).toUpperCase() : "—"
}

interface EnrollmentGroup {
  program_name: string
  year_level: number | null
  section: string | null
  academic_term: string | null
  rows: EnrollmentRow[]
}

/** Groups the flat roster by (Program, Year Level, Section, Term) — the
 * legacy Enrollment List prints one class section at a time, each with its
 * own header block, so a roster spanning multiple sections/year levels
 * becomes one such block per group rather than one shared header that
 * can't describe them all. */
function groupForPrint(rows: EnrollmentRow[]): EnrollmentGroup[] {
  const groups = new Map<string, EnrollmentGroup>()
  for (const row of rows) {
    const key = `${row.program}::${row.year_level}::${row.student_batch_name}::${row.academic_term}`
    let group = groups.get(key)
    if (!group) {
      group = {
        program_name: row.program_name,
        year_level: row.year_level,
        section: row.student_batch_name,
        academic_term: row.academic_term,
        rows: [],
      }
      groups.set(key, group)
    }
    group.rows.push(row)
  }
  return Array.from(groups.values())
}

/**
 * Enrollment Listing with Subjects (Enrollment Reports tab): the same
 * roster as Enrollment Listing, with each student's currently-enrolled
 * subjects (and total units) attached — a registrar-facing "who's taking
 * what" listing, distinct from All Grades (Grades tab), which is per-subject
 * and grade-entry focused rather than per-student.
 */
export function EnrollmentListingWithSubjects({ open, onOpenChange }: EnrollmentListingWithSubjectsProps) {
  const [academicYear, setAcademicYear] = useState("")
  const [program, setProgram] = useState("")

  const academicYearsQuery = useQuery({
    queryKey: ["Academic Year", "list", "enrollment-listing-with-subjects"],
    queryFn: () =>
      frappe.list<AcademicYearRow>("Academic Year", {
        fields: ["name", "academic_year_name"],
        order_by: "year_start_date desc",
        limit_page_length: 50,
      }),
    enabled: open,
  })

  const programsQuery = useQuery({
    queryKey: ["Program", "list", "enrollment-listing-with-subjects"],
    queryFn: () =>
      frappe.list<ProgramRow>("Program", {
        fields: ["name", "program_name"],
        limit_page_length: 100,
      }),
    enabled: open,
  })

  const enrollmentsQuery = useQuery({
    queryKey: ["enrollment-listing-with-subjects", academicYear, program],
    queryFn: () =>
      frappe.call<EnrollmentRow[]>("campus_erp.api.registrar.list_enrollments_with_subjects", {
        academic_year: academicYear,
        program: program || undefined,
      }),
    enabled: open && !!academicYear,
  })

  // Print-only: the school letterhead and this year's Academic Terms (to
  // print a term's friendly term_name instead of its raw doctype name).
  // Neither is needed for the on-screen table, only fetched once the
  // dialog is actually open.
  const printHeaderQuery = usePrintHeader(open)

  const academicTermsQuery = useQuery({
    queryKey: ["Academic Term", "list", "enrollment-listing-with-subjects", academicYear],
    queryFn: () =>
      frappe.list<AcademicTermRow>("Academic Term", {
        fields: ["name", "term_name"],
        filters: [["academic_year", "=", academicYear]],
        limit_page_length: 50,
      }),
    enabled: open && !!academicYear,
  })

  const rows = enrollmentsQuery.data ?? []

  const yearName = academicYearsQuery.data?.find((ay) => ay.name === academicYear)?.academic_year_name
  const yearLabel = yearName ? formatAcademicYearLabel(yearName) : academicYear

  function handlePrint() {
    const printWindow = window.open("", "_blank", "width=1100,height=1000")
    if (!printWindow) {
      toast.error("Could not open the print window. Check your browser's popup blocker.")
      return
    }

    const termNameByValue = new Map((academicTermsQuery.data ?? []).map((t) => [t.name, t.term_name]))

    const groups = groupForPrint(rows)
    const pages = groups
      .map((group, index) => {
        const courseSection = group.section
          ? `${group.program_name}-${group.section}`
          : group.year_level
            ? `${group.program_name}-${group.year_level}`
            : group.program_name
        const termLabel = group.academic_term ? termNameByValue.get(group.academic_term) ?? group.academic_term : "—"
        const maxSubjects = Math.max(...group.rows.map((r) => r.subjects.length), 0)

        const subjectHeadCells = Array.from(
          { length: maxSubjects },
          () => `<th>Subject</th><th class="num">Units</th>`
        ).join("")

        const bodyRows = group.rows
          .map((row, rowIndex) => {
            const subjectCells = Array.from({ length: maxSubjects }, (_, i) => {
              const subject = row.subjects[i]
              if (!subject) return `<td></td><td class="num"></td>`
              const unitLabel = subject.is_nstp_or_ms ? `(${escapeHtml(subject.unit)})` : escapeHtml(subject.unit)
              return `<td>${escapeHtml(subject.subject_code ?? subject.course_name)}</td><td class="num">${unitLabel}</td>`
            }).join("")
            return `
              <tr>
                <td class="num">${rowIndex + 1}.</td>
                <td>${escapeHtml(legacyName(row))}</td>
                <td class="num">${escapeHtml(sexLetter(row.gender))}</td>
                ${subjectCells}
                <td class="num">${escapeHtml(row.total_units)}</td>
              </tr>`
          })
          .join("")

        return `
          <section${index < groups.length - 1 ? ' class="page-break"' : ""}>
            <div class="report-header">
              <div><span class="label">COURSE</span>${escapeHtml(courseSection)}</div>
              <div><span class="label">YEARLEVEL</span>${escapeHtml(group.year_level)}</div>
              <div><span class="label">TERM</span>${escapeHtml(termLabel)}</div>
              <div><span class="label">SCHOOLYEAR</span>${escapeHtml(yearLabel)}</div>
            </div>
            <h2>${escapeHtml(courseSection)}</h2>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Sex</th>
                  ${subjectHeadCells}
                  <th class="num">Total Units</th>
                </tr>
              </thead>
              <tbody>${bodyRows}</tbody>
            </table>
          </section>`
      })
      .join("")

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Enrollment List — ${escapeHtml(yearLabel)}</title>
          <style>
            body { font-family: "Times New Roman", Times, serif; padding: 1.5rem 2rem; color: #111; }
            ${LETTERHEAD_STYLE}
            h1 { font-size: 1.4rem; margin: 0 0 1.25rem; text-align: center; font-variant: small-caps; letter-spacing: 0.05em; }
            h2 { font-size: 0.95rem; margin: 0.75rem 0 0.5rem; text-align: center; }
            .report-header { display: flex; gap: 2rem; font-size: 0.85rem; }
            .report-header .label { display: inline-block; min-width: 6.5rem; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
            th, td { border: 1px solid #333; padding: 0.25rem 0.5rem; font-size: 0.8rem; text-align: left; }
            th { background: #f3f3f3; }
            th.num, td.num { text-align: right; }
            .page-break { display: block; page-break-after: always; }
          </style>
        </head>
        <body>
          ${renderLetterhead(printHeaderQuery.data)}
          <h1>Enrollment List</h1>
          ${pages}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-5xl sm:max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enrollment Listing with Subjects</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-5 items-end pb-3">
          <div className="grid gap-1.5">
            <label htmlFor="enrollment-listing-subjects-school-year">School Year</label>
            <Select value={academicYear} onValueChange={(v) => setAcademicYear(v ?? "")}>
              <SelectTrigger id="enrollment-listing-subjects-school-year" className="w-48">
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
            <label htmlFor="enrollment-listing-subjects-program">Program</label>
            <Select value={program} onValueChange={(v) => setProgram(v ?? "")}>
              <SelectTrigger id="enrollment-listing-subjects-program" className="w-56">
                <SelectValue placeholder="All Programs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Programs</SelectItem>
                {(programsQuery.data ?? []).map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.program_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!academicYear ? (
          <p className="text-sm text-muted-foreground">Select a School Year to view enrolled subjects.</p>
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
                    <TableHead>Program</TableHead>
                    <TableHead>Year Level</TableHead>
                    <TableHead>Subjects</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium align-top">{row.student_name}</TableCell>
                      <TableCell className="align-top">{row.program_name}</TableCell>
                      <TableCell className="align-top">{row.year_level ?? "—"}</TableCell>
                      <TableCell className="align-top">
                        {row.subjects.length === 0 ? (
                          <span className="text-muted-foreground">No subjects</span>
                        ) : (
                          <div className="grid gap-0.5">
                            {row.subjects.map((s) => (
                              <span key={s.course}>{subjectLabel(s)}</span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right align-top font-medium">{row.total_units}</TableCell>
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
