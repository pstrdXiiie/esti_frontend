"use client"

import { useRef, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { frappe, getErrorMessage } from "@/lib/frappe"
import { transcriptSpec } from "@/lib/forms/registrar"
import { LETTERHEAD_STYLE, renderLetterhead, usePrintHeader } from "@/lib/print-header"
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

/** The subset of Student actually shown on this screen — Educational Data
 * plus the fields StudentSearch's own result doesn't already carry. */
interface StudentEducationRecord {
  name: string
  elementary: string | null
  year_elementary: number | null
  junior_high: string | null
  year_junior_high: number | null
  secondary: string | null
  year_secondary: number | null
  ncae_no: string | null
  vocational: string | null
  year_vocational: number | null
  tertiary: string | null
  year_tertiary: number | null
}

interface ProgramEnrollmentRow {
  program: string
  year_level: number | string | null
}

/** Just what the print window needs back from the create call. */
interface TranscriptRecord {
  name: string
}

/** Everything the print window renders, captured at the moment Print was
 * clicked. Passed through as the mutation's `variables` (not read back off
 * component state in onSuccess) so a student switch or a Close click while
 * the create request is still in flight can't leak into the printout —
 * @tanstack/react-query rebinds a still-pending mutation's onSuccess closure
 * to whatever the component re-rendered with, but the variables a given
 * mutate() call was invoked with stay pinned to that call. */
interface PrintSnapshot {
  studentNo: string | null | undefined
  studentName: string | null | undefined
  course: string
  education: StudentEducationRecord | undefined
  fields: typeof BLANK_FIELDS
}

interface CreateTranscriptVars {
  payload: Record<string, unknown>
  snapshot: PrintSnapshot
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    // min-w-0 overrides a grid item's default min-width:auto, which
    // otherwise sizes the column to StudentSearch's content (its fixed-width
    // input + search button) instead of letting it shrink to the track —
    // that's what pushed the icon into the "Name" column.
    <div className="grid gap-1.5 min-w-0">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <Field label={label}>
      <div className="text-sm font-medium">{value || "—"}</div>
    </Field>
  )
}

/** Escapes text before it's interpolated into the print window's
 * document.write'd HTML — all-grades.tsx's handlePrintStudent doesn't do
 * this, which is a latent HTML-injection risk for free-text fields like
 * Remarks; this screen's own print path fixes that instead. */
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

const BLANK_FIELDS = {
  isGraduated: false,
  dateGraduated: "",
  honors: "",
  isTransferee: false,
  issuedTo: "",
  entranceCredentials: "",
  statusOfAdmission: "",
  dateOfAdmission: "",
  dateOfTransfer: "",
  soNo: "",
  dateIssued: "",
  orNo: "",
  remarks: "",
  attachments: "",
  preparedBy: "",
  checkedBy: "",
  registrar: "",
}

/**
 * "Request for Official Transcript of Records" (Registrar > Reports >
 * Student Credentials) — opened as a Dialog from the card on that screen.
 *
 * Unlike PermitForm, this is create-only: there is no existing SMS
 * Transcript to load. Student No/Name/Course and the Educational Data grid
 * are read-only facts pulled live from the selected Student (and their
 * latest Program Enrollment for Course); everything else is a plain local
 * field that becomes one new SMS Transcript document. Print is the only
 * action — it both creates that document (frappe.createDoc) and opens the
 * printable window in one click, matching the legacy form's Print/Close-only
 * toolbar. There is no separate Save button.
 */
export function OfficialTranscriptOfRecords({
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
  // Seeds from `initialStudent` exactly once per closed->open transition
  // (mirrors PermitForm's own "adjust state during render" idiom) — a caller
  // like MasterDetailScreen passes a freshly built object each render, and
  // re-seeding on every one of those would reset this form back to blank
  // while the registrar is still typing in it.
  const [seededForOpen, setSeededForOpen] = useState(false)
  if (open && !seededForOpen) {
    setSeededForOpen(true)
    setStudent(initialStudent ?? null)
    setFields(BLANK_FIELDS)
  } else if (!open && seededForOpen) {
    setSeededForOpen(false)
  }
  // The window handle for the in-flight Print request. Opened synchronously
  // inside the Print click handler (before the createDoc call) so browsers'
  // popup blockers see it as user-initiated; the create's onSuccess/onError
  // only ever write into this already-open window, never call window.open
  // itself.
  const printWindowRef = useRef<Window | null>(null)

  function set<K extends keyof typeof BLANK_FIELDS>(key: K, value: (typeof BLANK_FIELDS)[K]) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  function handleGraduatedChange(checked: boolean) {
    setFields((prev) => ({
      ...prev,
      isGraduated: checked,
      // Clearing the dependent field on uncheck keeps the saved record from
      // pairing is_graduated=0 with a leftover date from a prior check.
      dateGraduated: checked ? prev.dateGraduated : "",
    }))
  }

  function handleTransfereeChange(checked: boolean) {
    setFields((prev) => ({
      ...prev,
      isTransferee: checked,
      // Same reasoning as handleGraduatedChange, for all five fields that
      // only make sense while "Check if Transferee" is on.
      issuedTo: checked ? prev.issuedTo : "",
      entranceCredentials: checked ? prev.entranceCredentials : "",
      statusOfAdmission: checked ? prev.statusOfAdmission : "",
      dateOfAdmission: checked ? prev.dateOfAdmission : "",
      dateOfTransfer: checked ? prev.dateOfTransfer : "",
    }))
  }

  function handleStudentSelect(next: StudentOption | null) {
    setStudent(next)
    // A fresh student means a fresh request — carrying over the previous
    // student's Graduated/Transferee/footer entries onto a new one would be
    // silently wrong, so this intake resets the same way PermitForm's own
    // handleStudentSelect clears its student-dependent state.
    setFields(BLANK_FIELDS)
  }

  const educationQuery = useQuery({
    queryKey: ["Student", "tor-education", student?.name],
    queryFn: () => frappe.getDoc<StudentEducationRecord>("Student", student!.name),
    enabled: !!student,
  })

  const programEnrollmentQuery = useQuery({
    queryKey: ["Program Enrollment", "tor-course", student?.name],
    queryFn: () =>
      frappe.list<ProgramEnrollmentRow>("Program Enrollment", {
        filters: [["student", "=", student!.name]],
        fields: ["program", "year_level"],
        order_by: "enrollment_date desc",
        limit_page_length: 1,
      }),
    enabled: !!student,
  })

  const education = educationQuery.data
  const course = programEnrollmentQuery.data?.[0]?.program ?? ""

  const createMutation = useMutation({
    // `vars` are exactly what handlePrint passed to .mutate(vars) for THIS
    // click — unlike the component's own `student`/`fields`/`education`/
    // `course` state, react-query does not rebind them if the component
    // re-renders (e.g. Close resets state, or a different student is picked)
    // while the request is still in flight, so onSuccess below stays
    // consistent with what was actually just saved.
    mutationFn: (vars: CreateTranscriptVars) =>
      frappe.createDoc<TranscriptRecord>(transcriptSpec.doctype, vars.payload),
    onSuccess: (saved, vars) => {
      toast.success(`${transcriptSpec.title} created`)
      queryClient.invalidateQueries({ queryKey: [transcriptSpec.doctype] })
      openPrintWindow(saved, vars.snapshot)
    },
    onError: (error) => {
      toast.error(`Could not create transcript: ${getErrorMessage(error)}`)
      // The window was already popped open (blank) before the request was
      // sent — since the create failed there's nothing to print, so close it
      // instead of leaving a blank popup behind.
      printWindowRef.current?.close()
      printWindowRef.current = null
    },
  })

  function openPrintWindow(saved: TranscriptRecord, { studentNo, studentName, course, education, fields }: PrintSnapshot) {
    const printWindow = printWindowRef.current
    printWindowRef.current = null
    if (!printWindow) {
      // The record was still created successfully — only the print step
      // failed, most likely a browser popup blocker — so say so rather than
      // leaving the earlier success toast as the only feedback.
      toast.error(`${transcriptSpec.title} created, but the print window could not be opened. Check your browser's popup blocker.`)
      return
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Official Transcript of Records — ${escapeHtml(studentName)}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 2rem; color: #111; }
            ${LETTERHEAD_STYLE}
            h1 { font-size: 1.25rem; margin-bottom: 0.25rem; text-align: center; }
            h2 { font-size: 0.95rem; margin: 1.5rem 0 0.5rem; border-bottom: 1px solid #999; padding-bottom: 0.25rem; }
            .tor-no { text-align: center; color: #555; font-size: 0.85rem; margin-bottom: 1.5rem; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 1.5rem; }
            .grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0 1.5rem; }
            .field { margin-bottom: 0.75rem; }
            .field span { display: block; font-size: 0.75rem; color: #555; }
            .field strong { font-size: 0.9rem; }
            .transferee-note { font-size: 0.8rem; color: #777; margin-bottom: 0.5rem; }
            .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1.5rem; margin-top: 1rem; }
            .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-top: 3rem; text-align: center; }
            .signatures div { border-top: 1px solid #333; padding-top: 0.35rem; font-size: 0.85rem; }
          </style>
        </head>
        <body>
          ${renderLetterhead(printHeaderQuery.data)}
          <h1>Request for Official Transcript of Records</h1>
          <div class="tor-no">TOR No.: ${escapeHtml(saved.name)}</div>

          <div class="grid">
            <div class="field"><span>Student No.</span><strong>${escapeHtml(studentNo)}</strong></div>
            <div class="field"><span>Name</span><strong>${escapeHtml(studentName)}</strong></div>
            <div class="field"><span>Course</span><strong>${escapeHtml(course)}</strong></div>
          </div>

          <h2>Educational Data</h2>
          <div class="grid2">
            <div class="field"><span>Elementary School</span><strong>${escapeHtml(education?.elementary)}</strong></div>
            <div class="field"><span>Year Graduated</span><strong>${escapeHtml(education?.year_elementary)}</strong></div>
            <div class="field"><span>Junior High School</span><strong>${escapeHtml(education?.junior_high)}</strong></div>
            <div class="field"><span>Year Graduated</span><strong>${escapeHtml(education?.year_junior_high)}</strong></div>
            <div class="field"><span>Senior High School</span><strong>${escapeHtml(education?.secondary)}</strong></div>
            <div class="field"><span>Year Graduated</span><strong>${escapeHtml(education?.year_secondary)}</strong></div>
            <div class="field"><span>NCAE No.</span><strong>${escapeHtml(education?.ncae_no)}</strong></div>
            <div class="field"></div>
            <div class="field"><span>Vocational School</span><strong>${escapeHtml(education?.vocational)}</strong></div>
            <div class="field"><span>Year Graduated</span><strong>${escapeHtml(education?.year_vocational)}</strong></div>
            <div class="field"><span>Tertiary</span><strong>${escapeHtml(education?.tertiary)}</strong></div>
            <div class="field"><span>Year Graduated</span><strong>${escapeHtml(education?.year_tertiary)}</strong></div>
          </div>

          <h2>Graduation</h2>
          <div class="grid">
            <div class="field"><span>Graduated</span><strong>${fields.isGraduated ? "Yes" : "No"}</strong></div>
            <div class="field"><span>Date Graduated</span><strong>${escapeHtml(fields.dateGraduated)}</strong></div>
            <div class="field"><span>Honors/Distinction</span><strong>${escapeHtml(fields.honors)}</strong></div>
          </div>

          <h2>For Transferee</h2>
          <div class="transferee-note">Check if Transferee: <strong>${fields.isTransferee ? "Yes" : "No"}</strong></div>
          <div class="grid2">
            <div class="field"><span>Official TOR Issued To</span><strong>${escapeHtml(fields.issuedTo)}</strong></div>
            <div class="field"><span>Entrance Credentials To</span><strong>${escapeHtml(fields.entranceCredentials)}</strong></div>
            <div class="field"><span>Status of Admission</span><strong>${escapeHtml(fields.statusOfAdmission)}</strong></div>
            <div class="field"><span>Date of Admission</span><strong>${escapeHtml(fields.dateOfAdmission)}</strong></div>
            <div class="field"><span>Transfer Date</span><strong>${escapeHtml(fields.dateOfTransfer)}</strong></div>
          </div>

          <h2>Details</h2>
          <div class="footer-grid">
            <div class="field"><span>Special Order No.</span><strong>${escapeHtml(fields.soNo)}</strong></div>
            <div class="field"><span>Date Issued</span><strong>${escapeHtml(fields.dateIssued)}</strong></div>
            <div class="field"><span>OR No.</span><strong>${escapeHtml(fields.orNo)}</strong></div>
          </div>
          <div class="field"><span>Remarks</span><strong>${escapeHtml(fields.remarks)}</strong></div>
          <div class="field"><span>Attachments (If any)</span><strong>${escapeHtml(fields.attachments)}</strong></div>

          <div class="signatures">
            <div>${escapeHtml(fields.preparedBy)}<br/>Prepared by</div>
            <div>${escapeHtml(fields.checkedBy)}<br/>Checked by</div>
            <div>${escapeHtml(fields.registrar)}<br/>Registrar</div>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  function handlePrint() {
    if (!student) {
      toast.error("Select a student first")
      return
    }

    const payload = {
      student: student.name,
      is_graduated: fields.isGraduated ? 1 : 0,
      date_graduated: fields.dateGraduated || null,
      honors: fields.honors || null,
      is_transferee: fields.isTransferee ? 1 : 0,
      issued_to: fields.issuedTo || null,
      entrance_credentials: fields.entranceCredentials || null,
      status_of_admission: fields.statusOfAdmission || null,
      date_of_admission: fields.dateOfAdmission || null,
      date_of_transfer: fields.dateOfTransfer || null,
      so_no: fields.soNo || null,
      date_issued: fields.dateIssued || null,
      or_no: fields.orNo || null,
      remarks: fields.remarks || null,
      attachments: fields.attachments || null,
      prepared_by: fields.preparedBy || null,
      checked_by: fields.checkedBy || null,
      registrar: fields.registrar || null,
    }
    const snapshot: PrintSnapshot = {
      studentNo: student.stdnt_cno,
      studentName: student.student_name,
      course,
      education,
      fields,
    }

    // Opened synchronously, inside the click handler's own call stack, so
    // popup blockers treat it as user-initiated even though the content is
    // written in later once createDoc resolves.
    printWindowRef.current = window.open("", "_blank", "width=900,height=1000")
    createMutation.mutate({ payload, snapshot })
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setStudent(null)
      setFields(BLANK_FIELDS)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-3xl sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{transcriptSpec.title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Student No.">
              <StudentSearch selected={student} onSelect={handleStudentSelect} idPrefix="tor" />
            </Field>
            <ReadOnlyField label="Name" value={student?.student_name} />
            <ReadOnlyField label="Course" value={course} />
          </div>

          <section className="grid gap-3 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Educational Data</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadOnlyField label="Elementary School" value={education?.elementary} />
              <ReadOnlyField label="Year Graduated" value={education?.year_elementary} />
              <ReadOnlyField label="Junior High School" value={education?.junior_high} />
              <ReadOnlyField label="Year Graduated" value={education?.year_junior_high} />
              <ReadOnlyField label="Senior High School" value={education?.secondary} />
              <ReadOnlyField label="Year Graduated" value={education?.year_secondary} />
              <ReadOnlyField label="NCAE No." value={education?.ncae_no} />
              <div />
              <ReadOnlyField label="Vocational School" value={education?.vocational} />
              <ReadOnlyField label="Year Graduated" value={education?.year_vocational} />
              <ReadOnlyField label="Tertiary" value={education?.tertiary} />
              <ReadOnlyField label="Year Graduated" value={education?.year_tertiary} />
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-3 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={fields.isGraduated}
                onChange={(e) => handleGraduatedChange(e.target.checked)}
              />
              Graduated
            </label>
            <Field label="Date Graduated">
              <Input
                type="date"
                value={fields.dateGraduated}
                disabled={!fields.isGraduated}
                onChange={(e) => set("dateGraduated", e.target.value)}
              />
            </Field>
            <Field label="Honors/Distinction">
              <Input value={fields.honors} onChange={(e) => set("honors", e.target.value)} />
            </Field>
          </section>

          <section className="grid gap-4 rounded-md border p-3">
            <h3 className="text-sm font-semibold">For Transferee</h3>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={fields.isTransferee}
                onChange={(e) => handleTransfereeChange(e.target.checked)}
              />
              Check if Transferee
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Official TOR Issued To">
                <Input
                  value={fields.issuedTo}
                  disabled={!fields.isTransferee}
                  onChange={(e) => set("issuedTo", e.target.value)}
                />
              </Field>
              <Field label="Entrance Credentials To">
                <Input
                  value={fields.entranceCredentials}
                  disabled={!fields.isTransferee}
                  onChange={(e) => set("entranceCredentials", e.target.value)}
                />
              </Field>
              <Field label="Status of Admission">
                <Input
                  value={fields.statusOfAdmission}
                  disabled={!fields.isTransferee}
                  onChange={(e) => set("statusOfAdmission", e.target.value)}
                />
              </Field>
              <Field label="Date of Admission">
                <Input
                  type="date"
                  value={fields.dateOfAdmission}
                  disabled={!fields.isTransferee}
                  onChange={(e) => set("dateOfAdmission", e.target.value)}
                />
              </Field>
              <Field label="Transfer Date">
                <Input
                  type="date"
                  value={fields.dateOfTransfer}
                  disabled={!fields.isTransferee}
                  onChange={(e) => set("dateOfTransfer", e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section className="grid gap-4 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Details</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Special Order No.">
                <Input value={fields.soNo} onChange={(e) => set("soNo", e.target.value)} />
              </Field>
              <Field label="Date Issued">
                <Input type="date" value={fields.dateIssued} onChange={(e) => set("dateIssued", e.target.value)} />
              </Field>
              <Field label="OR No.">
                <Input value={fields.orNo} onChange={(e) => set("orNo", e.target.value)} />
              </Field>
            </div>
            <Field label="Remarks">
              <Textarea value={fields.remarks} onChange={(e) => set("remarks", e.target.value)} />
            </Field>
            <Field label="Attachments (If any)">
              <Textarea value={fields.attachments} onChange={(e) => set("attachments", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Prepared by">
                <Input value={fields.preparedBy} onChange={(e) => set("preparedBy", e.target.value)} />
              </Field>
              <Field label="Checked by">
                <Input value={fields.checkedBy} onChange={(e) => set("checkedBy", e.target.value)} />
              </Field>
              <Field label="Registrar">
                <Input value={fields.registrar} onChange={(e) => set("registrar", e.target.value)} />
              </Field>
            </div>
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

export default OfficialTranscriptOfRecords
