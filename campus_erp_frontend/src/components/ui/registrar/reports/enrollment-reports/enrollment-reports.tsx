"use client"

import { useState } from "react"

import { ReportCard } from "@/components/ui/registrar/reports/report-card"
import { EnrollmentStatistics } from "@/components/ui/registrar/reports/enrollment-reports/enrollment-statistics"
import { EnrollmentListing } from "@/components/ui/registrar/reports/enrollment-reports/enrollment-listing"
import { EnrollmentListingWithSubjects } from "@/components/ui/registrar/reports/enrollment-reports/enrollment-listing-with-subjects"
import { EnrollmentSummary } from "@/components/ui/registrar/reports/enrollment-reports/enrollment-summary"

export default function EnrollmentReports() {
  const [statisticsOpen, setStatisticsOpen] = useState(false)
  const [listingOpen, setListingOpen] = useState(false)
  const [listingWithSubjectsOpen, setListingWithSubjectsOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)

  return (
    <div className="rounded-2xl border border-border h-full p-7">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
        <ReportCard
          title="Enrollment Statistics"
          description="Headcount per program and year level for a school year."
          available
          onClick={() => setStatisticsOpen(true)}
        />
        <ReportCard
          title="Enrollment Listing"
          description="Roster of students enrolled for a school year, by course or curriculum."
          available
          onClick={() => setListingOpen(true)}
        />
        <ReportCard
          title="Enrollment Listing with Subjects"
          description="Roster with each student's enrolled subjects and units."
          available
          onClick={() => setListingWithSubjectsOpen(true)}
        />
        <ReportCard
          title="Enrollment Summary"
          description="Male/Female headcount by program, for College, Vocational, or High School."
          available
          onClick={() => setSummaryOpen(true)}
        />
      </div>

      <EnrollmentStatistics open={statisticsOpen} onOpenChange={setStatisticsOpen} />
      <EnrollmentListing open={listingOpen} onOpenChange={setListingOpen} />
      <EnrollmentListingWithSubjects open={listingWithSubjectsOpen} onOpenChange={setListingWithSubjectsOpen} />
      <EnrollmentSummary open={summaryOpen} onOpenChange={setSummaryOpen} />
    </div>
  )
}
