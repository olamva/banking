terraform {
  required_version = ">= 1.9"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    # azurerm carries no auth block for a container app, so the Google gate is
    # declared against the ARM API directly.
    azapi = {
      source  = "Azure/azapi"
      version = "~> 2.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

provider "azapi" {}

data "azurerm_client_config" "current" {}

# A storage account and a registry each take a short global name with no dashes.
# The digest keeps the name unique without a second provider for randomness.
locals {
  flat       = substr(replace(var.name, "-", ""), 0, 14)
  digest     = substr(sha1(var.subscription_id), 0, 6)
  storage    = "${local.flat}${local.digest}"
  registry   = "${local.flat}${local.digest}"
  vault_name = trimsuffix(substr("${var.name}-vault", 0, 24), "-")
}

resource "azurerm_resource_group" "bank" {
  name     = var.name
  location = var.location
}

# The volume. The container is disposable, so every file that must survive a
# scale to zero lives here: data/raw, the database and the rules.
resource "azurerm_storage_account" "bank" {
  name                            = local.storage
  resource_group_name             = azurerm_resource_group.bank.name
  location                        = azurerm_resource_group.bank.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  https_traffic_only_enabled      = true
  allow_nested_items_to_be_public = false
  min_tls_version                 = "TLS1_2"
}

resource "azurerm_storage_share" "data" {
  name               = "data"
  storage_account_id = azurerm_storage_account.bank.id
  quota              = var.share_quota_gb
}

resource "azurerm_container_registry" "bank" {
  name                = local.registry
  resource_group_name = azurerm_resource_group.bank.name
  location            = azurerm_resource_group.bank.location
  sku                 = "Basic"
  admin_enabled       = false
}

resource "azurerm_container_app_environment" "bank" {
  name                = var.name
  resource_group_name = azurerm_resource_group.bank.name
  location            = azurerm_resource_group.bank.location
}

resource "azurerm_container_app_environment_storage" "data" {
  name                         = "data"
  container_app_environment_id = azurerm_container_app_environment.bank.id
  account_name                 = azurerm_storage_account.bank.name
  share_name                   = azurerm_storage_share.data.name
  access_key                   = azurerm_storage_account.bank.primary_access_key
  access_mode                  = "ReadWrite"
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

resource "azurerm_user_assigned_identity" "app" {
  name                = "${var.name}-app"
  resource_group_name = azurerm_resource_group.bank.name
  location            = azurerm_resource_group.bank.location
}

# The app rotates the refresh token on every exchange, so it needs to write.
resource "azurerm_role_assignment" "app_secrets" {
  scope                = azurerm_key_vault.bank.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

# You seed the first token from the Mac, so you need the same right.
resource "azurerm_role_assignment" "me_secrets" {
  scope                = azurerm_key_vault.bank.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_role_assignment" "app_pull" {
  scope                = azurerm_container_registry.bank.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "azurerm_container_app" "bank" {
  name                         = var.name
  resource_group_name          = azurerm_resource_group.bank.name
  container_app_environment_id = azurerm_container_app_environment.bank.id
  revision_mode                = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }

  registry {
    server   = azurerm_container_registry.bank.login_server
    identity = azurerm_user_assigned_identity.app.id
  }

  secret {
    name  = "google-client-secret"
    value = var.google_client_secret
  }

  secret {
    name  = "sb1-client-secret"
    value = var.sb1_client_secret
  }

  ingress {
    external_enabled = true
    # The placeholder image that the first apply runs serves port 80. A revision
    # that listens nowhere never becomes healthy, so both use the same port.
    target_port = 80
    transport   = "auto"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    # Zero when nobody reads it. One at most, because two replicas would hold
    # two SB1 refresh chains and two SQLite writers.
    min_replicas = 0
    max_replicas = 1

    container {
      name   = "web"
      image  = var.image
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "DATA_DIR"
        value = "/data"
      }
      env {
        name  = "RULES_DIR"
        value = "/data/rules"
      }
      # Not on the volume. SQLite needs locks that an SMB share does not carry.
      env {
        name  = "DB_FILE"
        value = "/tmp/banking.db"
      }
      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.app.client_id
      }
      env {
        name  = "KEY_VAULT_NAME"
        value = azurerm_key_vault.bank.name
      }
      env {
        name  = "ALLOWED_EMAILS"
        value = join(",", var.allowed_emails)
      }
      env {
        name  = "CLIENT_ID"
        value = var.sb1_client_id
      }
      env {
        name        = "CLIENT_SECRET"
        secret_name = "sb1-client-secret"
      }
      env {
        name  = "REDIRECT_URI"
        value = var.sb1_redirect_uri
      }
      env {
        name  = "FINANCIAL_INSTITUTION"
        value = var.sb1_financial_institution
      }

      volume_mounts {
        name = "data"
        path = "/data"
      }
    }

    volume {
      name         = "data"
      storage_type = "AzureFile"
      storage_name = azurerm_container_app_environment_storage.data.name
    }
  }

  depends_on = [
    azurerm_role_assignment.app_pull,
    azurerm_role_assignment.app_secrets,
  ]

  lifecycle {
    # Terraform owns the resource. `pnpm deploy` owns the image it runs.
    ignore_changes = [template[0].container[0].image]
  }
}

# Easy Auth for containers. It runs the whole OAuth exchange, and it passes the
# identity to the process in X-MS-CLIENT-PRINCIPAL. It cannot restrict to one
# person, so `allowed()` in the server still decides.
resource "azapi_resource" "auth" {
  type      = "Microsoft.App/containerApps/authConfigs@2024-03-01"
  name      = "current"
  parent_id = azurerm_container_app.bank.id

  body = {
    properties = {
      platform = {
        enabled = true
      }
      globalValidation = {
        unauthenticatedClientAction = "RedirectToLoginPage"
        redirectToProvider          = "google"
      }
      identityProviders = {
        google = {
          enabled = true
          registration = {
            clientId                = var.google_client_id
            clientSecretSettingName = "google-client-secret"
          }
          login = {
            scopes = ["openid", "email"]
          }
        }
      }
    }
  }
}

# The certificate is free and Azure renews it. It issues only after the CNAME
# and the asuid TXT record resolve on the public internet, so an apply before
# the DNS lands fails here.
resource "azurerm_container_app_environment_managed_certificate" "bank" {
  count = var.custom_domain == "" ? 0 : 1

  name                         = replace(var.custom_domain, ".", "-")
  container_app_environment_id = azurerm_container_app_environment.bank.id
  subject_name                 = var.custom_domain
  domain_control_validation    = "CNAME"
}

resource "azurerm_container_app_custom_domain" "bank" {
  count = var.custom_domain == "" ? 0 : 1

  name                                     = var.custom_domain
  container_app_id                         = azurerm_container_app.bank.id
  container_app_environment_certificate_id = azurerm_container_app_environment_managed_certificate.bank[0].id
  certificate_binding_type                 = "SniEnabled"
}
