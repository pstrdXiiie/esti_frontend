"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Trash2Icon } from "lucide-react"

import { frappe, getErrorMessage } from "@/lib/frappe"
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
import StudentSearch, { StudentOption } from "@/components/sms/StudentSearch"
import AssessmentDialog from "@/components/ui/registrar/enrollment/pre-enrollment/assessment-dialog"
import { formatAcademicYearLabel } from "@/lib/utils"

interface ProgramEnrollmentRow {
  program: string
  year_level: number | null
}

interface LatestPreEnrollmentRow {
  academic_year: string
}

interface CurrentSemesterResult {
  track: string
  period: string | null
  semester: number
}

interface AcademicYearRow {
  name: string
  academic_year_name: string
}

interface CourseRow {
  name: string
  course_name: string
  subject_code: string
  unit: number
}

interface StudentGroupCourseRow {
  course: string
}

interface PreEnrollmentSubjectRow {
  subject: string
  subject_name: string
  subject_code: string
  unit: number
  prerequisite_met: boolean | number
}

interface PreEnrollmentRecord {
  name: string
  student: string
  student_name: string
  program: string
  academic_year: string
  semester: number
  year_level: number
  status: string
  total_units: number
  subjects: PreEnrollmentSubjectRow[]
  auto_enrollment?: {
    enrolled: Array<{ subject: string; student_group: string }>
    skipped: Array<{ subject: string; reason: string }>
    failed: Array<{ subject: string; reason: string }>
  } | null
}

const ENROLLMENT_STATUS_STEPS = [
  "Subject Listing",
  "Assessment",
  "Registration",
  "Finished",
]

/**
 * Pre-Enrollment tab: look up a student, confirm their current program and
 * term, generate (or resume) their prescribed subject listing, let the
 * registrar add/remove rows before Save, and show the live running total of
 * units across only the checked rows. Assessment is a nested dialog
 * (AssessmentDialog) launched from here; saving it there advances this
 * record's status through to Registration (see currentStatus below).
 * Printing is a later stage of the same Enrollment Status stepper — still
 * out of scope here.
 */
export default function PreEnrollment() {
  const router = useRouter()

  const [student, setStudent] = useState<StudentOption | null>(null)

  const [academicYear, setAcademicYear] = useState("")
  const [semester, setSemester] = useState("")

  const [record, setRecord] = useState<PreEnrollmentRecord | null>(null)
  const [rows, setRows] = useState<PreEnrollmentSubjectRow[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [addSubjectId, setAddSubjectId] = useState("")
  const [assessmentOpen, setAssessmentOpen] = useState(false)
  // Which student+term the currently-shown `record` belongs to, regardless
  // of whether it got there via auto-load or the manual button.
  const [loadedContextKey, setLoadedContextKey] = useState<string | undefined>(undefined)
  const [shownPrescribeError, setShownPrescribeError] = useState<unknown>(undefined)

  const programEnrollmentQuery = useQuery({
    queryKey: ["Program Enrollment", "latest", student?.name],
    queryFn: () =>
      frappe.list<ProgramEnrollmentRow>("Program Enrollment", {
        filters: [["student", "=", student!.name]],
        order_by: "creation desc",
        limit_page_length: 1,
        fields: ["program", "year_level"],
      }),
    enabled: !!student,
  })

  const program = programEnrollmentQuery.data?.[0]?.program ?? ""
  const latestYearLevel = programEnrollmentQuery.data?.[0]?.year_level
  const yearLevel = latestYearLevel != null ? String(latestYearLevel) : ""

  // Semester auto-derives from Administration > System Setup > Semester
  // (SMS Semester Setup) via the program's own track classification
  // (Program.semesters — Basic Education/Regular Semester/Tri Semester) —
  // this is the direct equivalent of the legacy system's showSemester(),
  // which joined the student's course to the Semester table the same way.
  // Re-synced whenever the resolved program changes, since a different
  // program can belong to a different track; the registrar can still edit
  // the field afterward, same as School Year already allows.
  const currentSemesterQuery = useQuery({
    queryKey: ["Semester", "current", program],
    queryFn: () =>
      frappe.call<CurrentSemesterResult>("campus_erp.api.registrar.get_current_semester", {
        program,
      }),
    enabled: !!program,
  })

  const [syncedSemesterForProgram, setSyncedSemesterForProgram] = useState<string | undefined>(undefined)
  if (program && program !== syncedSemesterForProgram && currentSemesterQuery.isFetched) {
    setSyncedSemesterForProgram(program)
    const resolved = currentSemesterQuery.data?.semester
    setSemester(resolved != null ? String(resolved) : "")
  }

  // A returning student's most recent Pre-Enrollment term, so School Year
  // defaults to it the moment the student is found — the registrar can
  // still change it for a different term, this just removes the need to
  // re-pick it every time for someone who's already been through this
  // before. Semester is NOT sourced from here (see currentSemesterQuery
  // below) — the legacy system never defaulted semester from a student's
  // own history either, only from the shared School Year Setup screen.
  const latestPreEnrollmentQuery = useQuery({
    queryKey: ["SMS Pre Enrollment", "latest-term", student?.name],
    queryFn: () =>
      frappe.list<LatestPreEnrollmentRow>("SMS Pre Enrollment", {
        filters: [["student", "=", student!.name]],
        fields: ["academic_year"],
        order_by: "creation desc",
        limit_page_length: 1,
      }),
    enabled: !!student,
  })

  const [syncedTermForStudent, setSyncedTermForStudent] = useState<string | undefined>(undefined)
  if (student && student.name !== syncedTermForStudent && latestPreEnrollmentQuery.isFetched) {
    setSyncedTermForStudent(student.name)
    const latest = latestPreEnrollmentQuery.data?.[0]
    setAcademicYear(latest ? latest.academic_year : "")
  }

  const academicYearsQuery = useQuery({
    queryKey: ["Academic Year", "list", "pre-enrollment"],
    queryFn: () =>
      frappe.list<AcademicYearRow>("Academic Year", {
        fields: ["name", "academic_year_name"],
        order_by: "year_start_date desc",
      }),
  })

  const coursesQuery = useQuery({
    queryKey: ["Course", "list", "pre-enrollment"],
    queryFn: () =>
      frappe.list<CourseRow>("Course", {
        fields: ["name", "course_name", "subject_code", "unit"],
        limit_page_length: 500,
      }),
  })

  // Which subjects the Classes tab has actually offered a class for, at this
  // program/academic year — ignoring Section, since a student isn't
  // sectioned yet at the Pre-Enrollment (Subject Listing) stage. A subject
  // with no offered class anywhere can't really be pre-enrolled into, so
  // it's filtered out of the prescribed listing below rather than shown as
  // a dead-end checkbox.
  //
  // Deliberately NOT scoped by year_level/semester: Student Group has no
  // such fields (confirmed against the live schema — it only carries
  // academic_term, which isn't populated in practice), so a class offered
  // for a course is offered for that course full stop, at this program and
  // academic year.
  //
  // Once a record is loaded, this must key off the RECORD's own
  // program/academic_year, not the header's — an existing SMS Pre
  // Enrollment is looked up by (student, academic_year, semester) alone, so
  // a record saved under one program can resurface later after the header's
  // own program selection has moved on.
  const effectiveProgram = record?.program ?? program
  const effectiveAcademicYear = record?.academic_year ?? academicYear

  const offeredClassesQuery = useQuery({
    queryKey: ["Student Group", "offered-courses", effectiveProgram, effectiveAcademicYear],
    queryFn: () =>
      frappe.list<StudentGroupCourseRow>("Student Group", {
        filters: [
          ["program", "=", effectiveProgram],
          ["academic_year", "=", effectiveAcademicYear],
          ["group_based_on", "=", "Course"],
        ],
        fields: ["course"],
        limit_page_length: 500,
      }),
    enabled: !!effectiveProgram && !!effectiveAcademicYear,
  })

  const offeredSubjects = offeredClassesQuery.data
    ? new Set(offeredClassesQuery.data.map((r) => r.course))
    : null

  // yearLevel is a string, so `!!yearLevel` treats "0" as set (a non-empty
  // string is always truthy) - but an Int field's zero value here means the
  // Program Enrollment's Year Level was never actually assigned yet, not a
  // real "Year Level 0". Letting that through used to seed a Pre Enrollment
  // against curriculum subjects that don't exist at year_level 0, silently
  // saving an empty listing that a later Year Level correction can't fix
  // (get_or_create_pre_enrollment's lookup key doesn't include year_level,
  // so it just keeps returning that same stale empty record).
  const canPrescribe =
    !!student &&
    !!program &&
    !!academicYear &&
    !!semester &&
    Number(yearLevel) > 0 &&
    !!offeredSubjects

  // Existence-only check, mirroring get_or_create_pre_enrollment's own
  // lookup key (student + academic_year + semester — year_level/program
  // aren't part of it). This never creates anything: it only tells us
  // whether the student has ALREADY prescribed-and-saved a listing for this
  // term, so auto-loading can surface that without also auto-generating a
  // fresh curriculum-derived one for a student who hasn't gone through
  // Prescribed Classes yet — that stays an explicit button click below.
  const existingRecordQuery = useQuery({
    queryKey: ["SMS Pre Enrollment", "exists", student?.name, academicYear, semester],
    queryFn: () =>
      frappe.list<{ name: string; total_units: number }>("SMS Pre Enrollment", {
        filters: [
          ["student", "=", student!.name],
          ["academic_year", "=", academicYear],
          ["semester", "=", Number(semester)],
        ],
        fields: ["name", "total_units"],
        limit_page_length: 1,
      }),
    enabled: !!student && !!academicYear && !!semester,
  })

  const hasSavedSubjects = (existingRecordQuery.data?.[0]?.total_units ?? 0) > 0
  const canAutoLoad = canPrescribe && hasSavedSubjects

  const autoLoadQuery = useQuery({
    queryKey: [
      "SMS Pre Enrollment",
      "get-or-create",
      student?.name,
      program,
      academicYear,
      semester,
      yearLevel,
    ],
    queryFn: () =>
      frappe.call<PreEnrollmentRecord>(
        "campus_erp.api.registrar.get_or_create_pre_enrollment",
        {
          student: student!.name,
          program,
          academic_year: academicYear,
          semester: Number(semester),
          year_level: Number(yearLevel),
        }
      ),
    enabled: canAutoLoad,
  })

  // Identifies which student+term the currently-shown `record` belongs to,
  // regardless of whether it got there via auto-load or the manual button —
  // as soon as the header fields resolve to a different context than this,
  // the stale listing is cleared rather than left showing the wrong
  // student/term.
  const contextKey = student ? `${student.name}|${program}|${academicYear}|${semester}|${yearLevel}` : undefined

  const prescribeMutation = useMutation({
    mutationFn: () =>
      frappe.call<PreEnrollmentRecord>(
        "campus_erp.api.registrar.get_or_create_pre_enrollment",
        {
          student: student!.name,
          program,
          academic_year: academicYear,
          semester: Number(semester),
          year_level: Number(yearLevel),
        }
      ),
    onSuccess: (result) => {
      setRecord(result)
      setRows(result.subjects)
      setChecked(new Set(result.subjects.map((s) => s.subject)))
      setLoadedContextKey(contextKey)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  if (record && contextKey !== loadedContextKey) {
    setRecord(null)
    setRows([])
    setChecked(new Set())
  }
  if (autoLoadQuery.data && contextKey && contextKey !== loadedContextKey) {
    setRecord(autoLoadQuery.data)
    setRows(autoLoadQuery.data.subjects)
    setChecked(new Set(autoLoadQuery.data.subjects.map((s) => s.subject)))
    setLoadedContextKey(contextKey)
  }
  if (autoLoadQuery.isError && autoLoadQuery.error !== shownPrescribeError) {
    setShownPrescribeError(autoLoadQuery.error)
    toast.error(getErrorMessage(autoLoadQuery.error))
  }

  // The subject list actually shown/interacted with — rows are kept
  // unfiltered above so nothing saved to the record is silently lost, but
  // only subjects with an offered class ever reach the table, checkboxes,
  // Total Units, or Save.
  const visibleRows = offeredSubjects ? rows.filter((r) => offeredSubjects.has(r.subject)) : rows

  const saveMutation = useMutation({
    mutationFn: () =>
      frappe.call<PreEnrollmentRecord>(
        "campus_erp.api.registrar.save_pre_enrollment",
        {
          name: record!.name,
          subjects: visibleRows
            .filter((r) => checked.has(r.subject))
            .map((r) => ({ subject: r.subject })),
        }
      ),
    onSuccess: (result) => {
      setRecord(result)
      setRows(result.subjects)
      setChecked(new Set(result.subjects.map((s) => s.subject)))
      toast.success("Pre-enrollment saved")
      const autoEnrollment = result.auto_enrollment
      if (autoEnrollment && autoEnrollment.enrolled.length > 0) {
        const count = autoEnrollment.enrolled.length
        toast.success(`Enrolled in ${count} class${count === 1 ? "" : "es"} from prescribed subjects`)
      }
      if (autoEnrollment) {
        const needsAttention = autoEnrollment.skipped.length + autoEnrollment.failed.length
        if (needsAttention > 0) {
          toast.info(
            `${needsAttention} prescribed subject${needsAttention === 1 ? "" : "s"} could not be auto-enrolled — see Add/Remove Subjects`
          )
        }
      }
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const allChecked = visibleRows.length > 0 && visibleRows.every((r) => checked.has(r.subject))

  const toggleAll = (value: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev)
      for (const r of visibleRows) {
        if (value) next.add(r.subject)
        else next.delete(r.subject)
      }
      return next
    })
  }

  const toggleRow = (subject: string, value: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (value) {
        next.add(subject)
      } else {
        next.delete(subject)
      }
      return next
    })
  }

  const removeRow = (subject: string) => {
    setRows((prev) => prev.filter((r) => r.subject !== subject))
    setChecked((prev) => {
      const next = new Set(prev)
      next.delete(subject)
      return next
    })
  }

  const handleAddSubject = () => {
    if (!addSubjectId) return
    if (rows.some((r) => r.subject === addSubjectId)) {
      toast.info("Subject is already in the list")
      return
    }
    const course = (coursesQuery.data ?? []).find((c) => c.name === addSubjectId)
    setRows((prev) => [
      ...prev,
      {
        subject: addSubjectId,
        subject_name: course?.course_name ?? addSubjectId,
        subject_code: course?.subject_code ?? "",
        unit: course?.unit ?? 0,
        prerequisite_met: false,
      },
    ])
    setChecked((prev) => new Set(prev).add(addSubjectId))
    setAddSubjectId("")
  }

  const totalUnits = visibleRows
    .filter((r) => checked.has(r.subject))
    .reduce((sum, r) => sum + (Number(r.unit) || 0), 0)

  // Reflects what's actually saved on the record, not whether Save was
  // clicked this session — a returning student who already has prescribed
  // subjects can go straight to Assessment.
  const canAssess = !!record && record.subjects.length > 0
  // The backend only ever advances record.status once — to "Registration",
  // when save_assessment() successfully finalizes and submits the
  // assessment — so the first two steps still use the same client-side
  // heuristic as before (nothing writes "Subject Listing" -> "Assessment"
  // on the backend), but "Registration"/"Finished" are real saved values
  // once reached and take priority over that heuristic.
  const currentStatus =
    record?.status === "Registration" || record?.status === "Finished"
      ? record.status
      : canAssess
        ? "Assessment"
        : "Subject Listing"

  return (
    <div className="rounded-2xl border border-border h-full p-7">
      <div className="grid gap-5 md:grid-cols-4 items-start w-full pb-5">
        <div className="grid grid-cols-2 col-span-3 gap-5 items-start">
          {/* StudentSearch (Input w-56 + button) needs more room than one
              ~200px grid column - previously it overflowed sideways into
              the School Year column. Give it its own full-width row. */}
          <div className="col-span-2 flex gap-5 items-center">
            <StudentSearch
              selected={student}
              onSelect={setStudent}
              idPrefix="pre-enrollment"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/registrar/students/new")}
            >
              Add Students
            </Button>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="pre-enrollment-school-year">School Year</label>
            <Select
              value={academicYear}
              onValueChange={(v) => setAcademicYear(v ?? "")}
            >
              <SelectTrigger id="pre-enrollment-school-year" className="w-full">
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

          <div className="flex gap-5 items-center">
            <label htmlFor="course">Course:</label>
            <label htmlFor="course">{program || "—"}</label>
          </div>

          <div className="flex gap-5 items-center">
            <label htmlFor="pre-enrollment-semester">Semester</label>
            <Input
              id="pre-enrollment-semester"
              type="number"
              className="w-24"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            />
            {currentSemesterQuery.data?.period && semester === String(currentSemesterQuery.data.semester) && (
              <span className="text-xs text-muted-foreground">
                {currentSemesterQuery.data.period}
              </span>
            )}
          </div>

          <div className="flex gap-5 items-center">
            <label htmlFor="pre-enrollment-year-level">Year Level</label>
            <label htmlFor="pre-enrollment-year-level">{yearLevel || "—"}</label>
          </div>
        </div>

        <div>
          <div className="gap-5 col-span-auto">
            <fieldset className="grid gap-2">
              <legend className="mb-2">Enrollment Status</legend>
              <div className="flex flex-col gap-2 w-[120px]">
                {ENROLLMENT_STATUS_STEPS.map((step) => (
                  <span
                    key={step}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      step === currentStatus
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step}
                  </span>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 mb-3">
        {autoLoadQuery.isFetching && (
          <span className="text-sm text-muted-foreground">Loading saved subject listing…</span>
        )}
        <Button
          type="button"
          disabled={!canPrescribe || prescribeMutation.isPending}
          onClick={() => prescribeMutation.mutate()}
        >
          {prescribeMutation.isPending ? "Loading…" : "Prescribed Classes"}
        </Button>
      </div>

      {record && (
        <div className="flex items-end justify-between gap-3 mb-3">
          <div className="flex items-end gap-2">
            <div className="grid gap-2">
              <label htmlFor="pre-enrollment-add-subject">Add Subject</label>
              <Select value={addSubjectId} onValueChange={(v) => setAddSubjectId(v ?? "")}>
                <SelectTrigger id="pre-enrollment-add-subject" className="w-64">
                  <SelectValue placeholder="Select a subject…" />
                </SelectTrigger>
                <SelectContent>
                  {(coursesQuery.data ?? [])
                    .filter((c) => !offeredSubjects || offeredSubjects.has(c.name))
                    .map((c) => (
                    <SelectItem key={c.name} value={c.name}>
                      {c.subject_code ? `${c.subject_code} — ${c.course_name}` : c.course_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" disabled={!addSubjectId} onClick={handleAddSubject}>
              Add
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  disabled={!record}
                  checked={allChecked}
                  onChange={(e) => toggleAll(e.target.checked)}
                  aria-label="Check all"
                />
              </TableHead>
              <TableHead>Subject Code</TableHead>
              <TableHead>Subject Name</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Prerequisite</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {record &&
              visibleRows.map((r) => (
                <TableRow key={r.subject}>
                  <TableCell>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked.has(r.subject)}
                      onChange={(e) => toggleRow(r.subject, e.target.checked)}
                      aria-label={`Check ${r.subject_name}`}
                    />
                  </TableCell>
                  <TableCell>{r.subject_code}</TableCell>
                  <TableCell className="font-medium">{r.subject_name}</TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell>
                    {r.prerequisite_met ? (
                      <Badge variant="secondary">Met</Badge>
                    ) : (
                      <Badge variant="destructive">Not Met</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeRow(r.subject)}
                      aria-label={`Remove ${r.subject_name}`}
                    >
                      <Trash2Icon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            {record && visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground text-center">
                  No subjects in this listing.
                </TableCell>
              </TableRow>
            )}
            {!record && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground text-center">
                  {autoLoadQuery.isFetching || prescribeMutation.isPending
                    ? "Loading…"
                    : "Select a student, School Year, and Semester, then click Prescribed Classes to view the subject listing."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {record && (
        <div className="flex justify-between items-center mt-4">
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canAssess}
              onClick={() => setAssessmentOpen(true)}
            >
              Assessment
            </Button>
            {(currentStatus === "Registration" || currentStatus === "Finished") && student && (
              <Button
                type="button"
                onClick={() =>
                  router.push(
                    `/finance?tab=grades&sub=payments-cash-receipt-entry&student=${encodeURIComponent(student.name)}`
                  )
                }
              >
                Go to Payment
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-border px-4 py-2 text-right">
            <div className="text-xs text-muted-foreground">Total Units</div>
            <div className="text-xl font-bold">{totalUnits}</div>
          </div>
        </div>
      )}

      {record && student && (
        <AssessmentDialog
          open={assessmentOpen}
          onOpenChange={setAssessmentOpen}
          preEnrollmentName={record.name}
          student={student}
          program={record.program}
          academicYearLabel={formatAcademicYearLabel(
            (academicYearsQuery.data ?? []).find((ay) => ay.name === record.academic_year)
              ?.academic_year_name ?? record.academic_year
          )}
          semester={record.semester}
          yearLevel={record.year_level}
          onSaved={() =>
            setRecord((prev) => (prev ? { ...prev, status: "Registration" } : prev))
          }
        />
      )}
    </div>
  )
}
