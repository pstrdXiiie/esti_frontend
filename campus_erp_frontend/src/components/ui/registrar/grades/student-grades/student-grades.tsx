"use client"

import { useQuery } from "@tanstack/react-query"

import { frappe } from "@/lib/frappe"
import { formatAcademicYearLabel } from "@/lib/utils"
import { LETTERHEAD_STYLE, renderLetterhead, usePrintHeader } from "@/lib/print-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { StudentOption } from "@/components/sms/StudentSearch"

const COLUMN_COUNT = 7

interface GradeRow {
  name: string
  student: string
  student_name: string
  course: string
  program: string
  course_name: string | null
  subject_code: string | null
  prelim: number | null
  midterm: number | null
  final: number | null
  final_rating: string | null
  status: string
  academic_year: string | null
  year_level: number | null
  semester: number | null
}

/** Escapes text before it's interpolated into the print window's
 * document.write'd HTML — same fix applied in official-transcript-of-records.tsx
 * relative to all-grades.tsx's own unescaped version. */
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

function sortRows(rows: GradeRow[]): GradeRow[] {
  return [...rows].sort((a, b) => {
    const year = (a.academic_year ?? "").localeCompare(b.academic_year ?? "")
    if (year !== 0) return year
    const semester = (a.semester ?? 0) - (b.semester ?? 0)
    if (semester !== 0) return semester
    return (a.course_name ?? "").localeCompare(b.course_name ?? "")
  })
}

/**
 * Read-only "this student's full grade history" viewer, opened from the Edit
 * Student dialog. Unlike All Grades' own per-row dialog — which deliberately
 * scopes to one year_level/semester (the term the clicked row belongs to) —
 * this calls campus_erp.api.registrar.list_grades with `student` alone, the
 * doctype's own documented "genuinely their FULL history across every term"
 * mode, since there's no term already in hand to scope by here.
 */
export function StudentGrades({
  open,
  onOpenChange,
  student,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fully controlled by the caller — this dialog has no student search of
   * its own, it always shows whichever student it was opened for. */
  student: StudentOption | null
}) {
  const gradesQuery = useQuery({
    queryKey: ["campus_erp.api.registrar.list_grades", "full-history", student?.name],
    queryFn: () => frappe.call<GradeRow[]>("campus_erp.api.registrar.list_grades", { student: student!.name }),
    enabled: open && !!student,
  })

  const rows = sortRows(gradesQuery.data ?? [])
  const notReadyMessage = gradesQuery.isLoading ? "Loading…" : null

  // Print-only: the school letterhead, not needed for the on-screen table.
  const printHeaderQuery = usePrintHeader(open)

  function handlePrint() {
    if (!student) return
    const printWindow = window.open("", "_blank", "width=1000,height=800")
    if (!printWindow) return

    const rowsHtml = rows
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(formatAcademicYearLabel(row.academic_year))}</td>
            <td>${escapeHtml(row.semester)}</td>
            <td>${escapeHtml(row.course_name)}</td>
            <td>${escapeHtml(row.subject_code)}</td>
            <td>${escapeHtml(row.prelim)}</td>
            <td>${escapeHtml(row.midterm)}</td>
            <td>${escapeHtml(row.final)}</td>
            <td>${escapeHtml(row.final_rating)}</td>
            <td>${escapeHtml(row.status)}</td>
          </tr>
        `
      )
      .join("")

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Grades — ${escapeHtml(student.student_name)}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 2rem; color: #111; }
            ${LETTERHEAD_STYLE}
            h1 { font-size: 1.25rem; margin-bottom: 1rem; }
            .details { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 1.5rem; margin-bottom: 1.5rem; }
            .details div { margin-bottom: 0.75rem; }
            .details span { display: block; font-size: 0.8rem; color: #555; }
            .details strong { font-size: 0.95rem; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 0.9rem; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          ${renderLetterhead(printHeaderQuery.data)}
          <h1>Grades</h1>
          <div class="details">
            <div><span>Student Number</span><strong>${escapeHtml(student.stdnt_cno)}</strong></div>
            <div><span>Student Name</span><strong>${escapeHtml(student.student_name)}</strong></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>School Year</th>
                <th>Sem</th>
                <th>Subject Name</th>
                <th>Subject Code</th>
                <th>Prelim</th>
                <th>Midterm</th>
                <th>Final</th>
                <th>Final Rating</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-full max-h-[85vh] max-w-3xl sm:max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Grades{student ? ` — ${student.student_name}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>School Year</TableHead>
                <TableHead>Sem</TableHead>
                <TableHead className="min-w-48">Subject</TableHead>
                <TableHead>Prelim</TableHead>
                <TableHead>Midterm</TableHead>
                <TableHead>Final</TableHead>
                <TableHead>Rating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!notReadyMessage &&
                rows.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell>{formatAcademicYearLabel(row.academic_year)}</TableCell>
                    <TableCell>{row.semester ?? "—"}</TableCell>
                    <TableCell className="min-w-48">
                      {row.course_name ?? "—"}
                      {row.subject_code && (
                        <span className="text-muted-foreground"> ({row.subject_code})</span>
                      )}
                    </TableCell>
                    <TableCell>{row.prelim ?? "—"}</TableCell>
                    <TableCell>{row.midterm ?? "—"}</TableCell>
                    <TableCell>{row.final ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "Completed" ? "secondary" : "outline"}>
                        {row.final_rating ?? row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              {!notReadyMessage && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} className="text-center text-muted-foreground">
                    No grades on file for this student.
                  </TableCell>
                </TableRow>
              )}
              {notReadyMessage && (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT} className="text-center text-muted-foreground">
                    {notReadyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

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

export default StudentGrades
