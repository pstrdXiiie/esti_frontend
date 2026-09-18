"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { frappe, getErrorMessage } from "@/lib/frappe"
import { FinanceMaintenanceScreen } from "@/components/finance/FinanceMaintenanceScreen"
import { canteenPcvSpec } from "@/lib/forms/purchasing"
import { Button } from "@/components/ui/button"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"

interface PcvRow {
  name: string
  payee: string
  ref_date?: string
  amount?: number
}

interface CompanyRow {
  name: string
}

export default function CanteenPcvListPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Petty Cash Canteen Entry</h1>
      <FinanceMaintenanceScreen spec={canteenPcvSpec} bordered={false} />
      <ReplenishmentPanel />
    </div>
  )
}

/**
 * Bespoke section below the generic list: pick several submitted,
 * not-yet-replenished PCVs (plain checkboxes per row — a proper multi-select
 * widget isn't worth building for this pass) plus a Company, then post them
 * all through campus_erp.api.finance_purchasing.create_replenishment_voucher
 * as one Journal Entry.
 */
function ReplenishmentPanel() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [company, setCompany] = useState("")

  const pcvsQuery = useQuery({
    queryKey: ["SMS Canteen PCV", "replenishable"],
    queryFn: () =>
      frappe.list<PcvRow>("SMS Canteen PCV", {
        fields: ["name", "payee", "ref_date", "amount"],
        filters: [
          ["docstatus", "=", 1],
          ["replenished", "=", 0],
        ],
        limit_page_length: 200,
      }),
  })

  const companiesQuery = useQuery({
    queryKey: ["Company", "list"],
    queryFn: () => frappe.list<CompanyRow>("Company", { limit_page_length: 100 }),
  })

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const selectedNames = useMemo(() => Array.from(selected), [selected])

  const replenishMutation = useMutation({
    mutationFn: () =>
      frappe.call<{ journal_entry: string; pcv_count: number; total_amount: number }>(
        "campus_erp.api.finance_purchasing.create_replenishment_voucher",
        { pcv_names: selectedNames, company }
      ),
    onSuccess: (result) => {
      toast.success(`Replenishment posted: Journal Entry ${result.journal_entry}`)
      setSelected(new Set())
      queryClient.invalidateQueries({ queryKey: ["SMS Canteen PCV"] })
    },
    onError: (error) => toast.error(`Could not create replenishment voucher: ${getErrorMessage(error)}`),
  })

  return (
    <div className="grid gap-3 rounded-md border p-4">
      <div>
        <h2 className="font-semibold">Create Replenishment Voucher</h2>
        <p className="text-sm text-muted-foreground">
          Select submitted PCVs that haven&apos;t been replenished yet, pick a Company, then post
          them all as one Journal Entry.
        </p>
      </div>

      {pcvsQuery.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>PCV</TableHead>
                <TableHead>Payee</TableHead>
                <TableHead>Reference Date</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pcvsQuery.data ?? []).map((row) => (
                <TableRow key={row.name}>
                  <TableCell>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selected.has(row.name)}
                      onChange={() => toggle(row.name)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.payee}</TableCell>
                  <TableCell>{row.ref_date ?? ""}</TableCell>
                  <TableCell>{row.amount ?? ""}</TableCell>
                </TableRow>
              ))}
              {(pcvsQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-center">
                    No submitted, unreplenished PCVs.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Separator />

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-64 gap-2">
          <label className="text-sm font-medium">Company</label>
          {companiesQuery.isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <Select value={company} onValueChange={(value) => setCompany(value ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a company…" />
              </SelectTrigger>
              <SelectContent>
                {(companiesQuery.data ?? []).map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button
          type="button"
          disabled={selectedNames.length === 0 || !company || replenishMutation.isPending}
          onClick={() => replenishMutation.mutate()}
        >
          {replenishMutation.isPending
            ? "Posting…"
            : `Create Replenishment Voucher${selectedNames.length ? ` (${selectedNames.length})` : ""}`}
        </Button>
      </div>
    </div>
  )
}
