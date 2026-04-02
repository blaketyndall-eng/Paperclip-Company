output "enabled_services" {
  value       = keys(google_project_service.core_services)
  description = "Core GCP services enabled for the project"
}
