variable "subscription_id" {
  type        = string
  description = "The subscription that holds the dashboard."
}

variable "name" {
  type        = string
  default     = "banking-dashboard"
  description = "The resource group, the plan and the site all take this name. It must be unique across azurewebsites.net."

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,17}[a-z0-9]$", var.name))
    error_message = "Use 3 to 19 lower-case letters, digits and dashes. The vault name derives from this, and it may hold 24 characters."
  }
}

variable "location" {
  type    = string
  default = "norwayeast"
}

variable "sku" {
  type        = string
  default     = "B1"
  description = "B1 is the smallest tier that keeps a process alive."
}

variable "allowed_emails" {
  type        = string
  sensitive   = true
  description = "Comma separated. An empty list denies everybody."
}

variable "google_client_id" {
  type = string
}

variable "google_client_secret" {
  type      = string
  sensitive = true
}

variable "sb1_client_id" {
  type        = string
  sensitive   = true
  description = "The second SB1 client. The Mac keeps the first, because the refresh token rotates and one chain cannot serve two processes."
}

variable "sb1_client_secret" {
  type      = string
  sensitive = true
}

variable "sb1_redirect_uri" {
  type        = string
  description = "The redirect that the second SB1 client registers."
}

variable "sb1_financial_institution" {
  type      = string
  sensitive = true
}
