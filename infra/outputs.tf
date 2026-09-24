output "url" {
  value = "https://${azurerm_container_app.bank.ingress[0].fqdn}"
}

output "google_redirect_uri" {
  description = "Add this to the Google OAuth client before you sign in."
  value       = "https://${azurerm_container_app.bank.ingress[0].fqdn}/.auth/login/google/callback"
}

# Easy Auth builds the callback from the host of the request, and Container Apps
# never stops serving the azurecontainerapps.io name. Both redirects therefore
# stay live, and Google needs both.
output "custom_domain_google_redirect_uri" {
  description = "Add this to the Google OAuth client as well when a custom domain is set. Keep google_redirect_uri too."
  value       = var.custom_domain == "" ? "" : "https://${var.custom_domain}/.auth/login/google/callback"
  sensitive   = true
}

# The two records that the custom domain needs, before the first apply that
# binds it. The certificate cannot issue until both resolve.
output "custom_domain_dns" {
  description = "The CNAME and the TXT record to add at your DNS provider."
  value = var.custom_domain == "" ? null : {
    cname = { name = var.custom_domain, value = azurerm_container_app.bank.ingress[0].fqdn }
    txt   = { name = "asuid.${var.custom_domain}", value = azurerm_container_app_environment.bank.custom_domain_verification_id }
  }
  sensitive = true
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

output "deploy_client_id" {
  value = azurerm_user_assigned_identity.deploy.client_id
}

output "tenant_id" {
  value = data.azurerm_client_config.current.tenant_id
}

output "subscription_id" {
  value = data.azurerm_client_config.current.subscription_id
}

output "storage_account" {
  value = azurerm_storage_account.bank.name
}
