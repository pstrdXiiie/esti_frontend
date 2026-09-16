# Copyright (c) 2026, School Administration and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SMSSemesterSetup(Document):
	def validate(self):
		if (
			self.school_year_from
			and self.school_year_to
			and self.school_year_to < self.school_year_from
		):
			frappe.throw("School Year To must not be before School Year From")

		for label, start_field, end_field in (
			("Basic Education", "basic_ed_start_date", "basic_ed_end_date"),
			("Regular Semester", "regular_semester_start_date", "regular_semester_end_date"),
			("Tri Semester", "tri_semester_start_date", "tri_semester_end_date"),
		):
			start_date = self.get(start_field)
			end_date = self.get(end_field)
			if start_date and end_date and end_date < start_date:
				frappe.throw(f"{label}: End Date must not be before Start Date")
