# NetLab Studio — Implementation Status

Last audited: 2026-10-12 (workspace-first hotfix)
Repository: https://github.com/kalai11012004/netlab
Branch: `main`
Latest documentation commit: `bbedc4b463abc99e89f176adcb0b058e2a8753b0`
Workspace hotfix commit: `f04f9d811b0916e867c59537f7ac7c87323b3f03`

## Verification boundary

This document separates repository CI checks from tests executed against the separately supplied v4.1 source ZIP. A successful static bundle build does not prove browser production behavior, a real VM boot, or full protocol fidelity.

## Current repository state

- Public GitHub repository; default branch is `main`.
- Build entry point: `node build.js`.
- Static/PWA delivery on Vercel; production HTML is Brotli-compressed and Vercel headers declare `Content-Encoding: br`.
- The repository reconstructs the browser app from compressed base64 payload chunks and versioned Brotli-compressed patches with SHA-256 checks.
- The repository does **not** currently contain the full editable app modules, complete test suite, or complete `runtime-backend/` source package. The supplied v4.1 ZIP contains these files. A fresh GitHub checkout is therefore not yet a self-contained engineering workspace.

## Confirmed checks

### GitHub Actions and Vercel

- GitHub Actions production-bundle verification passed on the workspace hotfix commit `f04f9d811b0916e867c59537f7ac7c87323b3f03`.
- The workflow checks the Brotli output for v4.1 feature markers, the compact first-run library preference, and the CSS grid hotfix markers.
- Vercel reports the production alias deployment as `READY` for the hotfix commit. A separate live browser interaction test was not possible because the connected Vercel API denied deployment content access.
- The workflow currently runs the release build and marker checks; it does not run the full network, VM-backend or browser test suites.

### Supplied v4.1 source ZIP

Executed in the available Linux container with Node.js v22.16.0 and Chromium/Playwright:

- `npm run test:network`: **52 passed, 0 failed**.
- `npm run test:vm-backend`: **17 passed, 0 failed**.
- `npm run test:browser`: **25 passed, 0 failed**.
- `npm run test:bundle`: **22 passed, 0 failed**.
- `npm test`: all four suites above passed.
- `npm run build`: **passed**; generated HTML is 394,888 bytes and Brotli output is 80,999 bytes.
- Real QEMU/KVM host and Windows guest boot: **not tested**; this environment does not provide a KVM host or authorized Windows installation media.

These test results apply to the supplied ZIP's source tree, not to the contents of a fresh GitHub checkout.

## Feature status

| Area | Status | Evidence / limitation |
|---|---|---|
| Type → brand → model catalogue | Implemented in supplied source; catalogue tests pass | Model specifications still require ongoing vendor-source verification |
| Model-specific interfaces | Implemented for catalogue profiles | Profiles may include clearly labelled templates; coverage does not itself prove every hardware detail |
| Basic Ethernet/MAC/ARP/IPv4/ICMP model | Implemented for educational scenarios | Simulated events are not real Ethernet frames or PCAPs |
| VLAN access/trunk and static routing | Partial educational simulation | Unit and regression coverage exists; advanced protocol fidelity remains limited |
| OSPF/BGP/STP/DHCP/DNS/NAT/ACL/IPv6 | Missing or partial | Do not describe as fully supported until operational behavior and positive/negative tests exist |
| Project import validation | Implemented in supplied source | Continue testing malformed, oversized and legacy project fixtures |
| Browser menus and workspace | Broad workflow implemented in supplied source | 25 readable-source browser tests and 22 bundled browser scenarios pass |
| QEMU/KVM browser client | Implemented in supplied source | Requires a separately provisioned and secured KVM backend |
| Backend API validation/security | 17 backend tests pass in supplied source | Unit tests do not replace live host integration testing |
| Windows VM boot | Not verified | No KVM host or Windows ISO available |
| PWA/offline | Partial | Static assets may cache; backend and real guest operations need connectivity |

## Workspace-first hotfix

- Reproduced a browser defect: `display:none` on a collapsed desktop grid sidebar removed it from grid placement, causing the inspector to occupy the canvas track and intercept Run ping.
- Fixed the release build in `build.js` to keep collapsed sidebars in their grid tracks with hidden/zero-width/pointer-disabled behavior, and to show the compact device library on first launch.
- Added CI checks for the CSS and first-run layout markers.
- The equivalent source ZIP fix passed all 25 readable-source browser tests and all 22 bundled browser scenarios.

## Highest-priority engineering work

1. Make the repository self-contained by committing editable app modules, complete test scripts, backend implementation and reproducible package metadata, or a deterministic source-generation process that does not rely on an external conversation attachment.
2. Add network/catalogue/security, backend and browser suites to repository CI; ensure failures and timeouts fail the workflow.
3. Run interactive browser E2E against the production URL once deployment content access is available.
4. Provision an isolated KVM host and verify guest lifecycle, console tickets, networking, cleanup and cross-lab isolation before claiming VM readiness.
5. Implement missing protocol behavior in tested increments; do not advertise protocols as supported based on configuration text alone.

## Next task

Make the GitHub repository self-contained by bringing the editable app modules, tests and VM backend into source control, then extend CI to execute those suites. Do not declare the full project complete based on build success alone.
