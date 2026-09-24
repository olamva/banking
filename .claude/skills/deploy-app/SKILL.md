---
name: "deploy-app"
description: "How to deploy the app"
---

A merge to `main` deploys the app. The Deploy workflow builds the image and points the app at it when the merge changes the image inputs. Run it from the Actions tab to deploy without a merge.

```bash
pnpm sb1 rebuild                # only when the rules changed
pnpm rules:push                 # upload the rules
```

`terraform -chdir=infra apply` creates the resources. Run `infra/github-vars.sh` after an apply that changes its outputs. Run `pnpm rules:push` from the main checkout.
