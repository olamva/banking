# The state records every resource that exists, so it lives in Azure and not in
# a checkout. `infra/bootstrap.sh` creates the account and writes backend.hcl,
# because the state cannot describe the storage that holds it.
#
#   infra/bootstrap.sh
#   terraform -chdir=infra init -backend-config=backend.hcl
terraform {
  backend "azurerm" {}
}
