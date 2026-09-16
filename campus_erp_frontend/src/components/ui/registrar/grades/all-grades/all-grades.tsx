"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { frappe, getErrorMessage } from "@/lib/frappe"
import { LETTERHEAD_STYLE, renderLetterhead, usePrintHeader } from "@/lib/print-header"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatAcademicYearLabel } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** Escapes text before it's interpolated into the print window's
 * document.write'd HTML — this print call site had no escaping at all
 * (student_name/course_name/etc. going straight into the HTML string),
 * unlike every other print output in the app; fixed to match
 * student-grades.tsx's own copy of this same helper. */
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

interface GradeRow {
  name: string
  student: string
  student_name: string
  course: string
  program: string
  program_enrollment: string
  student_group: string
  prelim: number | null
  midterm: number | null
  final: number | null
  final_rating: string | null
  grade_remarks: string | null
  points: number | null
  status: string
  course_name: string
  subject_code: string | null
  academic_year: string
  academic_term: string
  student_status: string
  stdnt_cno: string | null
  year_level: number | null
  semester: number | null
}

interface SelectedStudent {
  name: string
  student_name: string
  stdnt_cno: string | null
  program: string
  year_level: number | null
  semester: number | null
  academic_year: string
}

const COLUMN_COUNT = 5
const DETAIL_COLUMN_COUNT = 6

// "status" lives on Course Enrollment (one per subject), so collapsing to
// one row per student needs a rule for picking a single overall value:
// prefer "Enrolled" (still in progress) over "Dropped" (needs attention)
// over "Completed", so a student with any active subject still reads as
// enrolled.
const STATUS_PRIORITY: Record<string, number> = {
  Enrolled: 0,
  Dropped: 1,
  Completed: 2,
}

// Empty means "clear this grade" (matches save_grades' None semantics);
// anything else must parse to a finite number — left unguarded, a stray "-",
// ".", or "1e" (all valid intermediate states for a number input, so the
// browser won't block them) would coerce via Number() to NaN, which
// JSON.stringify silently turns into `null`, clearing the grade instead of
// surfacing a validation error.
function parseNumericGrade(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === "") return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    throw new Error(`"${trimmed}" is not a valid number`)
  }
  return parsed
}

/**
 * All Grades tab: every grade record on file, filterable by School Year and
 * (optionally) Program, via campus_erp.api.registrar.list_grades. Purely a
 * read-only report — no search gate, it loads on mount and re-filters as the
 * two Selects change, in the spirit of the other Grades tabs.
 */
export default function AllGrades() {
  const [academicYear, setAcademicYear] = useState("")
  const [program, setProgram] = useState("")
  const [search, setSearch] = useState("")
  const [selectedStudent, setSelectedStudent] = useState<SelectedStudent | null>(null)

  // Print-only: the school letterhead, gated the same way the per-student
  // print dialog itself is (a selected student, not an `open` prop — this
  // page has no such prop of its own).
  const printHeaderQuery = usePrintHeader(!!selectedStudent)
  const [editedGrades, setEditedGrades] = useState<
    Record<string, { prelim: string; midterm: string; final: string; final_rating: string }>
  >({})
  const queryClient = useQueryClient()

  const academicYearsQuery = useQuery({
    queryKey: ["Academic Year", "list", "all-grades"],
    queryFn: () =>
      frappe.list<AcademicYearRow>("Academic Year", {
        fields: ["name", "academic_year_name"],
        order_by: "year_start_date desc",
        limit_page_length: 50,
      }),
  })

  const academicYears = academicYearsQuery.data ?? []

  // Default academicYear to the most recent Academic Year the first time the
  // list has loaded, without a useEffect: React explicitly supports
  // adjusting state during rendering (see "Adjusting state when a prop
  // changes" in the React docs) — the guard against `defaultedAcademicYear`
  // makes this a one-time correction, not a render loop. Same pattern as
  // transferee-evaluation.tsx / admission-requirement.tsx.
  const [defaultedAcademicYear, setDefaultedAcademicYear] = useState(false)
  if (!defaultedAcademicYear && academicYearsQuery.isSuccess && academicYears.length > 0) {
    setDefaultedAcademicYear(true)
    setAcademicYear(academicYears[0].name)
  }

  const programsQuery = useQuery({
    queryKey: ["Program", "list", "all-grades"],
    queryFn: () =>
      frappe.list<ProgramRow>("Program", {
        fields: ["name", "program_name"],
        limit_page_length: 100,
      }),
  })

  const gradesQuery = useQuery({
    queryKey: ["all-grades", academicYear, program],
    queryFn: () =>
      frappe.call<GradeRow[]>("campus_erp.api.registrar.list_grades", {
        academic_year: academicYear || undefined,
        program: program || undefined,
      }),
  })

  const rows = gradesQuery.data ?? []

  // Client-side, on top of the already-loaded (School Year/Program-filtered)
  // rows — searching by name or control number doesn't need its own server
  // round trip since the dataset here is already bounded. Clicking a
  // student's name (below) just sets this same search box, reusing this one
  // filter path to "view all of their grades on all subjects" instead of
  // building a separate drill-down view.
  const trimmedSearch = search.trim().toLowerCase()
  const filteredRows = trimmedSearch
    ? rows.filter(
        (row) =>
          row.student_name.toLowerCase().includes(trimmedSearch) ||
          (row.stdnt_cno ?? "").toLowerCase().includes(trimmedSearch)
      )
    : rows

  // Collapse the per-subject grade records down to one row per student per
  // enrollment period (student + Course + School Year) — the table reports
  // enrollment status, not individual subject grades, so a student taking
  // 4 subjects should read as 1 row, not 4.
  const studentRows = Array.from(
    filteredRows
      .reduce((byStudent, row) => {
        const key = `${row.student}::${row.program}::${row.academic_year}`
        const existing = byStudent.get(key)
        if (
          !existing ||
          (STATUS_PRIORITY[row.status] ?? 99) <
            (STATUS_PRIORITY[existing.status] ?? 99)
        ) {
          byStudent.set(key, row)
        }
        return byStudent
      }, new Map<string, GradeRow>())
      .values()
  )

  // Same "always show the table shell" treatment as the rest of the Grades
  // tab: one not-ready message drives the placeholder row instead of hiding
  // the whole table until data has loaded. This view has no external gate
  // like a student search, so zero rows for a given filter combo is a normal
  // (not "not ready") outcome once loaded.
  const notReadyMessage = gradesQuery.isLoading ? "Loading…" : null
  const isReady = notReadyMessage === null

  // The dialog shows every subject the clicked student took in that ONE
  // semester — scoped by the year_level/semester carried on the clicked
  // row's own Course Enrollment (derived server-side at enroll() time from
  // the program's curriculum), not the student's full multi-term history.
  const studentGradesQuery = useQuery({
    queryKey: [
      "all-grades",
      "student",
      selectedStudent?.name,
      selectedStudent?.year_level,
      selectedStudent?.semester,
    ],
    queryFn: () =>
      frappe.call<GradeRow[]>("campus_erp.api.registrar.list_grades", {
        student: selectedStudent!.name,
        year_level: selectedStudent!.year_level,
        semester: selectedStudent!.semester,
      }),
    enabled: !!selectedStudent,
  })

  const studentGrades = studentGradesQuery.data ?? []

  // Each row's editable draft, defaulting to its last-fetched values until
  // the registrar types something — so unedited rows read as unchanged
  // (isRowDirty below) without needing to seed editedGrades on load.
  function draftFor(row: GradeRow) {
    return (
      editedGrades[row.name] ?? {
        prelim: row.prelim?.toString() ?? "",
        midterm: row.midterm?.toString() ?? "",
        final: row.final?.toString() ?? "",
        final_rating: row.final_rating ?? "",
      }
    )
  }

  function updateGradeField(
    row: GradeRow,
    field: "prelim" | "midterm" | "final" | "final_rating",
    value: string
  ) {
    // Bases the merge on `prev`, not the outer `editedGrades` (via
    // draftFor) — two field edits on the same row landing in one React
    // batch must both survive, not have the second overwrite the first.
    setEditedGrades((prev) => {
      const base = prev[row.name] ?? {
        prelim: row.prelim?.toString() ?? "",
        midterm: row.midterm?.toString() ?? "",
        final: row.final?.toString() ?? "",
        final_rating: row.final_rating ?? "",
      }
      return { ...prev, [row.name]: { ...base, [field]: value } }
    })
  }

  function isRowDirty(row: GradeRow) {
    const draft = editedGrades[row.name]
    if (!draft) return false
    return (
      draft.prelim !== (row.prelim?.toString() ?? "") ||
      draft.midterm !== (row.midterm?.toString() ?? "") ||
      draft.final !== (row.final?.toString() ?? "") ||
      draft.final_rating !== (row.final_rating ?? "")
    )
  }

  const dirtyGradeRows = studentGrades.filter(isRowDirty)

  // One row = one Course Enrollment document, so "Save Grades" fires one
  // save_grades RPC per changed row rather than a single batch call — there's
  // no parent doc to batch these under (unlike the child-table shape
  // ChildTableGrid handles elsewhere). Promise.allSettled (not .all), and
  // per-row validation before any call goes out, so one bad/failing row
  // neither blocks nor hides that the other rows did save.
  const saveGradesMutation = useMutation({
    mutationFn: async () => {
      const rowsToSave = dirtyGradeRows
      const invalid: Array<{ row: GradeRow; error: string }> = []
      const toSubmit: Array<{ row: GradeRow; payload: Record<string, unknown> }> = []

      for (const row of rowsToSave) {
        const draft = draftFor(row)
        try {
          toSubmit.push({
            row,
            payload: {
              course_enrollment: row.name,
              prelim: parseNumericGrade(draft.prelim),
              midterm: parseNumericGrade(draft.midterm),
              final: parseNumericGrade(draft.final),
              final_rating: draft.final_rating.trim() === "" ? null : draft.final_rating.trim(),
            },
          })
        } catch (error) {
          invalid.push({ row, error: error instanceof Error ? error.message : "Invalid value" })
        }
      }

      const results = await Promise.allSettled(
        toSubmit.map((p) => frappe.call("campus_erp.api.registrar.save_grades", p.payload))
      )

      const saved: string[] = []
      const failed: Array<{ row: GradeRow; error: unknown }> = []
      results.forEach((result, i) => {
        if (result.status === "fulfilled") saved.push(toSubmit[i].row.name)
        else failed.push({ row: toSubmit[i].row, error: result.reason })
      })

      return { saved, failed, invalid }
    },
    onSuccess: async ({ saved, failed, invalid }) => {
      if (saved.length > 0) {
        // Refetch before clearing local drafts for just the saved rows, so
        // draftFor reads the freshly-saved value immediately instead of
        // briefly reverting to the pre-edit one while the refetch is still
        // in flight.
        await queryClient.invalidateQueries({ queryKey: ["all-grades"] })
        setEditedGrades((prev) => {
          const next = { ...prev }
          for (const name of saved) delete next[name]
          return next
        })
      }

      const problems = [
        ...invalid.map((p) => `${p.row.course_name}: ${p.error}`),
        ...failed.map((f) => `${f.row.course_name}: ${getErrorMessage(f.error)}`),
      ]

      if (problems.length === 0) {
        toast.success("Grades saved")
      } else if (saved.length === 0) {
        toast.error(problems.join("; "))
      } else {
        toast.error(
          `Saved ${saved.length} of ${saved.length + problems.length} subjects. ${problems.join("; ")}`
        )
      }
    },
    onError: (error) => toast.error(`Could not save grades: ${getErrorMessage(error)}`),
  })

  function handlePrintStudent() {
    if (!selectedStudent) return
    const printWindow = window.open("", "_blank", "width=1000,height=800")
    if (!printWindow) return

    const rowsHtml = studentGrades
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.course_name)}</td>
            <td>${escapeHtml(row.subject_code)}</td>
            <td>${escapeHtml(row.prelim)}</td>
            <td>${escapeHtml(row.midterm)}</td>
            <td>${escapeHtml(row.final)}</td>
            <td>${escapeHtml(row.final_rating)}</td>
          </tr>
        `
      )
      .join("")

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Grades — ${escapeHtml(selectedStudent.student_name)}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 2rem; color: #111; }
            ${LETTERHEAD_STYLE}
            h1 { font-size: 1.25rem; margin-bottom: 1rem; }
            .details { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 1.5rem; margin-bottom: 1.5rem; }
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
          <h1>Student Grades</h1>
          <div class="details">
            <div><span>Student Number</span><strong>${escapeHtml(selectedStudent.stdnt_cno)}</strong></div>
            <div><span>Course</span><strong>${escapeHtml(selectedStudent.program)}</strong></div>
            <div><span>Semester</span><strong>${escapeHtml(selectedStudent.semester)}</strong></div>
            <div><span>Student Name</span><strong>${escapeHtml(selectedStudent.student_name)}</strong></div>
            <div><span>Year Level</span><strong>${escapeHtml(selectedStudent.year_level)}</strong></div>
            <div><span>School Year</span><strong>${escapeHtml(formatAcademicYearLabel(selectedStudent.academic_year))}</strong></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Subject Name</th>
                <th>Subject Code</th>
                <th>Prelim</th>
                <th>Midterm</th>
                <th>Final</th>
                <th>Final Rating</th>
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
    <div className="rounded-2xl border border-border h-full p-7 print:h-auto print:border-0 print:p-0">
      <div className="flex flex-wrap gap-5 items-end pb-5 print:hidden">
        <div className="grid gap-1.5">
          <label htmlFor="all-grades-school-year">School Year</label>
          <Select
            value={academicYear}
            onValueChange={(v) => setAcademicYear(v ?? "")}
          >
            <SelectTrigger id="all-grades-school-year" className="w-48">
              <SelectValue placeholder="Select School Year" />
            </SelectTrigger>
            <SelectContent>
              {academicYears.map((ay) => (
                <SelectItem key={ay.name} value={ay.name}>
                  {formatAcademicYearLabel(ay.academic_year_name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="all-grades-program">Course</label>
          <Select value={program} onValueChange={(v) => setProgram(v ?? "")}>
            <SelectTrigger id="all-grades-program" className="w-56">
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
          <label htmlFor="all-grades-search">Student Name or Number</label>
          <Input
            id="all-grades-search"
            className="w-64"
            placeholder="Search student…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border print:overflow-visible print:border-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">Student</TableHead>
              <TableHead className="max-w-56">Course</TableHead>
              <TableHead>School Year</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Student Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isReady &&
              studentRows.map((row) => (
                <TableRow
                  key={row.name}
                  className="cursor-pointer hover:bg-muted/50 print:pointer-events-none"
                  onClick={() => {
                    setEditedGrades({})
                    setSelectedStudent({
                      name: row.student,
                      student_name: row.student_name,
                      stdnt_cno: row.stdnt_cno,
                      program: row.program,
                      year_level: row.year_level,
                      semester: row.semester,
                      academic_year: row.academic_year,
                    })
                  }}
                  title="View all grades for this student"
                >
                  <TableCell className="font-medium min-w-48">
                    {row.student_name}
                  </TableCell>
                  <TableCell className="max-w-56 truncate" title={row.program}>
                    {row.program}
                  </TableCell>
                  <TableCell>{formatAcademicYearLabel(row.academic_year)}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "Completed" ? "secondary" : "outline"}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={row.student_status === "Active" ? "secondary" : "outline"}
                    >
                      {row.student_status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            {isReady && studentRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="text-muted-foreground text-center"
                >
                  {trimmedSearch
                    ? "No grades found for this student."
                    : "No grades found for these filters."}
                </TableCell>
              </TableRow>
            )}
            {!isReady && (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="text-muted-foreground text-center"
                >
                  {notReadyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!selectedStudent}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedStudent(null)
            setEditedGrades({})
          }
        }}
      >
        <DialogContent className="w-full max-w-3xl sm:max-w-3xl print:hidden">
          <DialogHeader>
            <DialogTitle>Student Grades</DialogTitle>
            <DialogDescription className="sr-only">
              Grades for {selectedStudent?.student_name} for the selected
              semester
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-x-6 gap-y-3 pb-2">
            <div>
              <div className="text-sm text-muted-foreground">Student Number</div>
              <div className="font-medium">{selectedStudent?.stdnt_cno ?? "—"}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Course</div>
              <div className="font-medium">{selectedStudent?.program ?? "—"}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Semester</div>
              <div className="font-medium">{selectedStudent?.semester ?? "—"}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Student Name</div>
              <div className="font-medium">{selectedStudent?.student_name}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Year Level</div>
              <div className="font-medium">{selectedStudent?.year_level ?? "—"}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">School Year</div>
              <div className="font-medium">{formatAcademicYearLabel(selectedStudent?.academic_year)}</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject Name</TableHead>
                  <TableHead>Subject Code</TableHead>
                  <TableHead>Prelim</TableHead>
                  <TableHead>Midterm</TableHead>
                  <TableHead>Final</TableHead>
                  <TableHead>Final Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentGradesQuery.isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={DETAIL_COLUMN_COUNT}
                      className="text-muted-foreground text-center"
                    >
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!studentGradesQuery.isLoading &&
                  studentGrades.map((row) => {
                    const draft = draftFor(row)
                    return (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.course_name}</TableCell>
                        <TableCell>{row.subject_code ?? "—"}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="decimal"
                            className="w-20"
                            disabled={saveGradesMutation.isPending}
                            value={draft.prelim}
                            onChange={(e) => updateGradeField(row, "prelim", e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="decimal"
                            className="w-20"
                            disabled={saveGradesMutation.isPending}
                            value={draft.midterm}
                            onChange={(e) => updateGradeField(row, "midterm", e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="decimal"
                            className="w-20"
                            disabled={saveGradesMutation.isPending}
                            value={draft.final}
                            onChange={(e) => updateGradeField(row, "final", e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="w-24"
                            placeholder="e.g. 1.75, INC"
                            disabled={saveGradesMutation.isPending}
                            value={draft.final_rating}
                            onChange={(e) => updateGradeField(row, "final_rating", e.target.value)}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                {!studentGradesQuery.isLoading && studentGrades.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={DETAIL_COLUMN_COUNT}
                      className="text-muted-foreground text-center"
                    >
                      No grades on file for this student.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter showCloseButton>
            <Button
              type="button"
              variant="outline"
              disabled={studentGradesQuery.isLoading}
              onClick={handlePrintStudent}
            >
              Print
            </Button>
            <Button
              type="button"
              disabled={
                studentGradesQuery.isLoading ||
                dirtyGradeRows.length === 0 ||
                saveGradesMutation.isPending
              }
              onClick={() => saveGradesMutation.mutate()}
            >
              {saveGradesMutation.isPending ? "Saving…" : "Save Grades"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
