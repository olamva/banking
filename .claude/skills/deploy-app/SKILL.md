---
name: "deploy-app"
description: "How to deploy the app"
---

A merge to `main` deploys the app. The Deploy workflow builds and pushes the image when the merge changes the image inputs. The Oracle VM pulls it within 5 minutes. Run the workflow from the Actions tab to deploy without a merge.

```bash
pnpm sb1 rebuild                # only when the rules changed
pnpm rules:push                 # upload the rules and new receipts
```

`infra/oracle/launch.sh` creates the VM. `infra/oracle/configure.sh` puts the settings and the secrets on it. Run `pnpm rules:push` from the main checkout.
