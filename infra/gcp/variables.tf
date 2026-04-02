variable "project_id" {
  type        = string
  description = "GCP project identifier"
}

variable "region" {
  type        = string
  description = "Primary region"
  default     = "us-central1"
}
