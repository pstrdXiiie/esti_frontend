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
  TableFooter,
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

interface StatisticsRow {
  program: string
  program_name: string
  year_level: number | null
  total: number
  [gender: string]: string | number | null
}

interface StatisticsResult {
  genders: string[]
  rows: StatisticsRow[]
  totals: Record<string, number>
}

interface EnrollmentStatisticsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Enrollment Statistics (Enrollment Reports tab): headcount per Program x
 * Year Level, broken down by whatever Gender values actually appear on the
 * enrolled students, for one Academic Year. Gender columns are derived from
 * the response rather than hardcoded, matching
 * campus_erp.api.registrar.get_enrollment_statistics's own dynamic shape.
 */
export function EnrollmentStatistics({ open, onOpenChange }: EnrollmentStatisticsProps) {
  const [academicYear, setAcademicYear] = useState("")
  const [program, setProgram] = useState("")

  const academicYearsQuery = useQuery({
    queryKey: ["Academic Year", "list", "enrollment-statistics"],
    queryFn: () =>
      frappe.list<AcademicYearRow>("Academic Year", {
        fields: ["name", "academic_year_name"],
        order_by: "year_start_date desc",
        limit_page_length: 50,
      }),
    enabled: open,
  })

  const programsQuery = useQuery({
    queryKey: ["Program", "list", "enrollment-statistics"],
    queryFn: () =>
      frappe.list<ProgramRow>("Program", {
        fields: ["name", "program_name"],
        limit_page_length: 100,
      }),
    enabled: open,
  })

  const statisticsQuery = useQuery({
    queryKey: ["enrollment-statistics", academicYear, program],
    queryFn: () =>
      frappe.call<StatisticsResult>("campus_erp.api.registrar.get_enrollment_statistics", {
        academic_year: academicYear,
        program: program || undefined,
      }),
    enabled: open && !!academicYear,
  })

  const genders = statisticsQuery.data?.genders ?? []
  const rows = statisticsQuery.data?.rows ?? []
  const totals = statisticsQuery.data?.totals

  const yearName = academicYearsQuery.data?.find((ay) => ay.name === academicYear)?.academic_year_name
  const yearLabel = yearName ? formatAcademicYearLabel(yearName) : academicYear
  const programLabel = program
    ? programsQuery.data?.find((p) => p.name === program)?.program_name ?? program
    : "All Programs"

  // Print-only: the school letterhead, not needed for the on-screen table.
  const printHeaderQuery = usePrintHeader(open)

  function handlePrint() {
    if (!totals) return

    const printWindow = window.open("", "_blank", "width=900,height=1000")
    if (!printWindow) {
      toast.error("Could not open the print window. Check your browser's popup blocker.")
      return
    }

    const genderHeadCells = genders.map((g) => `<th class="num">${escapeHtml(g)}</th>`).join("")
    const bodyRows = rows
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.program_name)}</td>
            <td>${escapeHtml(row.year_level)}</td>
            ${genders.map((g) => `<td class="num">${escapeHtml(row[g] ?? 0)}</td>`).join("")}
            <td class="num">${escapeHtml(row.total)}</td>
          </tr>`
      )
      .join("")
    const totalCells = genders.map((g) => `<td class="num">${escapeHtml(totals[g] ?? 0)}</td>`).join("")

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Enrollment Statistics — ${escapeHtml(yearLabel)}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 2rem; color: #111; }
            ${LETTERHEAD_STYLE}
            h1 { font-size: 1.25rem; margin-bottom: 0.25rem; text-align: center; }
            .meta { text-align: center; color: #555; font-size: 0.85rem; margin-bottom: 1.5rem; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; font-size: 0.85rem; text-align: left; }
            th { background: #f3f3f3; }
            th.num, td.num { text-align: right; }
            tfoot td { font-weight: 600; background: #f9f9f9; }
          </style>
        </head>
        <body>
          ${renderLetterhead(printHeaderQuery.data)}
          <h1>Enrollment Statistics</h1>
          <div class="meta">${escapeHtml(yearLabel)} — ${escapeHtml(programLabel)}</div>
          <table>
            <thead>
              <tr>
                <th>Program</th>
                <th>Year Level</th>
                ${genderHeadCells}
                <th class="num">Total</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
            <tfoot>
              <tr>
                <td colspan="2">Total</td>
                ${totalCells}
                <td class="num">${escapeHtml(totals.total)}</td>
              </tr>
            </tfoot>
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
      <DialogContent className="w-full max-w-4xl sm:max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enrollment Statistics</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-5 items-end pb-3">
          <div className="grid gap-1.5">
            <label htmlFor="enrollment-statistics-school-year">School Year</label>
            <Select value={academicYear} onValueChange={(v) => setAcademicYear(v ?? "")}>
              <SelectTrigger id="enrollment-statistics-school-year" className="w-48">
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
            <label htmlFor="enrollment-statistics-program">Program</label>
            <Select value={program} onValueChange={(v) => setProgram(v ?? "")}>
              <SelectTrigger id="enrollment-statistics-program" className="w-56">
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
          <p className="text-sm text-muted-foreground">Select a School Year to view enrollment statistics.</p>
        ) : statisticsQuery.isFetching ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No enrollment found for this School Year.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Program</TableHead>
                  <TableHead>Year Level</TableHead>
                  {genders.map((g) => (
                    <TableHead key={g} className="text-right">
                      {g}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.program}::${row.year_level}`}>
                    <TableCell className="font-medium">{row.program_name}</TableCell>
                    <TableCell>{row.year_level ?? "—"}</TableCell>
                    {genders.map((g) => (
                      <TableCell key={g} className="text-right">
                        {row[g] ?? 0}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium">{row.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {totals && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2}>Total</TableCell>
                    {genders.map((g) => (
                      <TableCell key={g} className="text-right">
                        {totals[g] ?? 0}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">{totals.total}</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
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
