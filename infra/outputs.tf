output "url" {
  value = "https://${azurerm_container_app.bank.ingress[0].fqdn}"
}

output "google_redirect_uri" {
  description = "Add this to the Google OAuth client before you sign in."
  value       = "https://${azurerm_container_app.bank.ingress[0].fqdn}/.auth/login/google/callback"
}

output "vault" {
  value = azurerm_key_vault.bank.name
}

output "app" {
  value = azurerm_container_app.bank.name
}

output "resource_group" {
  value = azurerm_resource_group.bank.name
}

output "registry" {
  value = azurerm_container_registry.bank.name
}

output "storage_account" {
  value = azurerm_storage_account.bank.name
}
