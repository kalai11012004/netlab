# NetLab Studio v4.0 — NG-Lab style virtual network workspace

This release adds an EVE-NG/NG-Lab-inspired browser workflow: contextual canvas actions, a node manager, lab metadata and lock state, per-node startup-configuration templates, local text repository, resource profiles, virtual NICs, VM/container/cloud profiles, event-trace CSV export and a virtualization manifest.

**Important VM limitation:** VM and container nodes remain simulated profiles. This static site does not boot guest operating systems, run QEMU/KVM or Docker, expose real VNC/SSH consoles, bridge physical NICs or generate real PCAPs. A real execution backend, authenticated isolation and user-authorized images are required. See `VIRTUALIZATION-BACKEND.md` and `NG-LAB-GAP-ANALYSIS.md`.

The referenced YouTube playlist could not be fully enumerated with video transcripts in this environment; the workflow is based on the provided UI screenshot and public EVE-NG documentation rather than claiming a video-by-video review.


Browser-based network topology and simulation lab. The app is shipped as a precompressed Brotli HTML file for static hosting on Vercel.
