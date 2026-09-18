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

interface CertificateOfEnrollmentRecord {
  name: string
}

interface CertificateFields {
  schoolYear: string
  semester: string
  yearLevel: string
  dateIssued: string
  purpose: string
  registrarName: string
  remarks: string
}

interface PrintSnapshot {
  studentName: string
  programName: string
  fields: CertificateFields
}

const BLANK_FIELDS: CertificateFields = {
  schoolYear: "",
  semester: "",
  yearLevel: "",
  dateIssued: "",
  purpose: "",
  registrarName: "",
  remarks: "",
}

// The Program Enrollment/Grade record convention throughout this codebase
// (e.g. all-grades.tsx's own GradeRow) stores semester as a plain 1/2/3 Int
// — this is display-only formatting for the certificate's prose, not a
// schema choice, matching how SMS Certificate Of Enrollment's own semester
// field is an Int rather than the Select("First\nSecond\nThird") the
// separately-scaffolded HD/COGMC doctypes happened to already use.
const SEMESTER_LABELS: Record<string, string> = { "1": "First", "2": "Second", "3": "Third" }

function semesterLabel(value: string): string {
  return SEMESTER_LABELS[value] ?? value
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

// Same suffix/hyphen-aware title casing as diploma.tsx and its siblings.
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
 * Certificate of Enrollment (Registrar > Reports > Student Credentials) —
 * opened as a Dialog from the card on that screen, mirroring Diploma/
 * Honorable Dismissal/Good Moral: create-only (no existing SMS Certificate
 * Of Enrollment to load), Print both creates the record and opens the
 * printable certificate in one click.
 *
 * Unlike its siblings, there's no dedicated legacy VB form for this one —
 * the SchoolManagementSystem-ESTI project's "Enrollment*" forms are all the
 * batch reports already built under Enrollment Reports (Listing, Summary,
 * Statistics), not a per-student certificate. This is a standard, simple
 * "is/was enrolled" certification (used for scholarship, ID, loan, or visa
 * applications) rather than a legacy port — School Year/Semester/Year Level
 * prefill from the student's latest Program Enrollment, same as the other
 * credential screens, but stay editable since a certificate can legitimately
 * be requested for a term other than the student's most recent one.
 */
export function CertificateOfEnrollment({
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
  // Guards the one-time prefill-from-enrollment below the same way
  // honorable-dismissal.tsx/good-moral.tsx guard their own School Year
  // prefill — cleared whenever the student changes so it can re-fire for
  // the newly-selected student instead of staying permanently disabled.
  const [prefilled, setPrefilled] = useState(false)
  // Seeds from `initialStudent` exactly once per closed->open transition —
  // same idiom as diploma.tsx and its siblings.
  const [seededForOpen, setSeededForOpen] = useState(false)
  if (open && !seededForOpen) {
    setSeededForOpen(true)
    setStudent(initialStudent ?? null)
    setFields(BLANK_FIELDS)
    setPrefilled(false)
  } else if (!open && seededForOpen) {
    setSeededForOpen(false)
  }
  // The window handle for the in-flight Print request — opened synchronously
  // inside the Print click handler (before the createDoc call) so browsers'
  // popup blockers see it as user-initiated; the create's onSuccess/onError
  // only ever write into this already-open window, never call window.open
  // itself.
  const printWindowRef = useRef<Window | null>(null)

  function set<K extends keyof CertificateFields>(key: K, value: CertificateFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  function handleStudentSelect(next: StudentOption | null) {
    setStudent(next)
    setFields(BLANK_FIELDS)
    setPrefilled(false)
  }

  const programEnrollmentQuery = useQuery({
    queryKey: ["Program Enrollment", "certificate-of-enrollment", student?.name],
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
    queryKey: ["Program", "certificate-of-enrollment", program],
    queryFn: () => frappe.getDoc<ProgramRow>("Program", program),
    enabled: !!program,
  })
  const programName = programQuery.data?.program_name ?? ""

  // Prefills School Year from the student's latest enrollment once it
  // resolves, exactly once per selected student — after that the registrar
  // is free to edit it to a different term without a fresh Program
  // Enrollment fetch clobbering their edit. Semester/Year Level have no
  // equally reliable source (Program Enrollment carries neither field in
  // this deployment — SMS Student Assessment does, but that's a distinct
  // per-term record this screen has no reason to require), so they stay
  // plain manual inputs, same as every other credential screen's own
  // Semester field.
  if (enrollment && !prefilled) {
    setPrefilled(true)
    setFields((prev) => ({
      ...prev,
      schoolYear: prev.schoolYear || enrollment.academic_year || "",
    }))
  }

  const createMutation = useMutation({
    // `vars` are exactly what handlePrint passed to .mutate(vars) for THIS
    // click — react-query does not rebind them if the component re-renders
    // while the request is still in flight, same reasoning as diploma.tsx.
    mutationFn: (vars: { payload: Record<string, unknown>; snapshot: PrintSnapshot }) =>
      frappe.createDoc<CertificateOfEnrollmentRecord>("SMS Certificate Of Enrollment", vars.payload),
    onSuccess: (saved, vars) => {
      toast.success("Certificate of Enrollment created")
      queryClient.invalidateQueries({ queryKey: ["SMS Certificate Of Enrollment"] })
      openPrintWindow(saved, vars.snapshot)
    },
    onError: (error) => {
      toast.error(`Could not create certificate: ${getErrorMessage(error)}`)
      printWindowRef.current?.close()
      printWindowRef.current = null
    },
  })

  async function openPrintWindow(saved: CertificateOfEnrollmentRecord, snapshot: PrintSnapshot) {
    const printWindow = printWindowRef.current
    printWindowRef.current = null
    if (!printWindow) {
      toast.error(
        "Certificate created, but the print window could not be opened. Check your browser's popup blocker."
      )
      return
    }

    const header = await ensurePrintHeader(printHeaderQuery)
    const logoImg = header?.logo ? `<img class="logo" src="${escapeHtml(header.logo)}" alt="" />` : ""

    const termLine = snapshot.fields.semester
      ? `during the ${escapeHtml(semesterLabel(snapshot.fields.semester))} Semester, School Year ${escapeHtml(snapshot.fields.schoolYear)}`
      : `during School Year ${escapeHtml(snapshot.fields.schoolYear)}`

    const purposeLine = snapshot.fields.purpose
      ? `This certification is issued upon the request of the above-named student for ${escapeHtml(snapshot.fields.purpose)} purposes.`
      : "This certification is issued upon the request of the above-named student for whatever legal purpose it may serve."

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Certificate of Enrollment — ${escapeHtml(snapshot.studentName)}</title>
          <style>
            body { font-family: "Times New Roman", Times, serif; padding: 3rem 4rem; color: #111; text-align: center; }
            .border { border: 3px double #333; padding: 3rem 4rem; }
            .logo { height: 72px; width: 72px; object-fit: contain; margin: 0 auto 0.5rem; display: block; }
            .school-name { font-size: 1.5rem; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.25rem; }
            .title { font-size: 1.2rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; margin: 1.5rem 0 2rem; text-decoration: underline; }
            .body-text { font-size: 1.05rem; line-height: 1.8; max-width: 42rem; margin: 0 auto 1.25rem; text-align: justify; }
            .student-name { font-weight: bold; }
            .given-line { font-size: 0.95rem; margin: 2rem 0 3rem; }
            .signature { text-align: right; }
            .signature div { display: inline-block; border-top: 1px solid #333; padding-top: 0.35rem; font-size: 0.9rem; min-width: 14rem; }
            .doc-no { font-size: 0.75rem; color: #666; text-align: left; margin-top: 1rem; }
          </style>
        </head>
        <body>
          <div class="border">
            ${logoImg}
            <div class="school-name">${escapeHtml(header?.school_name)}</div>
            <div class="title">Certificate of Enrollment</div>
            <p class="body-text">To Whom It May Concern:</p>
            <p class="body-text">
              This is to certify that <span class="student-name">${escapeHtml(snapshot.studentName)}</span>
              is/was enrolled in this Institute under the ${escapeHtml(snapshot.programName)} program,
              Year Level ${escapeHtml(snapshot.fields.yearLevel)}, ${termLine}.
            </p>
            <p class="body-text">${purposeLine}</p>
            <p class="given-line">Issued this ${escapeHtml(formatDateLong(snapshot.fields.dateIssued))}.</p>
            <div class="signature">
              <div>${escapeHtml(snapshot.fields.registrarName)}<br/>Registrar</div>
            </div>
            <p class="doc-no">${escapeHtml(saved.name)}</p>
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
    if (!fields.schoolYear.trim()) {
      toast.error("School Year is required")
      return
    }
    if (!fields.dateIssued) {
      toast.error("Date Issued is required")
      return
    }

    const payload = {
      student: student.name,
      program,
      year_level: fields.yearLevel ? Number(fields.yearLevel) : null,
      school_year: fields.schoolYear,
      semester: fields.semester ? Number(fields.semester) : null,
      date_issued: fields.dateIssued,
      purpose: fields.purpose || null,
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
      setPrefilled(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-2xl sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Certificate of Enrollment</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5 min-w-0">
              <label className="text-xs text-muted-foreground">Student No.</label>
              <StudentSearch selected={student} onSelect={handleStudentSelect} idPrefix="certificate-of-enrollment" />
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
            <h3 className="text-sm font-semibold">Enrollment</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">School Year</label>
                <Input value={fields.schoolYear} onChange={(e) => set("schoolYear", e.target.value)} placeholder="2026-2027" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Semester</label>
                <Input
                  type="number"
                  value={fields.semester}
                  onChange={(e) => set("semester", e.target.value)}
                  placeholder="1, 2, or 3"
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Year Level</label>
                <Input
                  type="number"
                  value={fields.yearLevel}
                  onChange={(e) => set("yearLevel", e.target.value)}
                  placeholder="1"
                />
              </div>
            </div>
          </section>

          <section className="grid gap-4 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Details</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Date Issued</label>
                <Input type="date" value={fields.dateIssued} onChange={(e) => set("dateIssued", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Purpose</label>
                <Input value={fields.purpose} onChange={(e) => set("purpose", e.target.value)} placeholder="Scholarship, ID renewal, etc." />
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">Registrar</label>
              <Input value={fields.registrarName} onChange={(e) => set("registrarName", e.target.value)} />
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
