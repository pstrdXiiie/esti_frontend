import frappe


def execute():
	"""One-time backfill for campus_erp.registrar.student_number.sanitize_student_name
	(a Student validate hook introduced alongside this patch): existing Student
	records saved before that hook existed can still carry a placeholder
	middle_name (e.g. a bare "-"), which produces names like "John - Doe"
	wherever student_name is displayed or printed, since it survives the core
	Student.set_title()'s `filter(None, ...)`. The hook only self-heals a record
	the next time it's saved — this patch fixes every record already in the
	database in one pass.
	"""
	students = frappe.get_all(
		"Student", fields=["name", "first_name", "middle_name", "last_name"]
	)
	for student in students:
		raw = student.middle_name or ""
		stripped = raw.strip()
		if raw and not any(ch.isalnum() for ch in stripped):
			student_name = " ".join(filter(None, [student.first_name, student.last_name]))
			frappe.db.set_value(
				"Student",
				student.name,
				{"middle_name": "", "student_name": student_name},
				update_modified=False,
			)
	frappe.db.commit()
