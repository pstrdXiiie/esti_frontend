"use client"

import { useState } from "react"

import { ReportCard } from "@/components/ui/registrar/reports/report-card"
import { OfficialTranscriptOfRecords } from "@/components/ui/registrar/reports/student-credentials/official-transcript-of-records"
import { Diploma } from "@/components/ui/registrar/reports/student-credentials/diploma"
import { HonorableDismissal } from "@/components/ui/registrar/reports/student-credentials/honorable-dismissal"
import { TransferCredentials } from "@/components/ui/registrar/reports/student-credentials/transfer-credentials"
import { GoodMoral } from "@/components/ui/registrar/reports/student-credentials/good-moral"
import { CertificateOfEnrollment } from "@/components/ui/registrar/reports/student-credentials/certificate-of-enrollment"

export default function StudentCredentials() {
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [diplomaOpen, setDiplomaOpen] = useState(false)
  const [honorableDismissalOpen, setHonorableDismissalOpen] = useState(false)
  const [transferCredentialsOpen, setTransferCredentialsOpen] = useState(false)
  const [goodMoralOpen, setGoodMoralOpen] = useState(false)
  const [certificateOfEnrollmentOpen, setCertificateOfEnrollmentOpen] = useState(false)

  return (
    <div className="rounded-2xl border border-border h-full p-7">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
        <ReportCard
          title="Official Transcript of Records"
          description="Print a Request for Official Transcript of Records."
          available
          onClick={() => setTranscriptOpen(true)}
        />
        <ReportCard
          title="Diploma"
          description="Print a Diploma or Certificate for a graduating student."
          available
          onClick={() => setDiplomaOpen(true)}
        />
        <ReportCard
          title="Honorable Dismissal"
          description="Print an Honorable Dismissal for a transferring or graduating student."
          available
          onClick={() => setHonorableDismissalOpen(true)}
        />
        <ReportCard
          title="Transfer Credentials"
          description="Print a Transfer Credentials letter for one or more transferring students."
          available
          onClick={() => setTransferCredentialsOpen(true)}
        />
        <ReportCard
          title="Good Moral"
          description="Print a Certificate of Good Moral Character for a student."
          available
          onClick={() => setGoodMoralOpen(true)}
        />
        <ReportCard
          title="Certificate of Enrollment"
          description="Print a Certificate of Enrollment for a student."
          available
          onClick={() => setCertificateOfEnrollmentOpen(true)}
        />
      </div>

      <OfficialTranscriptOfRecords open={transcriptOpen} onOpenChange={setTranscriptOpen} />
      <Diploma open={diplomaOpen} onOpenChange={setDiplomaOpen} />
      <HonorableDismissal open={honorableDismissalOpen} onOpenChange={setHonorableDismissalOpen} />
      <TransferCredentials open={transferCredentialsOpen} onOpenChange={setTransferCredentialsOpen} />
      <GoodMoral open={goodMoralOpen} onOpenChange={setGoodMoralOpen} />
      <CertificateOfEnrollment open={certificateOfEnrollmentOpen} onOpenChange={setCertificateOfEnrollmentOpen} />
    </div>
  )
}
