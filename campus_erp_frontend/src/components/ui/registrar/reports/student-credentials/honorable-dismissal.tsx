"use client"

import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { frappe, getErrorMessage } from "@/lib/frappe"
import { ensurePrintHeader, usePrintHeader, waitForImagesToLoad } from "@/lib/print-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import StudentSearch, { StudentOption } from "@/components/sms/StudentSearch"

interface ProgramEnrollmentRow {
  program: string
  academic_year: string | null
}

interface ProgramRow {
  program_name: string
}

interface HonorableDismissalRecord {
  name: string
}

interface HonorableDismissalFields {
  tcNo: string
  semester: string
  schoolYear: string
  releaseNo: string
  orNo: string
  dateIssued: string
  effectiveOn: string
  isGraduated: boolean
  dateGraduated: string
  registrarName: string
  remarks: string
}

interface PrintSnapshot {
  studentName: string
  programName: string
  fields: HonorableDismissalFields
}

const BLANK_FIELDS: HonorableDismissalFields = {
  tcNo: "",
  semester: "",
  schoolYear: "",
  releaseNo: "",
  orNo: "",
  dateIssued: "",
  effectiveOn: "",
  isGraduated: false,
  dateGraduated: "",
  registrarName: "",
  remarks: "",
}

/** Matches diploma.tsx's own helper — each print call site keeps its own
 * copy rather than sharing one across unrelated report screens. */
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

function formatDateLong(value: string): string {
  const [y, m, d] = value.split("-").map(Number)
  if (!y || !m || !d) return ""
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
}

// Same suffix/hyphen-aware title casing as diploma.tsx.
const NAME_SUFFIXES = new Set(["II", "III", "IV", "V", "JR", "JR.", "SR", "SR."])

function titleCaseWord(word: string): string {
  if (!word) return word
  const upper = word.toUpperCase()
  if (NAME_SUFFIXES.has(upper)) return upper
  return word
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
    .join("-")
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map(titleCaseWord)
    .join(" ")
}

/**
 * Honorable Dismissal (Registrar > Reports > Student Credentials) — opened
 * as a Dialog from the card on that screen, mirroring Diploma: create-only
 * (no existing SMS Honorable Dismissal to load), Print both creates the
 * record and opens the printable certificate in one click.
 *
 * A like-for-like port of the legacy VB system's frmRegHonorableDismissal /
 * frmPrintHD (recovered from the SchoolManagementSystem-ESTI project). The
 * legacy print's exact certificate wording lived as static text baked into
 * a Crystal Reports .rpt binary that isn't recoverable as plain text, so
 * the body copy below is written fresh in the same register as the
 * legacy's own (commented, unused) draft copy, carrying the same
 * structured facts the legacy screen bound onto the report: TC No.,
 * Release No., OR No., Date Issued, H.D. Effective On, and — only when the
 * legacy's "Date Graduated" checkbox equivalent applies — the graduation
 * date.
 */
export function HonorableDismissal({
  open,
  onOpenChange,
  initialStudent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-selects a student (e.g. opened from that student's own Edit dialog)
   * instead of requiring the registrar to search for them again. */
  initialStudent?: StudentOption | null
}) {
  const queryClient = useQueryClient()

  // Print-only: the school letterhead, not needed for the form itself.
  const printHeaderQuery = usePrintHeader(open)

  const [student, setStudent] = useState<StudentOption | null>(null)
  const [fields, setFields] = useState(BLANK_FIELDS)
  // Seeds from `initialStudent` exactly once per closed->open transition —
  // same idiom as diploma.tsx.
  const [seededForOpen, setSeededForOpen] = useState(false)
  if (open && !seededForOpen) {
    setSeededForOpen(true)
    setStudent(initialStudent ?? null)
    setFields(BLANK_FIELDS)
  } else if (!open && seededForOpen) {
    setSeededForOpen(false)
  }
  // The window handle for the in-flight Print request — opened synchronously
  // inside the Print click handler (before the createDoc call) so browsers'
  // popup blockers see it as user-initiated; the create's onSuccess/onError
  // only ever write into this already-open window, never call window.open
  // itself.
  const printWindowRef = useRef<Window | null>(null)

  function set<K extends keyof HonorableDismissalFields>(key: K, value: HonorableDismissalFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  function handleStudentSelect(next: StudentOption | null) {
    setStudent(next)
    setFields(BLANK_FIELDS)
    // Otherwise the school-year prefill below stays permanently disabled for
    // every student picked after the first one the registrar edited it for.
    setSchoolYearTouched(false)
  }

  const programEnrollmentQuery = useQuery({
    queryKey: ["Program Enrollment", "honorable-dismissal", student?.name],
    queryFn: () =>
      frappe.list<ProgramEnrollmentRow>("Program Enrollment", {
        filters: [["student", "=", student!.name]],
        fields: ["program", "academic_year"],
        order_by: "enrollment_date desc",
        limit_page_length: 1,
      }),
    enabled: !!student,
  })
  const enrollment = programEnrollmentQuery.data?.[0]
  const program = enrollment?.program ?? ""

  const programQuery = useQuery({
    queryKey: ["Program", "honorable-dismissal", program],
    queryFn: () => frappe.getDoc<ProgramRow>("Program", program),
    enabled: !!program,
  })
  const programName = programQuery.data?.program_name ?? ""

  // Prefills Last School Year Attended from the student's latest enrollment
  // once it resolves, but only if the registrar hasn't already typed
  // something in — a fresh lookup for a newly-selected student shouldn't
  // clobber a value being edited for the previous one.
  const [schoolYearTouched, setSchoolYearTouched] = useState(false)
  if (enrollment?.academic_year && !schoolYearTouched && !fields.schoolYear) {
    setFields((prev) => ({ ...prev, schoolYear: enrollment.academic_year ?? "" }))
  }

  const createMutation = useMutation({
    // `vars` are exactly what handlePrint passed to .mutate(vars) for THIS
    // click — react-query does not rebind them if the component re-renders
        // while the request is still in flight, same reasoning as diploma.tsx.
    mutationFn: (vars: { payload: Record<string, unknown>; snapshot: PrintSnapshot }) =>
      frappe.createDoc<HonorableDismissalRecord>("SMS Honorable Dismissal", vars.payload),
    onSuccess: (saved, vars) => {
      toast.success("Honorable Dismissal created")
      queryClient.invalidateQueries({ queryKey: ["SMS Honorable Dismissal"] })
      openPrintWindow(saved, vars.snapshot)
    },
    onError: (error) => {
      toast.error(`Could not create honorable dismissal: ${getErrorMessage(error)}`)
      printWindowRef.current?.close()
      printWindowRef.current = null
    },
  })

  async function openPrintWindow(saved: HonorableDismissalRecord, snapshot: PrintSnapshot) {
    const printWindow = printWindowRef.current
    printWindowRef.current = null
    if (!printWindow) {
      toast.error(
        "Honorable Dismissal created, but the print window could not be opened. Check your browser's popup blocker."
      )
      return
    }

    const header = await ensurePrintHeader(printHeaderQuery)
    const logoImg = header?.logo ? `<img class="logo" src="${escapeHtml(header.logo)}" alt="" />` : ""

    const termLine =
      snapshot.fields.semester && snapshot.fields.schoolYear
        ? `during the ${escapeHtml(snapshot.fields.semester)} Semester of School Year ${escapeHtml(snapshot.fields.schoolYear)}`
        : snapshot.fields.schoolYear
          ? `during School Year ${escapeHtml(snapshot.fields.schoolYear)}`
          : ""

    const graduatedLine = snapshot.fields.isGraduated
      ? `<p class="body-text">Records further show that ${escapeHtml(snapshot.studentName)} graduated from this Institute on ${escapeHtml(formatDateLong(snapshot.fields.dateGraduated))}.</p>`
      : ""

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Honorable Dismissal — ${escapeHtml(snapshot.studentName)}</title>
          <style>
            body { font-family: "Times New Roman", Times, serif; padding: 3rem 4rem; color: #111; text-align: center; }
            .border { border: 3px double #333; padding: 3rem 4rem; }
            .logo { height: 72px; width: 72px; object-fit: contain; margin: 0 auto 0.5rem; display: block; }
            .school-name { font-size: 1.5rem; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.25rem; }
            .title { font-size: 1.2rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.15em; margin: 1.5rem 0 2rem; text-decoration: underline; }
            .body-text { font-size: 1.05rem; line-height: 1.8; max-width: 42rem; margin: 0 auto 1.25rem; text-align: justify; }
            .student-name { font-weight: bold; }
            .doc-nos { font-size: 0.85rem; color: #444; text-align: left; margin: 2rem 0 0; display: flex; justify-content: space-between; }
            .signature { margin-top: 4rem; text-align: right; }
            .signature div { display: inline-block; border-top: 1px solid #333; padding-top: 0.35rem; font-size: 0.9rem; min-width: 14rem; }
          </style>
        </head>
        <body>
          <div class="border">
            ${logoImg}
            <div class="school-name">${escapeHtml(header?.school_name)}</div>
            <div class="title">Honorable Dismissal</div>
            <p class="body-text">
              To Whom It May Concern:
            </p>
            <p class="body-text">
              This is to certify that <span class="student-name">${escapeHtml(snapshot.studentName)}</span>
              was enrolled in this Institute under the ${escapeHtml(snapshot.programName)} program
              ${termLine}, and is honorably dismissed effective ${escapeHtml(formatDateLong(snapshot.fields.effectiveOn))},
              having settled all financial and academic obligations to this Institute as of that date.
            </p>
            ${graduatedLine}
            <p class="body-text">
              This certification is issued upon the request of the above-named student for whatever legal purpose it may serve.
            </p>
            <div class="doc-nos">
              <span>TC No. ${escapeHtml(snapshot.fields.tcNo)}</span>
              <span>Release No. ${escapeHtml(snapshot.fields.releaseNo)}</span>
              <span>OR No. ${escapeHtml(snapshot.fields.orNo)}</span>
            </div>
            <p class="doc-nos"><span>Date Issued: ${escapeHtml(formatDateLong(snapshot.fields.dateIssued))}</span><span>${escapeHtml(saved.name)}</span></p>
            <div class="signature">
              <div>${escapeHtml(snapshot.fields.registrarName)}<br/>Registrar</div>
            </div>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    await waitForImagesToLoad(printWindow.document)
    printWindow.print()
  }

  function handlePrint() {
    if (!student) {
      toast.error("Select a student first")
      return
    }
    if (programEnrollmentQuery.isFetching || programQuery.isFetching) {
      toast.error("Still loading this student's program — try again in a moment")
      return
    }
    if (!program) {
      toast.error("This student has no Program Enrollment on file")
      return
    }
    if (!fields.tcNo.trim()) {
      toast.error("TC No. is required")
      return
    }
    if (!fields.effectiveOn) {
      toast.error("H.D. Effective On is required")
      return
    }
    if (fields.isGraduated && !fields.dateGraduated) {
      toast.error("Date Graduated is required when Graduated is checked")
      return
    }

    const payload = {
      student: student.name,
      program,
      tc_no: fields.tcNo,
      semester: fields.semester || null,
      school_year: fields.schoolYear || null,
      release_no: fields.releaseNo || null,
      or_no: fields.orNo || null,
      date_issued: fields.dateIssued || null,
      effective_on: fields.effectiveOn,
      date_graduated: fields.isGraduated ? fields.dateGraduated || null : null,
      registrar_name: fields.registrarName || null,
      remarks: fields.remarks || null,
    }
    const snapshot: PrintSnapshot = {
      studentName: titleCase(student.student_name),
      programName,
      fields,
    }

    // Opened synchronously, inside the click handler's own call stack, so
    // popup blockers treat it as user-initiated even though the content is
    // written in later once createDoc resolves.
    printWindowRef.current = window.open("", "_blank", "width=1000,height=750")
    createMutation.mutate({ payload, snapshot })
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setStudent(null)
      setFields(BLANK_FIELDS)
      setSchoolYearTouched(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-2xl sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Honorable Dismissal</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5 min-w-0">
              <label className="text-xs text-muted-foreground">Student No.</label>
              <StudentSearch selected={student} onSelect={handleStudentSelect} idPrefix="honorable-dismissal" />
            </div>
            <div className="grid gap-1.5 min-w-0">
              <label className="text-xs text-muted-foreground">Name</label>
              <div className="text-sm font-medium">{student?.student_name || "—"}</div>
            </div>
            <div className="grid gap-1.5 min-w-0">
              <label className="text-xs text-muted-foreground">Course</label>
              <div className="text-sm font-medium">{program ? programName || "…" : "—"}</div>
            </div>
          </div>

          <section className="grid gap-4 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Last Enrollment</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Last Semester Attended</label>
                <Select value={fields.semester} onValueChange={(v) => set("semester", v ?? "")}>
                  <SelectTrigger id="honorable-dismissal-semester" className="w-full">
                    <SelectValue placeholder="Select semester" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="First">First</SelectItem>
                    <SelectItem value="Second">Second</SelectItem>
                    <SelectItem value="Third">Third</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Last School Year Attended</label>
                <Input
                  value={fields.schoolYear}
                  onChange={(e) => {
                    setSchoolYearTouched(true)
                    set("schoolYear", e.target.value)
                  }}
                  placeholder="2026-2027"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={fields.isGraduated}
                onChange={(e) => set("isGraduated", e.target.checked)}
              />
              Graduated
            </label>
            {fields.isGraduated && (
              <div className="grid gap-1.5 sm:max-w-56">
                <label className="text-xs text-muted-foreground">Date Graduated</label>
                <Input
                  type="date"
                  value={fields.dateGraduated}
                  onChange={(e) => set("dateGraduated", e.target.value)}
                />
              </div>
            )}
          </section>

          <section className="grid gap-4 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Details</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">TC No.</label>
                <Input value={fields.tcNo} onChange={(e) => set("tcNo", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Release No.</label>
                <Input value={fields.releaseNo} onChange={(e) => set("releaseNo", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">OR No.</label>
                <Input value={fields.orNo} onChange={(e) => set("orNo", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Date Issued</label>
                <Input type="date" value={fields.dateIssued} onChange={(e) => set("dateIssued", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">H.D. Effective On</label>
                <Input
                  type="date"
                  value={fields.effectiveOn}
                  onChange={(e) => set("effectiveOn", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Registrar</label>
                <Input value={fields.registrarName} onChange={(e) => set("registrarName", e.target.value)} />
              </div>
            </div>
            <Textarea
              placeholder="Remarks"
              value={fields.remarks}
              onChange={(e) => set("remarks", e.target.value)}
            />
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Close
          </Button>
          <Button type="button" disabled={createMutation.isPending} onClick={handlePrint}>
            {createMutation.isPending ? "Printing…" : "Print"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
