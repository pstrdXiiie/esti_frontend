import Link from "next/link"
import { ArrowUpRight, Scale, Receipt, ClipboardList, HandCoins, Users } from "lucide-react"

const reports = [
  { href: "/finance/financialreport/trial_balance", label: "Trial Balance", icon: Scale },
  { href: "/finance/financialreport/collection_for_the_period", label: "Collection for the Period", icon: Receipt },
  { href: "/finance/financialreport/assessment_for_the_period", label: "Assessment for the Period", icon: ClipboardList },
  { href: "/finance/financialreport/tuition_fee_receivables", label: "Tuition Fee Receivables", icon: HandCoins },
  { href: "/finance/financialreport/subsidiary_reports", label: "Subsidiary Reports", icon: Users },
]

export default function FinancialReportPage() {
  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Financial Reports
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a report below.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {reports.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/50 min-h-[110px]"
          >
            <div className="relative z-10 flex h-full flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
              </div>
              <span className="text-sm font-medium leading-snug text-foreground transition-colors duration-300">
                {label}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
