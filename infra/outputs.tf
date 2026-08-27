output "url" {
  value = "https://${azurerm_linux_web_app.bank.default_hostname}"
}

output "google_redirect_uri" {
  description = "Add this to the Google OAuth client before you sign in."
  value       = "https://${azurerm_linux_web_app.bank.default_hostname}/.auth/login/google/callback"
}

output "vault" {
  value = azurerm_key_vault.bank.name
}

output "app" {
  value = azurerm_linux_web_app.bank.name
}

output "resource_group" {
  value = azurerm_resource_group.bank.name
}
