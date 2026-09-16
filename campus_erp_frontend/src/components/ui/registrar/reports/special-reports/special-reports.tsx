import { ReportCard } from "@/components/ui/registrar/reports/report-card"

interface ReportSection {
  title: string
}

const SECTIONS: ReportSection[] = [
  { title: "Classes with No Grades" },
  { title: "Faculty Load" },
  { title: "Not Yet Assessed Students" },
  { title: "Permit List" },
  { title: "ID List" },
  { title: "Submitted Credentials" },
  { title: "Ranking Students" },
  { title: "Generate ID" },
]

export default function SpecialReports() {
  return (
    <div className="rounded-2xl border border-border h-full p-7">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
        {SECTIONS.map((s) => (
          <ReportCard key={s.title} title={s.title} description="Not yet available." />
        ))}
      </div>
    </div>
  )
}
