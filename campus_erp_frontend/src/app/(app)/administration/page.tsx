import Link from "next/link"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const SCREENS = [
  {
    href: "/administration/system-setup",
    title: "System Setup",
    description: "Core setup data referenced across modules, such as academic semesters.",
  },
  {
    href: "/administration/codes",
    title: "Codes",
    description: "Lookup codes for nationality, religion, fees, scholarships, and library categories.",
  },
  {
    href: "/administration/brackets",
    title: "Statutory Brackets",
    description: "SSS/PhilHealth/Pag-IBIG contribution bracket tables referenced by payroll.",
  },
  {
    href: "/administration/override-log",
    title: "Override Log",
    description: "Audit trail of business-rule overrides across every module.",
  },
  {
    href: "/administration/event-log",
    title: "Event Log",
    description: "System activity: logins, updates, deletes, and approvals.",
  },
  {
    href: "/administration/sessions",
    title: "Active Sessions",
    description: "Users currently logged in, with login time and IP address.",
  },
  {
    href: "/administration/approvals",
    title: "Pending Approvals",
    description: "Records awaiting recommendation or approval across every workflow.",
  },
]

export default function AdministrationPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Administration</h1>
        <p className="text-muted-foreground">
          System codes, statutory brackets, audit trails, and session monitoring.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SCREENS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
