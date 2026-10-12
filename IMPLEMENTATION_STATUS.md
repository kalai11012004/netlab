# NetLab Studio — Implementation Status

Last audited: 2026-10-12 (workspace-first hotfix)
Repository: https://github.com/kalai11012004/netlab
Branch: `main`
Hotfix commit: `f04f9d811b0916e867c59537f7ac7c87323b3f03`

## Verification boundary

This document separates repository CI checks from tests executed against the separately supplied v4.1 source ZIP. A successful static bundle build does not prove browser production behavior, a real VM boot, or full protocol fidelity.

## Current repository state

- Public GitHub repository; default branch is `main`.
- Build entry point: `node build.js`.
- Static/PWA delivery on Vercel; production HTML is Brotli-compressed and Vercel headers declare `Content-Encoding: br`.
- The repository builds the application by reconstructing compressed base64 payload chunks and applying versioned Brotli-compressed patches with SHA-256 checks.
- The current tree includes the base payload, v3.6 patch and v4.0/v4.1 patch chunks, PWA assets, a build script, one production-build CI workflow, and reference documentation.
- The repository does **not** currently contain the full editable app modules, complete test suite, or the complete `runtime-backend/` source package. The supplied v4.1 ZIP contains these files. A fresh repository checkout is therefore not yet a self-contained engineering workspace.

## Confirmed checks

### GitHub Actions

- Hotfix commit `f04f9d811b0916e867c59537f7ac7c87323b3f03`: production-bundle verification workflow completed successfully. The build verifies the compact first-run library preference and the CSS grid hotfix markers.
- Vercel reports the production alias deployment as `READY` for the hotfix commit. A separate live browser interaction test was not possible because the connected Vercel API denied deployment content access.
- The workflow runs `node build.js`, Brotli-decompresses `dist/index.html`, and checks for v4.1 markers. It does not run the full network, VM-backend or browser test suites.

### Supplied v4.1 source ZIP

Executed in the available Linux container with Node.js v22.16.0:

- `npm run test:network`: **52 passed, 0 failed**.
- `npm run test:vm-backend`: **17 passed, 0 failed**.
- `npm run test:bundle`: exited **0**.
- `npm run build`: **passed**; generated Brotli-compressed HTML and verified the source checksum.
- After fixing the workspace grid bug in the supplied source ZIP: `npm run test:browser`: **25 passed, 0 failed**.
- `npm run test:bundle`: **22 browser scenarios passed, 0 failed**.
- `npm run build`: **passed**; generated HTML is 394,888 bytes and Brotli output is 80,999 bytes.
- Real QEMU/KVM host and Windows guest boot: **not tested**; this environment does not provide a KVM host or authorized Windows installation media.

These test results apply to the supplied ZIP's source tree, not to the contents of a fresh GitHub checkout.

## Feature status

| Area | Status | Evidence / limitation |
|---|---|---|
| Type → brand → model catalogue | Implemented in supplied source; catalogue tests pass | Model specifications still require ongoing vendor-source verification |
| Model-specific interfaces | Implemented for catalogue profiles | Profiles may include clearly labelled templates; do not infer real-world accuracy from coverage alone |
| Basic Ethernet/MAC/ARP/IPv4/ICMP model | Implemented for educational scenarios | Simulated events are not real Ethernet frames or PCAPs |
| VLAN access/trunk and static routing | Partial educational simulation | Unit and regression coverage exists; advanced protocol fidelity remains limited |
| OSPF/BGP/STP/DHCP/DNS/NAT/ACL/IPv6 | Missing or partial | Must not be described as fully supported until operational behavior and positive/negative tests exist |
| Project import validation | Implemented with regression/security tests in supplied source | Continue testing malformed, oversized and legacy project fixtures |
| Browser menus and workspace | Broad workflow implemented in supplied source | Full browser E2E run is not yet confirmed in this audit |
| QEMU/KVM browser client | Implemented in supplied source | Requires a separately provisioned and secured Linux/KVM backend |
| Backend API validation/security | 17 backend tests pass in supplied source | Tests do not replace deployment review or live host integration tests |
| Windows VM boot | Not verified | No KVM host or Windows ISO available in this environment |
| PWA/offline | Partial | Static assets may cache; backend and real guest operations need connectivity |

## Workspace-first hotfix

- Reproduced a browser defect: `display:none` on a collapsed desktop grid sidebar removed it from grid placement, causing the inspector to occupy the canvas track and intercept Run ping.
- Fixed the release build in `build.js` to retain the sidebar in its grid track with hidden/zero-width/pointer-disabled behavior, and to show the compact device library on first launch.
- Updated the production-build workflow to verify the CSS and first-run layout markers. GitHub Actions passed; Vercel reports the production deployment `READY`.
- Equivalent fix in the supplied source ZIP passed all 25 readable-source browser tests and all 22 bundled browser scenarios.

## Highest-priority engineering work

1. Make the repository self-contained: commit the editable application modules, test scripts, backend implementation, and reproducible package metadata, or document a deterministic release-source generation process that does not require an external conversation attachment.
2. Make CI run network/catalogue/security tests, backend tests, build verification, and the browser suite; ensure test failures and timeouts fail the workflow.
3. Commit the editable application modules, complete tests, and VM backend into the repository so a fresh checkout is self-contained. The current browser/test pass counts are from the supplied source ZIP, not a fresh GitHub checkout.
4. Add those suites to CI, then verify the production URL with an interactive browser test once deployment access is available.
5. Preserve the workspace-first layout (large central canvas, compact sidebars) and keep the new grid regression test.
6. Provision a dedicated isolated KVM host and test actual guest lifecycle, console tickets, networking, cleanup and cross-lab isolation before claiming VM readiness.

## Next task

Inspect and repair the browser E2E test harness until it completes deterministically, then bring its source and the network/backend tests into repository CI. Do not label the whole product complete based on build success alone.
