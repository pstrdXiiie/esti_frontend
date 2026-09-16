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

const LEVELS = ["College", "Vocational", "High School"] as const
type Level = (typeof LEVELS)[number]

// The legacy report's own header label per Level (frmPrintReport's
// sProgram / rptEnrollmentSummary's Text2) — printed as-is for parity.
const LEVEL_PRINT_LABEL: Record<Level, string> = {
  College: "CHED COURSES",
  Vocational: "TESDA COURSES",
  "High School": "DEPED",
}

interface AcademicYearRow {
  name: string
  academic_year_name: string
}

interface AcademicTermRow {
  name: string
  term_name: string
}

interface SummaryRow {
  program: string
  program_name: string
  year_level: number | null
  male: number
  female: number
  total: number
}

interface SummaryResult {
  level: Level
  rows: SummaryRow[]
  totals: { male: number; female: number; total: number }
}

interface EnrollmentSummaryProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Enrollment Summary (Enrollment Reports tab): headcount per Program x Year
 * Level, split Male/Female/Total, for one enrollment Level (College/
 * Vocational/High School) — a like-for-like port of the legacy VB system's
 * frmEnrollmentSummary + qry_EnrollmentSummary report (recovered from the
 * old SchoolManagementSystem-ESTI project and its esti_gloria SQL Server
 * backup). Distinct from Enrollment Statistics, which shows every Program
 * together with an open-ended set of Gender columns and no Level concept —
 * this report's whole identity is the Level split the legacy one had.
 */
export function EnrollmentSummary({ open, onOpenChange }: EnrollmentSummaryProps) {
  const [academicYear, setAcademicYear] = useState("")
  const [level, setLevel] = useState<Level>("College")
  const [academicTerm, setAcademicTerm] = useState("")

  const academicYearsQuery = useQuery({
    queryKey: ["Academic Year", "list", "enrollment-summary"],
    queryFn: () =>
      frappe.list<AcademicYearRow>("Academic Year", {
        fields: ["name", "academic_year_name"],
        order_by: "year_start_date desc",
        limit_page_length: 50,
      }),
    enabled: open,
  })

  const academicTermsQuery = useQuery({
    queryKey: ["Academic Term", "list", "enrollment-summary", academicYear],
    queryFn: () =>
      frappe.list<AcademicTermRow>("Academic Term", {
        fields: ["name", "term_name"],
        filters: [["academic_year", "=", academicYear]],
        limit_page_length: 50,
      }),
    enabled: open && !!academicYear,
  })

  const summaryQuery = useQuery({
    queryKey: ["enrollment-summary", academicYear, level, academicTerm],
    queryFn: () =>
      frappe.call<SummaryResult>("campus_erp.api.registrar.get_enrollment_summary", {
        academic_year: academicYear,
        level,
        academic_term: academicTerm || undefined,
      }),
    enabled: open && !!academicYear,
  })

  const rows = summaryQuery.data?.rows ?? []
  const totals = summaryQuery.data?.totals

  const yearName = academicYearsQuery.data?.find((ay) => ay.name === academicYear)?.academic_year_name
  const yearLabel = yearName ? formatAcademicYearLabel(yearName) : academicYear
  const termLabel = academicTerm
    ? academicTermsQuery.data?.find((t) => t.name === academicTerm)?.term_name ?? academicTerm
    : "All Terms"

  // Print-only: the school letterhead, not needed for the on-screen table.
  const printHeaderQuery = usePrintHeader(open)

  function handlePrint() {
    if (!totals) return

    const printWindow = window.open("", "_blank", "width=900,height=1000")
    if (!printWindow) {
      toast.error("Could not open the print window. Check your browser's popup blocker.")
      return
    }

    const bodyRows = rows
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.program_name)}</td>
            <td class="num">${escapeHtml(row.year_level)}</td>
            <td class="num">${escapeHtml(row.male)}</td>
            <td class="num">${escapeHtml(row.female)}</td>
            <td class="num">${escapeHtml(row.total)}</td>
          </tr>`
      )
      .join("")

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Enrollment Summary — ${escapeHtml(yearLabel)}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 2rem; color: #111; }
            ${LETTERHEAD_STYLE}
            h1 { font-size: 1.25rem; margin-bottom: 0.25rem; text-align: center; }
            h2 { font-size: 1rem; margin: 0 0 0.25rem; text-align: center; }
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
          <h1>Enrollment Summary</h1>
          <h2>${escapeHtml(LEVEL_PRINT_LABEL[level])}</h2>
          <div class="meta">${escapeHtml(yearLabel)} — ${escapeHtml(termLabel)}</div>
          <table>
            <thead>
              <tr>
                <th>Program</th>
                <th class="num">Year Level</th>
                <th class="num">Male</th>
                <th class="num">Female</th>
                <th class="num">Total</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td></td>
                <td class="num">${escapeHtml(totals.male)}</td>
                <td class="num">${escapeHtml(totals.female)}</td>
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
      <DialogContent className="w-full max-w-3xl sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enrollment Summary</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-5 items-end pb-3">
          <div className="grid gap-1.5">
            <label htmlFor="enrollment-summary-level">Level</label>
            <Select value={level} onValueChange={(v) => setLevel((v as Level) ?? "College")}>
              <SelectTrigger id="enrollment-summary-level" className="w-40">
                <SelectValue placeholder="Select Level" />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="enrollment-summary-school-year">School Year</label>
            <Select value={academicYear} onValueChange={(v) => setAcademicYear(v ?? "")}>
              <SelectTrigger id="enrollment-summary-school-year" className="w-48">
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
            <label htmlFor="enrollment-summary-term">Term</label>
            <Select value={academicTerm} onValueChange={(v) => setAcademicTerm(v ?? "")}>
              <SelectTrigger id="enrollment-summary-term" className="w-40">
                <SelectValue placeholder="All Terms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Terms</SelectItem>
                {(academicTermsQuery.data ?? []).map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    {t.term_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!academicYear ? (
          <p className="text-sm text-muted-foreground">Select a School Year to view the enrollment summary.</p>
        ) : summaryQuery.isFetching ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No {level} enrollment found for this School Year.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Program</TableHead>
                  <TableHead className="text-right">Year Level</TableHead>
                  <TableHead className="text-right">Male</TableHead>
                  <TableHead className="text-right">Female</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.program}::${row.year_level}`}>
                    <TableCell className="font-medium">{row.program_name}</TableCell>
                    <TableCell className="text-right">{row.year_level ?? "—"}</TableCell>
                    <TableCell className="text-right">{row.male}</TableCell>
                    <TableCell className="text-right">{row.female}</TableCell>
                    <TableCell className="text-right font-medium">{row.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {totals && (
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell />
                    <TableCell className="text-right">{totals.male}</TableCell>
                    <TableCell className="text-right">{totals.female}</TableCell>
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
