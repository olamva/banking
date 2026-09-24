---
name: "deploy-app"
description: "How to deploy the app"
---

```bash
pnpm sb1 rebuild                # only when the rules changed
pnpm deploy                     # run the newest image of main, upload the rules
```

`terraform -chdir=infra apply` creates the resources. `pnpm deploy` fills them. Run the deploy from the main checkout.
