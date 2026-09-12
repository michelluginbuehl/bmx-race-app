# BMX Race App release workflow

- Develop design and feature changes on `test-environment` (or branches based on it).
- Vercel Preview builds use private test storage. Production builds retain existing production storage.
- Never merge test changes into `main`, push to `main`, or promote a deployment to Production without Michel's explicit approval for that release. Setting up the initial environment selector is a separate, user-requested change.
- Never copy test race data or test live documents to production as part of a code release.
- Keep the test manager and spectator endpoints restricted to the configured owner UID in Firestore rules. Client-side guards alone do not provide authorization.
- Keep Vercel Authentication enabled for Preview deployments. Do not create public bypass/share links.
- Run `npm test` and `npm run build` before release. Check both Preview and Production build settings when modifying environment routing.
