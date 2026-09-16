"use client"

import { useState } from "react"

import { ReportCard } from "@/components/ui/registrar/reports/report-card"
import { OfficialTranscriptOfRecords } from "@/components/ui/registrar/reports/student-credentials/official-transcript-of-records"

interface ReportSection {
  title: string
}

const COMING_SOON_SECTIONS: ReportSection[] = [
  { title: "Diploma" },
  { title: "Honorable Dismissal" },
  { title: "Transfer Credentials" },
  { title: "Good Moral" },
  { title: "Certificate of Enrollment" },
]

export default function StudentCredentials() {
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  return (
    <div className="rounded-2xl border border-border h-full p-7">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
        <ReportCard
          title="Official Transcript of Records"
          description="Print a Request for Official Transcript of Records."
          available
          onClick={() => setTranscriptOpen(true)}
        />

        {COMING_SOON_SECTIONS.map((s) => (
          <ReportCard key={s.title} title={s.title} description="Not yet available." />
        ))}
      </div>

      <OfficialTranscriptOfRecords open={transcriptOpen} onOpenChange={setTranscriptOpen} />
    </div>
  )
}
