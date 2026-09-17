app_name = "campus_erp"
app_title = "Campus ERP"
app_publisher = "School Administration"
app_description = "Custom Frappe app for the school management system migration"
app_email = "generalmanager@sangrialuna.com"
app_license = "mit"

# Apps
# ------------------

required_apps = ["frappe/erpnext", "frappe/hrms", "frappe/education"]

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "campus_erp",
# 		"logo": "/assets/campus_erp/logo.png",
# 		"title": "Campus ERP",
# 		"route": "/campus_erp",
# 		"has_permission": "campus_erp.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/campus_erp/css/campus_erp.css"
# app_include_js = "/assets/campus_erp/js/campus_erp.js"

# include js, css files in header of web template
# web_include_css = "/assets/campus_erp/css/campus_erp.css"
# web_include_js = "/assets/campus_erp/js/campus_erp.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "campus_erp/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "campus_erp/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "campus_erp.utils.jinja_methods",
# 	"filters": "campus_erp.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "campus_erp.install.before_install"
# after_install = "campus_erp.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "campus_erp.uninstall.before_uninstall"
# after_uninstall = "campus_erp.uninstall.after_uninstall"

# Migration Hooks
# ----------------
# Custom Fields/Property Setters extending real Education/ERPNext/HRMS
# DocTypes (per module, per IMPLEMENTATION-MAPPING.md) sync on every migrate —
# idempotent, so safe to accumulate one entry per phase.

after_migrate = [
        "campus_erp.setup.custom_fields.sync_registrar_custom_fields",
        "campus_erp.setup.custom_fields_finance.sync_finance_custom_fields",
        "campus_erp.setup.custom_fields_personnel.sync_personnel_custom_fields",
        "campus_erp.setup.custom_fields_asset.sync_asset_custom_fields",
        "campus_erp.setup.library_defaults.sync_library_settings_defaults",
        "campus_erp.setup.custom_fields_administration.sync_administration_custom_fields",
        # "campus_erp.setup.workflows_administration.sync_administration_workflows",  # TODO: re-enable once Workflow States/Actions/Roles are set up
        "campus_erp.setup.credential_defaults.sync_credential_defaults",
]

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "campus_erp.utils.before_app_install"
# after_app_install = "campus_erp.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "campus_erp.utils.before_app_uninstall"
# after_app_uninstall = "campus_erp.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "campus_erp.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"Student": {
		"before_insert": "campus_erp.registrar.student_number.set_student_number",
		"validate": "campus_erp.registrar.student_number.sanitize_student_name",
	},
}

# Scheduled Tasks
# ---------------

scheduler_events = {
	"daily": [
		"campus_erp.tasks.daily",
	],
}

# Testing
# -------

# before_tests = "campus_erp.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "campus_erp.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "campus_erp.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["campus_erp.utils.before_request"]
# after_request = ["campus_erp.utils.after_request"]

# Job Events
# ----------
# before_job = ["campus_erp.utils.before_job"]
# after_job = ["campus_erp.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"campus_erp.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

