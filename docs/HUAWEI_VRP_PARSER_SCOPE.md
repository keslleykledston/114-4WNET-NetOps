# Huawei VRP Parser Scope

This phase adds conservative Huawei VRP parsing for discovery only. The parser is read-only and never produces configuration actions.

Covered now:

- Route-policy nodes: name, node id, permit/deny, `if-match`, `apply`, ip-prefix references and community-filter/list references.
- Community-filter: name/id, index, permit/deny action and community value.
- Community-list: name and entries when visible in current configuration output.
- L2VPN basic facts: interface/subinterface, remote peer, service id and VSI name when present in display output.

Not covered yet:

- Full route-policy expression semantics.
- Nested or vendor-specific community aliases beyond directly visible lines.
- Full VSI/VPLS operational state correlation.
- Route table dumps.

The parser intentionally keeps short evidence strings and normalized objects. Frontend components must not parse CLI.
