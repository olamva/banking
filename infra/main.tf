terraform {
  required_version = ">= 1.9"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

data "azurerm_client_config" "current" {}

# A vault name may hold 24 characters, which is shorter than a site name.
locals {
  vault_name = trimsuffix(substr("${var.name}-vault", 0, 24), "-")
}

resource "azurerm_resource_group" "bank" {
  name     = var.name
  location = var.location
}

# B1 is the smallest tier with an always-on process. The free tiers stop the
# worker, and a stopped worker cannot hold the sync.
resource "azurerm_service_plan" "bank" {
  name                = var.name
  resource_group_name = azurerm_resource_group.bank.name
  location            = azurerm_resource_group.bank.location
  os_type             = "Linux"
  sku_name            = var.sku
}

resource "azurerm_key_vault" "bank" {
  name                       = local.vault_name
  resource_group_name        = azurerm_resource_group.bank.name
  location                   = azurerm_resource_group.bank.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  purge_protection_enabled   = false
  soft_delete_retention_days = 7
  rbac_authorization_enabled = true
}

# The app rotates the refresh token on every exchange, so it needs to write.
resource "azurerm_role_assignment" "app_secrets" {
  scope                = azurerm_key_vault.bank.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = azurerm_linux_web_app.bank.identity[0].principal_id
}

# You seed the first token from the Mac, so you need the same right.
resource "azurerm_role_assignment" "me_secrets" {
  scope                = azurerm_key_vault.bank.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_linux_web_app" "bank" {
  name                = var.name
  resource_group_name = azurerm_resource_group.bank.name
  location            = azurerm_service_plan.bank.location
  service_plan_id     = azurerm_service_plan.bank.id

  https_only = true

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on = !startswith(var.sku, "F")
    # Node strips the types, so the server runs from source with no build step.
    application_stack {
      node_version = "24-lts"
    }
    app_command_line = "node src/web/server.ts"
    ftps_state       = "Disabled"
    http2_enabled    = true
  }

  app_settings = {
    # /home is the only persistent path. WEBSITE_RUN_FROM_PACKAGE stays off,
    # because it makes wwwroot read-only and the sync writes beside the code.
    DATA_DIR                              = "/home/data"
    RULES_DIR                             = "/home/data/rules"
    KEY_VAULT_NAME                        = azurerm_key_vault.bank.name
    ALLOWED_EMAILS                        = var.allowed_emails
    CLIENT_ID                             = var.sb1_client_id
    CLIENT_SECRET                         = var.sb1_client_secret
    REDIRECT_URI                          = var.sb1_redirect_uri
    FINANCIAL_INSTITUTION                 = var.sb1_financial_institution
    SCM_DO_BUILD_DURING_DEPLOYMENT        = "false"
    WEBSITE_NODE_DEFAULT_VERSION          = "~24"
    GOOGLE_PROVIDER_AUTHENTICATION_SECRET = var.google_client_secret
  }

  auth_settings_v2 {
    auth_enabled           = true
    require_authentication = true
    # Easy Auth proves who somebody is. `allowed()` in the server decides who
    # gets in, because Easy Auth cannot restrict to one person.
    unauthenticated_action = "RedirectToLoginPage"
    default_provider       = "google"
    require_https          = true

    google_v2 {
      client_id                  = var.google_client_id
      client_secret_setting_name = "GOOGLE_PROVIDER_AUTHENTICATION_SECRET"
      login_scopes               = ["openid", "email"]
    }

    login {
      token_store_enabled = false
    }
  }

  lifecycle {
    # The deploy script pushes the code. Terraform owns the resource, not its
    # contents.
    ignore_changes = [tags]
  }
}
