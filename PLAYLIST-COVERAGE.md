# CCNA BootCamp Tamil — playlist coverage map

Source playlist: https://www.youtube.com/watch?v=jpfkDDpohG8&list=PLUuj9PZ8a7ye4BrLVz5lV7lyht8319Rin
Public course index: https://elearning.networkgeek.in/student/preview.php?course_id=7
The course index lists 18 lessons and 18:23:51 of video. Full transcripts for all YouTube videos were not available for direct inspection in this environment, so this is a topic-by-topic mapping of the published index rather than a claim that all videos have been watched end-to-end.

| # | Published lesson topic | Current coverage | Remaining work |
|---:|---|---|---|
| 1 | Intro to Free CCNA BootCamp | In-app roadmap | Video player/progress tracking not embedded. |
| 2 | What is Networking | Device/link topology and guided labs | More guided LAN/WAN scenarios and learning notes. |
| 3 | What is OSI Model | Layer labels in packet events | Full PDU/encapsulation field-level lesson. |
| 4 | Network devices, IP address, subnet mask, CLI vs GUI | Device catalogue, interface settings and IPv4 validation | CLI is a bounded simulator, not Cisco IOS. |
| 5 | Cisco IOS modes | Mode-aware educational CLI | Actual IOS appliance behavior needs a legal image and backend. |
| 6 | Routing Table | Connected and static-route simulation with show commands | Longest-prefix/default routing tests and dynamic route sources. |
| 7 | Static Routing in CPT & NG Labs | Static IPv4 route lab and next-hop model | Backend network projection and additional multi-router test labs. |
| 8 | Static Routing, MAC and ARP | Simulated ARP, MAC learning, ping-path trace | These are model events, not real Ethernet frames. |
| 9 | Default Route, DNS and DHCP | Default-route model | Real DNS and DHCP server/lease behavior remains future work. |
| 10 | DHCP and IP classification | IPv4 subnet/address checks | Full DHCP server/client/relay and classful-address lesson needed. |
| 11 | Binary-to-decimal subnetting, Class C Part 1 | IPv4 validation foundation | Interactive binary/subnet calculator and graded exercises. |
| 12 | Class C subnetting Part 2 | Partial subnet arithmetic | Practice sets and edge-case grading. |
| 13 | Class B subnetting | IPv4 mask support | Dedicated Class B trainer and validation examples. |
| 14 | Class A subnetting and exercise | IPv4 mask support | Dedicated Class A exercises and automatic feedback. |
| 15 | Router security and console connection | Bounded CLI plus optional noVNC VM console integration | No real router serial console unless attached by a configured backend. |
| 16 | Telnet, SSH and OSPF | None of these real protocols are complete in the simulator | SSH/Telnet service integration and OSPF adjacency/LSA/SPF engine. |
| 17 | ACL | Partial/no complete packet-filter dataplane | Rule parser, ordered policy evaluation, counters and tests. |
| 18 | NAT | No complete NAT/PAT translation dataplane | Translation tables, overload, port mapping, timeout and tests. |

## Virtualization milestone
v4.1 adds a connectable operator-managed QEMU/KVM backend client and a separate backend source package. The Windows installer flow creates a blank disk, attaches an authorized ISO read-only, exposes the real console through an expiring noVNC ticket and supports ejecting the installer media. The Vercel website does not itself run VMs; a dedicated `/dev/kvm` host is required. Host/network integration and all real guest boot steps must be integration-tested on that host.
