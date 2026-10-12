# NetLab Studio — Implementation Status

Last audited: 2026-10-12
Repository: https://github.com/kalai11012004/netlab
Branch: `main`
Audited commit before this document: `64071dee5a7e9d80edeee4bebe79f0a5f094d682`

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

- Current audited commit `64071dee5a7e9d80edeee4bebe79f0a5f094d682`: production-bundle verification workflow completed successfully.
- The workflow runs `node build.js`, Brotli-decompresses `dist/index.html`, and checks for v4.1 markers. It does not run the full network, VM-backend or browser test suites.

### Supplied v4.1 source ZIP

Executed in the available Linux container with Node.js v22.16.0:

- `npm run test:network`: **52 passed, 0 failed**.
- `npm run test:vm-backend`: **17 passed, 0 failed**.
- `npm run test:bundle`: exited **0**.
- `npm run build`: **passed**; generated Brotli-compressed HTML and verified the source checksum.
- `npm run test:browser`: **not yet verified as a complete run**. The browser runner started and emitted passing tests in one run but did not exit before the execution limit in a subsequent attempt. Do not count this as a confirmed full pass.
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

## Highest-priority engineering work

1. Make the repository self-contained: commit the editable application modules, test scripts, backend implementation, and reproducible package metadata, or document a deterministic release-source generation process that does not require an external conversation attachment.
2. Make CI run network/catalogue/security tests, backend tests, build verification, and the browser suite; ensure test failures and timeouts fail the workflow.
3. Diagnose and stabilize the browser E2E runner, then verify the production URL separately.
4. Preserve the workspace-first layout (large central canvas, compact sidebars) and add a viewport regression check before changing CSS.
5. Provision a dedicated isolated KVM host and test actual guest lifecycle, console tickets, networking, cleanup and cross-lab isolation before claiming VM readiness.

## Next task

Inspect and repair the browser E2E test harness until it completes deterministically, then bring its source and the network/backend tests into repository CI. Do not label the whole product complete based on build success alone.
