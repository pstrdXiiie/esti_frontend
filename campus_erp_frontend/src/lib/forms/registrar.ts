import type { EntrySpec, FormSpec } from "@/lib/forms/types"

/**
 * Registrar module specs (blueprint Phase 1). Field lists mirror the real
 * installed DocTypes plus the PH-specific custom fields added in
 * campus_erp/setup/custom_fields.py — see IMPLEMENTATION-MAPPING.md's
 * Registrar section for the terminology swap: blueprint "Course" (degree
 * program) == Education "Program"; blueprint "Subject" == Education "Course".
 * Link fields are entered as the exact document name (Program/Course/Student
 * Group all autoname off their own name field, so this is human-typable).
 */

export const studentSpec: FormSpec = {
  doctype: "Student",
  title: "Students",
  addPath: "/registrar/students/new",
  statusField: { fieldname: "sms_status", droppedValue: "Dropped", label: "Drop" },
  cascadeDeleteDoctypes: [
    "SMS Graduation Batch",
    "SMS Pre Enrollment",
    "Program Enrollment",
    "Course Enrollment",
    "Payment Ledger Entry",
    "GL Entry",
    "SMS Credit",
    "SMS Transferee Grade",
  ],
  cancelAndDeleteDoctypes: ["SMS Student Assessment", "Payment Entry"],
  quickLinks: [
    {
      label: "View Student Account",
      hrefFor: (row) => `/finance/transactions/student_acc?q=${encodeURIComponent(String(row.name))}`,
    },
  ],
  fields: [
    { fieldname: "student_name", label: "Student Name", fieldtype: "Data", readOnly: true, inListView: true, section: "Personal Information" },
    { fieldname: "first_name", label: "First Name", fieldtype: "Data", required: true, inListView: true, section: "Personal Information" },
    { fieldname: "middle_name", label: "Middle Name", fieldtype: "Data", section: "Personal Information" },
    { fieldname: "last_name", label: "Last Name", fieldtype: "Data", inListView: true, section: "Personal Information" },
    { fieldname: "student_email_id", label: "Email Address", fieldtype: "Data", required: true, inListView: true, section: "Personal Information" },
    { fieldname: "student_mobile_number", label: "Mobile Number", fieldtype: "Data", section: "Personal Information" },
    { fieldname: "date_of_birth", label: "Date of Birth", fieldtype: "Date", section: "Personal Information" },
    { fieldname: "gender", label: "Gender", fieldtype: "Link", options: "Gender", section: "Personal Information" },
    { fieldname: "birth_place", label: "Birth Place", fieldtype: "Data", section: "Address" },
    { fieldname: "town", label: "Town", fieldtype: "Data", section: "Address" },
    { fieldname: "province", label: "Province", fieldtype: "Data", section: "Address" },
    { fieldname: "address_line_1", label: "Address", fieldtype: "Data", section: "Address" },
    { fieldname: "city", label: "City", fieldtype: "Data", section: "Address" },
    { fieldname: "country", label: "Country", fieldtype: "Link", options: "Country", section: "Address" },
    { fieldname: "lrn", label: "LRN (DepEd Learner Reference No.)", fieldtype: "Data", section: "Registrar (PH)" },
    { fieldname: "sms_status", label: "Status", fieldtype: "Select", options: "Active\nInactive\nGraduated\nDropped", inListView: true, section: "Registrar (PH)" },
    { fieldname: "branch", label: "Branch", fieldtype: "Link", options: "Branch", section: "Registrar (PH)" },
    { fieldname: "stdnt_cno", label: "Student Control No.", fieldtype: "Data", readOnly: true, section: "Registrar (PH)" },
    { fieldname: "scholarship", label: "Scholarship", fieldtype: "Link", options: "SMS Code", section: "Academic Standing" },
    { fieldname: "discount_type", label: "Discount Type", fieldtype: "Link", options: "SMS Code", section: "Academic Standing" },
    { fieldname: "transferee", label: "Transferee", fieldtype: "Check", section: "Transfer & Graduation History" },
    { fieldname: "prev_course", label: "Previous Course", fieldtype: "Data", section: "Transfer & Graduation History" },
    { fieldname: "last_course_attended", label: "Last Course Attended", fieldtype: "Data", section: "Transfer & Graduation History" },
    { fieldname: "year_last_attended", label: "Year Last Attended", fieldtype: "Int", section: "Transfer & Graduation History" },
  ],
  relatedRecord: {
    doctype: "Program Enrollment",
    linkField: "student",
    orderBy: "enrollment_date",
    section: "Course Enrollment",
    missingRecordHint: "No Program Enrollment on file yet — pick a course and school year below to enroll this student, then Save.",
    allowCreate: true,
    fields: [
      { fieldname: "program", label: "Course", fieldtype: "Link", options: "Program", dropdown: true },
      { fieldname: "year_level", label: "Year Level", fieldtype: "Int" },
    ],
    // Program Enrollment also requires academic_year to be created at all;
    // it isn't part of `fields` above because there's nothing to show once
    // an enrollment already exists (shifting a student to a new school year
    // is a new enrollment record, not an edit of this one) -- only needed
    // the one time a brand new enrollment is being created here.
    additionalCreateFields: [
      { fieldname: "academic_year", label: "School Year", fieldtype: "Link", options: "Academic Year", dropdown: true, required: true },
    ],
  },
}

export const graduationBatchSpec: FormSpec = {
  doctype: "SMS Graduation Batch",
  title: "Graduation Batches",
  fields: [
    { fieldname: "course", label: "Program", fieldtype: "Link", options: "Program", required: true, inListView: true },
    { fieldname: "school_year", label: "School Year", fieldtype: "Data", required: true, inListView: true },
    { fieldname: "run_by", label: "Run By", fieldtype: "Link", options: "User", readOnly: true, inListView: true },
    { fieldname: "run_on", label: "Run On", fieldtype: "Datetime", readOnly: true, inListView: true },
  ],
}

export const permitSpec: EntrySpec = {
  doctype: "SMS Permit",
  title: "Permit to Take Exam",
  fields: [
    { fieldname: "student", label: "Student", fieldtype: "Link", options: "Student", required: true },
    { fieldname: "student_name", label: "Student Name", fieldtype: "Data", readOnly: true, inListView: true },
    { fieldname: "course", label: "Program", fieldtype: "Link", options: "Program", inListView: true },
    { fieldname: "year_level", label: "Year Level", fieldtype: "Int", inListView: true },
    { fieldname: "semester", label: "Semester", fieldtype: "Int", inListView: true },
    { fieldname: "school_year", label: "School Year", fieldtype: "Data" },
    { fieldname: "term", label: "Exam Period", fieldtype: "Data" },
    { fieldname: "assessment", label: "Assessment", fieldtype: "Link", options: "SMS Student Assessment" },
    { fieldname: "total_fee", label: "Total Fee", fieldtype: "Currency", readOnly: true },
    { fieldname: "payment", label: "Payment", fieldtype: "Currency", readOnly: true },
    { fieldname: "due_payment", label: "Due Payment", fieldtype: "Currency", readOnly: true },
    { fieldname: "status", label: "Status", fieldtype: "Select", options: "Pending\nEligible\nIssued" },
    { fieldname: "permit_no", label: "Permit No.", fieldtype: "Data", readOnly: true },
  ],
  childTable: {
    fieldname: "subjects",
    doctype: "SMS Permit Subject",
    columns: [
      { fieldname: "subject", label: "Subject", fieldtype: "Link", options: "Course", required: true },
      { fieldname: "class", label: "Class (Student Group)", fieldtype: "Link", options: "Student Group" },
    ],
  },
}

/**
 * "Request for Official Transcript of Records" (Registrar > Reports > Student
 * Credentials) — a create-only intake form: every Print creates one new SMS
 * Transcript record (naming series TOR-.YY.-.##), it never loads/edits an
 * existing one, so this spec lists only the fields that are actually
 * editable on that screen. Student No/Name/Course and the whole Educational
 * Data block are persistent Student facts edited elsewhere in the app (see
 * studentSpec) and are shown read-only there instead of being part of this
 * doctype's own editable field list. The `subjects` child table (grade rows)
 * is likewise out of scope — the legacy form this mirrors is a request slip,
 * not a grade sheet.
 */
export const transcriptSpec: EntrySpec = {
  doctype: "SMS Transcript",
  title: "Official Transcript of Records",
  fields: [
    { fieldname: "student", label: "Student", fieldtype: "Link", options: "Student", required: true },
    { fieldname: "is_graduated", label: "Graduated", fieldtype: "Check" },
    { fieldname: "date_graduated", label: "Date Graduated", fieldtype: "Date" },
    { fieldname: "honors", label: "Honors/Distinction", fieldtype: "Data" },
    { fieldname: "is_transferee", label: "Check if Transferee", fieldtype: "Check" },
    { fieldname: "issued_to", label: "Official TOR Issued To", fieldtype: "Data" },
    { fieldname: "entrance_credentials", label: "Entrance Credentials To", fieldtype: "Data" },
    { fieldname: "status_of_admission", label: "Status of Admission", fieldtype: "Data" },
    { fieldname: "date_of_admission", label: "Date of Admission", fieldtype: "Date" },
    { fieldname: "date_of_transfer", label: "Transfer Date", fieldtype: "Date" },
    { fieldname: "so_no", label: "Special Order No.", fieldtype: "Data" },
    { fieldname: "date_issued", label: "Date Issued", fieldtype: "Date" },
    { fieldname: "or_no", label: "OR No.", fieldtype: "Data" },
    { fieldname: "remarks", label: "Remarks", fieldtype: "Small Text" },
    { fieldname: "attachments", label: "Attachments (If any)", fieldtype: "Small Text" },
    { fieldname: "prepared_by", label: "Prepared by", fieldtype: "Link", options: "User" },
    { fieldname: "checked_by", label: "Checked by", fieldtype: "Link", options: "User" },
    { fieldname: "registrar", label: "Registrar", fieldtype: "Link", options: "User" },
  ],
}

export const curriculumSpec: EntrySpec = {
  doctype: "SMS Curriculum",
  title: "Curriculum",
  fields: [
    { fieldname: "curriculum_code", label: "Curriculum Code", fieldtype: "Data", required: true },
    { fieldname: "course", label: "Program", fieldtype: "Link", options: "Program", required: true },
    { fieldname: "curriculum_year", label: "Curriculum Year", fieldtype: "Data" },
    {
      fieldname: "sem_type",
      label: "Term Structure",
      fieldtype: "Select",
      options: "Quarter\nPrelim-Midterm-Finals\nTrisemester\nFull Payment Only",
    },
    { fieldname: "max_units", label: "Max Units per Term", fieldtype: "Float" },
    { fieldname: "is_active", label: "Is Current Curriculum", fieldtype: "Check" },
  ],
  childTable: {
    fieldname: "subjects",
    doctype: "SMS Curriculum Subject",
    columns: [
      { fieldname: "year_level", label: "Year Level", fieldtype: "Int", required: true },
      { fieldname: "semester", label: "Semester", fieldtype: "Int", required: true },
      { fieldname: "subject", label: "Subject", fieldtype: "Link", options: "Course", required: true },
      { fieldname: "prerequisite", label: "Prerequisite", fieldtype: "Link", options: "Course" },
    ],
  },
}


export const studentcredentialSpec: FormSpec = {
  doctype: "SMS Student Credentials",
  title: "Credentials",
  fields: [
    { fieldname: "student", label: "Student", fieldtype: "Link", options: "Student", required: true, section: "details", inListView: true },
    { fieldname: "date_encoded", label: "Date Encoded", fieldtype: "Date", section: "details", inListView: true },
    { fieldname: "encoder", label: "Encoder", fieldtype: "Link", options: "Encoder", required: true, section: "details", inListView: true },

    { fieldname: "psa_birth_certificate", label: "PSA Birth Certificate", fieldtype: "Check", required: true, section: "credentials" },
    { fieldname: "certificate_of_good_moral", label: "Certificate of Good Moral", fieldtype: "Check", required: true, section: "credentials" },
    { fieldname: "transcript_of_record", label: "Transcript of Record", fieldtype: "Check", required: true, section: "credentials" },
    { fieldname: "ncae", label: "NCAE", fieldtype: "Check", required: true, section: "credentials" },
    { fieldname: "form_138", label: "Form 138", fieldtype: "Check", required: true, section: "credentials" },
    { fieldname: "form_137", label: "Form 137", fieldtype: "Check", required: true, section: "credentials" },
  ],
}

