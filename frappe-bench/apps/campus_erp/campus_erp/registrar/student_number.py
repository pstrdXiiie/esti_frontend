# Copyright (c) 2026, School Administration and contributors
# For license information, please see license.txt

import frappe
from frappe.model.naming import make_autoname
from frappe.utils import cint, now_datetime


def _prefix(transferee) -> str:
	return "21" if cint(transferee) else "11"


def _series_key(transferee) -> str:
	return f"{now_datetime().strftime('%y')}-{_prefix(transferee)}"


def set_student_number(doc, method=None):
	"""Assigns Student.stdnt_cno on creation.

	Format: YY-110001 for a regular enrollee, YY-210001 for a transferee,
	where YY is the current 2-digit year and the trailing 4 digits
	increment per year+type (backed by frappe.model.naming's Series, so
	concurrent enrollments don't collide).
	"""
	if doc.get("stdnt_cno"):
		return
	doc.stdnt_cno = make_autoname(f"YY.-{_prefix(doc.get('transferee'))}.####", doc.doctype, doc)


def sanitize_student_name(doc, method=None):
	"""Some intake forms use a bare "-" for "no middle name", which the core
	Student.validate()'s set_title() joins in literally (it only filters out
	empty/None), producing names like "John - Doe" everywhere student_name
	is printed. Strip a placeholder middle name and recompute student_name
	to match — runs after set_title() since app-level validate hooks fire
	after the doctype controller's own validate().
	"""
	raw = doc.middle_name or ""
	stripped = raw.strip()
	if raw and not any(ch.isalnum() for ch in stripped):
		doc.middle_name = ""
		doc.student_name = " ".join(filter(None, [doc.first_name, doc.last_name]))


@frappe.whitelist()
def preview_student_number(transferee=0):
	"""Read-only preview of the Student Control No. the next enrollee would
	be assigned, for display on the Add Student wizard. Does not reserve or
	consume a Series slot, so it's best-effort — the number actually
	assigned on insert (set_student_number) is the source of truth and can
	differ if another enrollee is created in between.
	"""
	key = _series_key(transferee)
	current = frappe.db.get_value("Series", key, "current", order_by=None)
	next_value = cint(current) + 1
	return f"{key}{next_value:04d}"
