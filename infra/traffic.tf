resource "azurerm_log_analytics_workspace" "traffic" {
  name                = "${var.name}-traffic"
  location            = azurerm_resource_group.bank.location
  resource_group_name = azurerm_resource_group.bank.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

# HTTP ingress logs include OAuth query values and cannot redact them before storage.
resource "azurerm_monitor_diagnostic_setting" "traffic" {
  name                           = "traffic"
  target_resource_id             = azurerm_container_app_environment.bank.id
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.traffic.id
  log_analytics_destination_type = "Dedicated"

  enabled_log {
    category = "ContainerAppConsoleLogs"
  }
}

output "traffic_workspace_id" {
  value = azurerm_log_analytics_workspace.traffic.workspace_id
}
