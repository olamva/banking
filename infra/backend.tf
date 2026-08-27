# The state records every resource that exists, so it must outlive the checkout.
# A worktree is disposable, and deleting one with the state inside would orphan
# the whole deployment. `infra/tf.sh` points both the state and the variables at
# ~/.config/banking-azure, outside the repository.
terraform {
  backend "local" {}
}
