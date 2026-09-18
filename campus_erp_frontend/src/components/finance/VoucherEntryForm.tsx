"use client"

import { useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { GLEntryGrid } from "@/components/sms/GLEntryGrid"
import { frappe, getErrorMessage } from "@/lib/frappe"
import { financeRowInput, financeRowSelect, financePrimaryButton } from "@/lib/finance-ui"
import { FinancePropertySection } from "@/components/finance/FinancePropertyPanel"
import type { ChildTableSpec } from "@/lib/forms/types"

export interface VoucherEntryFormProps {
  title: string
  description: string
  docLabel: string
  namingSeriesOptions: string[]
  childSpec: ChildTableSpec
  saveLabel: string
  /** Real parent doctype to POST to, e.g. "SMS Journal Voucher". */
  parentDoctype: string
  /** JSON fieldname of the child table on the parent doctype. Defaults to "accounts". */
  accountsFieldname?: string
  onSave?: (payload: Record<string, unknown>) => void
  /** Real backend fieldname for the credit total, when it isn't "total_credit"
   *  (e.g. SMS Journal Voucher misspells it as "total_currcy"). */
  totalCreditFieldname?: string
}

export function VoucherEntryForm({
  title,
  description,
  docLabel,
  namingSeriesOptions,
  childSpec,
  saveLabel,
  parentDoctype,
  accountsFieldname = "accounts",
  onSave,
  totalCreditFieldname = "total_credit",
}: VoucherEntryFormProps) {
  const queryClient = useQueryClient()
  const [namingSeries, setNamingSeries] = useState(namingSeriesOptions[0])
  const [manualMode, setManualMode] = useState(false)
  const [manualNumber, setManualNumber] = useState("")
  const [postingDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [remark, setRemark] = useState("")
  const [accounts, setAccounts] = useState<Array<Record<string, unknown>>>([])

  const totals = useMemo<{ debit: number; credit: number }>(() => {
    return accounts.reduce<{ debit: number; credit: number }>(
      (acc, r) => {
        acc.debit += Number(r.debit ?? 0)
        acc.credit += Number(r.credit ?? 0)
        return acc
      },
      { debit: 0, credit: 0 }
    )
  }, [accounts])

  const isBalanced = accounts.length > 0 && totals.debit === totals.credit
  const manualNumberValid = !manualMode || manualNumber.trim().length > 0
  const canSave = isBalanced && manualNumberValid

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => frappe.createDoc(parentDoctype, payload),
    onSuccess: (result: { name?: string }) => {
      toast.success(`${title} saved${result?.name ? `: ${result.name}` : ""}`)
      setAccounts([])
      setRemark("")
      setManualNumber("")
      queryClient.invalidateQueries({ queryKey: [parentDoctype] })
    },
    onError: (error) => toast.error(`Could not save ${title}: ${getErrorMessage(error)}`),
  })

  function handleSave() {
    // GLEntryGrid always builds rows with literal "debit"/"credit" keys.
    // Remap to this child doctype's real fieldnames before saving — e.g.
    // SMS Petty Cash Account Entry stores credit as "creadit".
    const debitCol = childSpec.columns.find((c) => c.label.toLowerCase() === "debit")
    const creditCol = childSpec.columns.find((c) => c.label.toLowerCase() === "credit")

    const backendAccounts = accounts.map((row) => {
      const out: Record<string, unknown> = { ...row }
      if (debitCol && debitCol.fieldname !== "debit") {
        out[debitCol.fieldname] = out.debit
        delete out.debit
      }
      if (creditCol && creditCol.fieldname !== "credit") {
        out[creditCol.fieldname] = out.credit
        delete out.credit
      }
      return out
    })

    const payload: Record<string, unknown> = {
      posting_date: postingDate,
      user_remark: remark,
      [accountsFieldname]: backendAccounts,
      total_debit: totals.debit,
      [totalCreditFieldname]: totals.credit,
    }

    if (manualMode) {
      // Explicit name bypasses naming_series autogeneration in Frappe.
      payload.name = manualNumber.trim()
    } else {
      payload.naming_series = namingSeries
    }

    if (onSave) {
      onSave(payload)
    } else {
      saveMutation.mutate(payload)
    }
  }

  return (
    <div className="grid max-w-3xl gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <FinancePropertySection title="Details">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground sm:col-span-2">
            <input
              type="checkbox"
              checked={manualMode}
              onChange={(e) => setManualMode(e.target.checked)}
            />
            Enter {docLabel} manually
          </label>

          {manualMode ? (
            <label className="grid gap-1 text-sm font-medium text-muted-foreground">
              {docLabel}
              <input
                className={`rounded border border-border ${financeRowInput}`}
                type="text"
                value={manualNumber}
                onChange={(e) => setManualNumber(e.target.value)}
                placeholder="Enter voucher number…"
              />
            </label>
          ) : (
            <label className="grid gap-1 text-sm font-medium text-muted-foreground">
              {docLabel}
              <select
                className={`rounded border border-border ${financeRowSelect}`}
                value={namingSeries}
                onChange={(e) => setNamingSeries(e.target.value)}
              >
                {namingSeriesOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="grid gap-1 text-sm font-medium text-muted-foreground">
            Date
            <input
              className={`rounded border border-border bg-muted text-muted-foreground ${financeRowInput}`}
              type="text"
              value={postingDate}
              readOnly
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-muted-foreground sm:col-span-2">
            Notes
            <textarea
              className={`min-h-[72px] rounded border border-border ${financeRowInput}`}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Reason for this entry…"
            />
          </label>
        </div>
      </FinancePropertySection>

      <GLEntryGrid spec={childSpec} rows={accounts} onChange={setAccounts} />

      <FinancePropertySection title="Totals">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-border bg-muted p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Debit</p>
            <p className="mt-1 font-mono text-base text-foreground">₱{totals.debit.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Credit</p>
            <p className="mt-1 font-mono text-base text-foreground">₱{totals.credit.toFixed(2)}</p>
          </div>
        </div>
      </FinancePropertySection>

      <div className="flex items-center justify-end gap-3">
        {accounts.length > 0 && !isBalanced && (
          <span className="text-xs text-destructive">Debits and credits must match before saving.</span>
        )}
        {manualMode && !manualNumberValid && (
          <span className="text-xs text-destructive">Enter a voucher number.</span>
        )}
        <button
          type="button"
          className={financePrimaryButton}
          onClick={handleSave}
          disabled={!canSave || saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  )
}