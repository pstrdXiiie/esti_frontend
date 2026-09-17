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
}

interface ProgramRow {
  program_name: string
  is_diploma_course: number
}

interface StudentGenderRow {
  gender: string | null
}

interface DiplomaRecord {
  name: string
}

interface DiplomaFields {
  soNo: string
  dateIssued: string
  dateConferred: string
  honors: string
  registrarName: string
  vpAcademicAffairsName: string
  presidentName: string
  remarks: string
}

interface PrintSnapshot {
  studentName: string
  programName: string
  credentialType: "Diploma" | "Certificate"
  pronoun: "his" | "her" | "their"
  fields: DiplomaFields
}

const BLANK_FIELDS: DiplomaFields = {
  soNo: "",
  dateIssued: "",
  dateConferred: "",
  honors: "",
  registrarName: "",
  vpAcademicAffairsName: "",
  presidentName: "",
  remarks: "",
}

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

function ordinal(day: number): string {
  const v = day % 100
  if (v >= 11 && v <= 13) return `${day}th`
  switch (day % 10) {
    case 1:
      return `${day}st`
    case 2:
      return `${day}nd`
    case 3:
      return `${day}rd`
    default:
      return `${day}th`
  }
}

/** "Given under the seal ... on this Nth day of Month, in the year of our
 * Lord YYYY." — the legacy diploma's own ceremonial phrasing, built from a
 * single Date Conferred field instead of the legacy's separate day/month
 * suffix combo boxes (the ordinal suffix is fully determined by the day
 * number, so there's nothing for the registrar to actually pick). */
function conferralSentence(dateConferred: string): string {
  const [y, m, d] = dateConferred.split("-").map(Number)
  if (!y || !m || !d) return ""
  const monthName = new Date(y, m - 1, d).toLocaleString("en-US", { month: "long" })
  return `Given under the seal of the Institute, Republic of the Philippines, on this ${ordinal(d)} day of ${monthName}, in the year of our Lord ${y}.`
}

// Name suffixes that should stay as-is rather than being lowercased past
// their first letter — a plain per-word capitalize would turn "III"/"Jr."
// into "Iii"/"Jr." (still wrong-looking either way).
const NAME_SUFFIXES = new Set(["II", "III", "IV", "V", "JR", "JR.", "SR", "SR."])

function titleCaseWord(word: string): string {
  if (!word) return word
  const upper = word.toUpperCase()
  if (NAME_SUFFIXES.has(upper)) return upper
  // Capitalize after an internal hyphen too ("Mary-Jane"), not just at the
  // start of the whole word — a plain single capitalize() lowercases the
  // letter right after the hyphen.
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
 * Diploma (Registrar > Reports > Student Credentials) — opened as a Dialog
 * from the card on that screen, mirroring Official Transcript of Records:
 * create-only (no existing SMS Diploma to load), Print both creates the
 * record and opens the printable certificate in one click.
 *
 * A like-for-like port of the legacy VB system's frmRegDiploma/frmDiploma
 * (recovered from the SchoolManagementSystem-ESTI project): Diploma vs.
 * Certificate wording is decided by the student's Program — the legacy
 * checked for a "BS"-prefixed CourseCode, this checks
 * Program.is_diploma_course, the new schema's structured replacement for
 * that same distinction — and the pronoun ("his"/"her") by Gender.
 */
export function Diploma({
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
  // same idiom as official-transcript-of-records.tsx.
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

  function set<K extends keyof DiplomaFields>(key: K, value: DiplomaFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  function handleStudentSelect(next: StudentOption | null) {
    setStudent(next)
    setFields(BLANK_FIELDS)
  }

  const programEnrollmentQuery = useQuery({
    queryKey: ["Program Enrollment", "diploma-course", student?.name],
    queryFn: () =>
      frappe.list<ProgramEnrollmentRow>("Program Enrollment", {
        filters: [["student", "=", student!.name]],
        fields: ["program"],
        order_by: "enrollment_date desc",
        limit_page_length: 1,
      }),
    enabled: !!student,
  })
  const program = programEnrollmentQuery.data?.[0]?.program ?? ""

  const programQuery = useQuery({
    queryKey: ["Program", "diploma-course", program],
    queryFn: () => frappe.getDoc<ProgramRow>("Program", program),
    enabled: !!program,
  })

  const genderQuery = useQuery({
    queryKey: ["Student", "diploma-gender", student?.name],
    queryFn: () => frappe.getDoc<StudentGenderRow>("Student", student!.name),
    enabled: !!student,
  })

  const programName = programQuery.data?.program_name ?? ""
  const isDiplomaCourse = !!programQuery.data?.is_diploma_course
  const credentialType = isDiplomaCourse ? "Diploma" : "Certificate"
  // Only prints a gendered pronoun when Gender is unambiguously "Male" or
  // "Female" — an unset Gender or any other value (e.g. "Other") falls back
  // to the neutral singular "their" instead of silently guessing "her".
  const pronoun =
    genderQuery.data?.gender === "Male" ? "his" : genderQuery.data?.gender === "Female" ? "her" : "their"

  const createMutation = useMutation({
    // `vars` are exactly what handlePrint passed to .mutate(vars) for THIS
    // click — react-query does not rebind them if the component re-renders
    // while the request is still in flight, so onSuccess stays consistent
    // with what was actually just saved (same reasoning as the transcript
    // screen's own createMutation).
    mutationFn: (vars: { payload: Record<string, unknown>; snapshot: PrintSnapshot }) =>
      frappe.createDoc<DiplomaRecord>("SMS Diploma", vars.payload),
    onSuccess: (saved, vars) => {
      toast.success("Diploma created")
      queryClient.invalidateQueries({ queryKey: ["SMS Diploma"] })
      openPrintWindow(saved, vars.snapshot)
    },
    onError: (error) => {
      toast.error(`Could not create diploma: ${getErrorMessage(error)}`)
      printWindowRef.current?.close()
      printWindowRef.current = null
    },
  })

  async function openPrintWindow(saved: DiplomaRecord, snapshot: PrintSnapshot) {
    const printWindow = printWindowRef.current
    printWindowRef.current = null
    if (!printWindow) {
      toast.error("Diploma created, but the print window could not be opened. Check your browser's popup blocker.")
      return
    }

    const header = await ensurePrintHeader(printHeaderQuery)
    const logoImg = header?.logo ? `<img class="logo" src="${escapeHtml(header.logo)}" alt="" />` : ""
    const honorsLine = snapshot.fields.honors
      ? `<p class="honors">with the distinction of ${escapeHtml(snapshot.fields.honors)}</p>`
      : ""

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(snapshot.credentialType)} — ${escapeHtml(snapshot.studentName)}</title>
          <style>
            body { font-family: "Times New Roman", Times, serif; padding: 3rem 4rem; color: #111; text-align: center; }
            .border { border: 3px double #333; padding: 3rem 4rem; }
            .logo { height: 72px; width: 72px; object-fit: contain; margin: 0 auto 0.5rem; display: block; }
            .school-name { font-size: 1.5rem; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 2rem; }
            .intro { font-size: 0.95rem; color: #444; margin-bottom: 1rem; }
            .student-name { font-size: 2rem; font-weight: bold; margin: 0.5rem 0 1.5rem; border-bottom: 1px solid #999; display: inline-block; padding: 0 1rem 0.35rem; }
            .body-text { font-size: 1.05rem; line-height: 1.7; max-width: 40rem; margin: 0 auto 1rem; }
            .honors { font-style: italic; margin-bottom: 1.5rem; }
            .conferral { font-size: 0.9rem; margin: 2rem 0; }
            .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-top: 3rem; text-align: center; }
            .signatures div { border-top: 1px solid #333; padding-top: 0.35rem; font-size: 0.85rem; }
            .so-no { text-align: left; font-size: 0.75rem; color: #666; margin-top: 2rem; }
          </style>
        </head>
        <body>
          <div class="border">
            ${logoImg}
            <div class="school-name">${escapeHtml(header?.school_name)}</div>
            <p class="intro">This is to certify that</p>
            <div class="student-name">${escapeHtml(snapshot.studentName)}</div>
            <p class="body-text">
              has satisfactorily completed the requirements for this ${escapeHtml(snapshot.credentialType.toLowerCase())} for completing
              ${escapeHtml(snapshot.programName)}, in recognition of ${escapeHtml(snapshot.pronoun)} ability and scholarship in the field
              of study prescribed in the said Institute for such a Course.
            </p>
            ${honorsLine}
            <p class="conferral">${escapeHtml(conferralSentence(snapshot.fields.dateConferred))}</p>
            <div class="signatures">
              <div>${escapeHtml(snapshot.fields.registrarName)}<br/>Registrar</div>
              <div>${escapeHtml(snapshot.fields.vpAcademicAffairsName)}<br/>VP - Academic Affairs</div>
              <div>${escapeHtml(snapshot.fields.presidentName)}<br/>President</div>
            </div>
            <p class="so-no">S.O. No. ${escapeHtml(snapshot.fields.soNo)} — ${escapeHtml(saved.name)}</p>
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
    if (!fields.soNo.trim()) {
      toast.error("S.O. No. is required")
      return
    }
    if (!fields.dateConferred) {
      toast.error("Date Conferred is required")
      return
    }

    const payload = {
      student: student.name,
      program,
      credential_type: credentialType,
      so_no: fields.soNo,
      date_issued: fields.dateIssued || null,
      date_conferred: fields.dateConferred,
      honors: fields.honors || null,
      registrar_name: fields.registrarName || null,
      vp_academic_affairs_name: fields.vpAcademicAffairsName || null,
      president_name: fields.presidentName || null,
      remarks: fields.remarks || null,
    }
    const snapshot: PrintSnapshot = {
      studentName: titleCase(student.student_name),
      programName,
      credentialType,
      pronoun,
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
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-2xl sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Diploma</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5 min-w-0">
              <label className="text-xs text-muted-foreground">Student No.</label>
              <StudentSearch selected={student} onSelect={handleStudentSelect} idPrefix="diploma" />
            </div>
            <div className="grid gap-1.5 min-w-0">
              <label className="text-xs text-muted-foreground">Name</label>
              <div className="text-sm font-medium">{student?.student_name || "—"}</div>
            </div>
            <div className="grid gap-1.5 min-w-0">
              <label className="text-xs text-muted-foreground">Course</label>
              <div className="text-sm font-medium">
                {program ? `${programName || "…"} (${credentialType})` : "—"}
              </div>
            </div>
          </div>

          <section className="grid gap-4 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Details</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">S.O. No.</label>
                <Input value={fields.soNo} onChange={(e) => set("soNo", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Date Issued</label>
                <Input
                  type="date"
                  value={fields.dateIssued}
                  onChange={(e) => set("dateIssued", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Date Conferred</label>
                <Input
                  type="date"
                  value={fields.dateConferred}
                  onChange={(e) => set("dateConferred", e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">Honors/Distinction</label>
              <Input value={fields.honors} onChange={(e) => set("honors", e.target.value)} />
            </div>
            <Textarea
              placeholder="Remarks"
              value={fields.remarks}
              onChange={(e) => set("remarks", e.target.value)}
            />
          </section>

          <section className="grid gap-4 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Signatories</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Registrar</label>
                <Input value={fields.registrarName} onChange={(e) => set("registrarName", e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">VP - Academic Affairs</label>
                <Input
                  value={fields.vpAcademicAffairsName}
                  onChange={(e) => set("vpAcademicAffairsName", e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">President</label>
                <Input value={fields.presidentName} onChange={(e) => set("presidentName", e.target.value)} />
              </div>
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
