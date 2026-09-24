variable "subscription_id" {
  type        = string
  description = "The subscription that holds the dashboard."
}

variable "name" {
  type        = string
  default     = "banking-dashboard"
  description = "The resource group, the environment and the app all take this name. The storage account derives from it."

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,17}[a-z0-9]$", var.name))
    error_message = "Use 3 to 19 lower-case letters, digits and dashes. The vault name derives from this, and it may hold 24 characters."
  }
}

variable "location" {
  type    = string
  default = "norwayeast"
}

variable "share_quota_gb" {
  type        = number
  default     = 5
  description = "The volume holds data/raw, the database and the rules. A file share bills what it uses, not what it reserves."
}

variable "image" {
  type        = string
  default     = "mcr.microsoft.com/k8se/quickstart:latest"
  description = "The first apply runs this placeholder, because no image exists yet. The Deploy workflow points the app at the real one. Terraform ignores the field after that."
}

variable "ghcr_username" {
  type    = string
  default = "olamva"
}

variable "github_repository" {
  type    = string
  default = "olamva/banking"
}

variable "ghcr_token" {
  type        = string
  sensitive   = true
  description = "A classic GitHub token with only the read:packages scope. The app pulls its image from ghcr.io with it."
}

variable "allowed_emails" {
  type        = list(string)
  sensitive   = true
  description = "The addresses that may read the money. An empty list denies everybody."

  # A typo here does not fail. It locks you out of your own dashboard, and the
  # page says only that the address is not allowed.
  validation {
    condition     = alltrue([for e in var.allowed_emails : can(regex("^[^@[:space:],]+@[^@[:space:],]+$", e))])
    error_message = "Each entry is one address, and it carries no comma or space."
  }
}

# The name is an address, so it stays out of git with the rest of tfvars.
variable "custom_domain" {
  type        = string
  sensitive   = true
  default     = ""
  description = "The host name that serves the dashboard, such as a subdomain of your own domain. An empty value binds no domain. Container Apps keeps the azurecontainerapps.io name either way."

  validation {
    condition     = var.custom_domain == "" || can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", var.custom_domain))
    error_message = "Use a bare host name in lower case. Write no scheme, no port and no trailing dot."
  }
}

variable "google_client_id" {
  type    = string
  default = ""
}

variable "google_client_secret" {
  type      = string
  sensitive = true
  default   = ""
}

# The SB1 values may stay empty through the first apply. The developer portal
# wants a redirect before it issues a client, and the site serves the page
# without them. Fill them in and apply again to let the site sync.
variable "sb1_client_id" {
  type        = string
  sensitive   = true
  default     = ""
  description = "The second SB1 client. The Mac keeps the first, because the refresh token rotates and one chain cannot serve two processes."
}

variable "sb1_client_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "sb1_redirect_uri" {
  type        = string
  default     = ""
  description = "The redirect that the second SB1 client registers. The BankID login runs on the Mac, so this is a localhost URL."
}

variable "sb1_financial_institution" {
  type      = string
  sensitive = true
  default   = ""
}
