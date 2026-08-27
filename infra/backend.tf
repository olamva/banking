# The state records every resource that exists, so it lives in Azure and not in
# a checkout. A checkout that owns the state orphans the whole deployment when
# somebody deletes it.
#
# A backend block takes literals only. It reads no variable, local or function,
# which is why these names are written out rather than derived. `bootstrap.sh`
# reads them back out of this file, so the two cannot drift.
#
#   infra/bootstrap.sh          once, to create the account below
#   terraform -chdir=infra init
terraform {
  backend "azurerm" {
    resource_group_name  = "banking-tfstate"
    storage_account_name = "bankingtfstateb401e2b8"
    container_name       = "tfstate"
    key                  = "banking.tfstate"
    use_azuread_auth     = true
  }
}
