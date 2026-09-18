"use client"

import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import StudentSearch, { StudentOption } from "@/components/sms/StudentSearch"

interface TransferCredentialRecord {
  name: string
}

interface StudentRow {
  student: string
  studentName: string
  yearLevel: string
}

interface HeaderFields {
  credentialType: "Elementary" | "Secondary" | ""
  schoolName: string
  schoolAddress: string
  dateIssued: string
  registrarName: string
  remarks: string
}

interface PrintSnapshot {
  fields: HeaderFields
  rows: StudentRow[]
}

const BLANK_FIELDS: HeaderFields = {
  credentialType: "",
  schoolName: "",
  schoolAddress: "",
  dateIssued: "",
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

// Same suffix/hyphen-aware title casing as diploma.tsx and honorable-dismissal.tsx.
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
 * Transfer Credentials (Registrar > Reports > Student Credentials) — opened
 * as a Dialog from the card on that screen. Unlike Diploma/Honorable
 * Dismissal, this is a single letter addressed to a receiving school that
 * can cover a BATCH of several students at once (SMS Transfer Credential's
 * own "students" child table), matching the legacy VB system's basic-ed
 * (Elementary/Secondary) transferee credentials — this Institute's own
 * programs are College/Vocational, so "Type" here always describes the
 * students' prior/destination basic-ed schooling, never this Institute's.
 *
 * Deliberately does NOT reuse the generic ChildTableGrid (its cells are
 * plain text Inputs, so a "Student" column would mean typing an exact
 * Student ID by hand) — every other credential screen in this directory
 * uses the search-by-name-or-ID StudentSearch control, so this adds rows
 * the same way instead: search, set a Year Level, Add.
 */
export function TransferCredentials({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  // Print-only: the school letterhead, not needed for the form itself.
  const printHeaderQuery = usePrintHeader(open)

  const [fields, setFields] = useState(BLANK_FIELDS)
  const [rows, setRows] = useState<StudentRow[]>([])
  const [pendingStudent, setPendingStudent] = useState<StudentOption | null>(null)
  const [pendingYearLevel, setPendingYearLevel] = useState("")
  // StudentSearch only clears its own internal search text/results when the
  // registrar clicks its "Change" link — it has no effect watching
  // `selected` for an externally-driven reset like addRow's below, so a
  // stale query would otherwise reopen the just-closed results panel.
  // Bumping this key forces a fresh StudentSearch instance after every add.
  const [pickerKey, setPickerKey] = useState(0)

  const printWindowRef = useRef<Window | null>(null)

  function set<K extends keyof HeaderFields>(key: K, value: HeaderFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  function addRow() {
    if (!pendingStudent) {
      toast.error("Search for a student first")
      return
    }
    if (rows.some((r) => r.student === pendingStudent.name)) {
      toast.error("That student is already on this list")
      return
    }
    setRows((prev) => [
      ...prev,
      {
        student: pendingStudent.name,
        studentName: titleCase(pendingStudent.student_name),
        yearLevel: pendingYearLevel,
      },
    ])
    setPendingStudent(null)
    setPendingYearLevel("")
    setPickerKey((prev) => prev + 1)
  }

  function removeRow(student: string) {
    setRows((prev) => prev.filter((r) => r.student !== student))
  }

  const createMutation = useMutation({
    // `vars` are exactly what handlePrint passed to .mutate(vars) for THIS
    // click — react-query does not rebind them if the component re-renders
    // while the request is still in flight, same reasoning as diploma.tsx.
    mutationFn: (vars: { payload: Record<string, unknown>; snapshot: PrintSnapshot }) =>
      frappe.createDoc<TransferCredentialRecord>("SMS Transfer Credential", vars.payload),
    onSuccess: (saved, vars) => {
      toast.success("Transfer Credentials created")
      queryClient.invalidateQueries({ queryKey: ["SMS Transfer Credential"] })
      openPrintWindow(saved, vars.snapshot)
    },
    onError: (error) => {
      toast.error(`Could not create transfer credentials: ${getErrorMessage(error)}`)
      printWindowRef.current?.close()
      printWindowRef.current = null
    },
  })

  async function openPrintWindow(saved: TransferCredentialRecord, snapshot: PrintSnapshot) {
    const printWindow = printWindowRef.current
    printWindowRef.current = null
    if (!printWindow) {
      toast.error(
        "Transfer Credentials created, but the print window could not be opened. Check your browser's popup blocker."
      )
      return
    }

    const header = await ensurePrintHeader(printHeaderQuery)
    const logoImg = header?.logo ? `<img class="logo" src="${escapeHtml(header.logo)}" alt="" />` : ""

    const rowsHtml = snapshot.rows
      .map(
        (row, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(row.studentName)}</td>
            <td>${escapeHtml(row.yearLevel)}</td>
          </tr>`
      )
      .join("")

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Transfer Credentials — ${escapeHtml(snapshot.fields.schoolName)}</title>
          <style>
            body { font-family: "Times New Roman", Times, serif; padding: 3rem 4rem; color: #111; }
            .letterhead { text-align: center; }
            .logo { height: 72px; width: 72px; object-fit: contain; margin: 0 auto 0.5rem; display: block; }
            .school-name { font-size: 1.5rem; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 2rem; }
            .title { font-size: 1.2rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.15em; margin: 0 0 2rem; text-align: center; text-decoration: underline; }
            .addressee { margin-bottom: 1.5rem; }
            .body-text { font-size: 1.05rem; line-height: 1.8; margin-bottom: 1.25rem; text-align: justify; }
            table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }
            th, td { border: 1px solid #333; padding: 0.4rem 0.6rem; font-size: 0.95rem; text-align: left; }
            th:first-child, td:first-child { width: 3rem; text-align: center; }
            th:last-child, td:last-child { width: 8rem; }
            .signature { margin-top: 4rem; text-align: right; }
            .signature div { display: inline-block; border-top: 1px solid #333; padding-top: 0.35rem; font-size: 0.9rem; min-width: 14rem; }
            .doc-no { font-size: 0.75rem; color: #666; margin-top: 2rem; }
          </style>
        </head>
        <body>
          <div class="letterhead">
            ${logoImg}
            <div class="school-name">${escapeHtml(header?.school_name)}</div>
          </div>
          <div class="title">Transfer Credentials</div>
          <p class="body-text">Date: ${escapeHtml(formatDateLong(snapshot.fields.dateIssued))}</p>
          <div class="addressee">
            <p class="body-text" style="margin-bottom: 0;">The School Registrar</p>
            <p class="body-text" style="margin-bottom: 0;">${escapeHtml(snapshot.fields.schoolName)}</p>
            <p class="body-text">${escapeHtml(snapshot.fields.schoolAddress)}</p>
          </div>
          <p class="body-text">Dear Sir/Madam:</p>
          <p class="body-text">
            This is to certify that the ${escapeHtml(snapshot.fields.credentialType)} students listed below were
            enrolled in this Institute and are transferring to your school. Kindly extend to them the
            necessary academic accommodation appropriate to the year level indicated opposite each name.
          </p>
          <table>
            <thead>
              <tr><th>#</th><th>Name of Student</th><th>Year Level</th></tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          ${
            snapshot.fields.remarks
              ? `<p class="body-text">${escapeHtml(snapshot.fields.remarks)}</p>`
              : ""
          }
          <p class="body-text">Thank you very much.</p>
          <p class="body-text">Very truly yours,</p>
          <div class="signature">
            <div>${escapeHtml(snapshot.fields.registrarName)}<br/>Registrar</div>
          </div>
          <p class="doc-no">${escapeHtml(saved.name)}</p>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    await waitForImagesToLoad(printWindow.document)
    printWindow.print()
  }

  function handlePrint() {
    if (!fields.credentialType) {
      toast.error("Select a Type (Elementary/Secondary)")
      return
    }
    if (!fields.schoolName.trim()) {
      toast.error("School Name is required")
      return
    }
    if (!fields.schoolAddress.trim()) {
      toast.error("School Address is required")
      return
    }
    if (rows.length === 0) {
      toast.error("Add at least one student")
      return
    }

    const payload = {
      credential_type: fields.credentialType,
      school_name: fields.schoolName,
      school_address: fields.schoolAddress,
      date_issued: fields.dateIssued || null,
      registrar_name: fields.registrarName || null,
      remarks: fields.remarks || null,
      students: rows.map((r) => ({
        student: r.student,
        year_level: r.yearLevel ? Number(r.yearLevel) : null,
      })),
    }
    const snapshot: PrintSnapshot = { fields, rows }

    // Opened synchronously, inside the click handler's own call stack, so
    // popup blockers treat it as user-initiated even though the content is
    // written in later once createDoc resolves.
    printWindowRef.current = window.open("", "_blank", "width=1000,height=750")
    createMutation.mutate({ payload, snapshot })
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setFields(BLANK_FIELDS)
      setRows([])
      setPendingStudent(null)
      setPendingYearLevel("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-2xl sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transfer Credentials</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5">
          <section className="grid gap-4 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Addressed To</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Type</label>
                <Select
                  value={fields.credentialType}
                  onValueChange={(v) => set("credentialType", (v ?? "") as HeaderFields["credentialType"])}
                >
                  <SelectTrigger id="transfer-credentials-type" className="w-full">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Elementary">Elementary</SelectItem>
                    <SelectItem value="Secondary">Secondary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Date Issued</label>
                <Input type="date" value={fields.dateIssued} onChange={(e) => set("dateIssued", e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">School Name</label>
              <Input value={fields.schoolName} onChange={(e) => set("schoolName", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">School Address</label>
              <Input value={fields.schoolAddress} onChange={(e) => set("schoolAddress", e.target.value)} />
            </div>
          </section>

          <section className="grid gap-3 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Students</h3>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] items-end">
              <div className="grid gap-1.5 min-w-0">
                <label className="text-xs text-muted-foreground">Student No.</label>
                <StudentSearch
                  key={pickerKey}
                  selected={pendingStudent}
                  onSelect={setPendingStudent}
                  idPrefix="transfer-credentials"
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs text-muted-foreground">Year Level</label>
                <Input
                  type="number"
                  value={pendingYearLevel}
                  onChange={(e) => setPendingYearLevel(e.target.value)}
                />
              </div>
              <Button type="button" variant="outline" onClick={addRow}>
                Add
              </Button>
            </div>

            {rows.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name of Student</TableHead>
                      <TableHead>Year Level</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.student}>
                        <TableCell>{row.studentName}</TableCell>
                        <TableCell>{row.yearLevel || "—"}</TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.student)}>
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section className="grid gap-4 rounded-md border p-3">
            <h3 className="text-sm font-semibold">Details</h3>
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
