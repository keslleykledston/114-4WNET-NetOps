from __future__ import annotations

LEGACY_SSH_VENDOR_TOKENS = (
    "raisecom",
    "datacom",
    "zte",
)


def needs_legacy_ssh_algorithms(vendor: str | None) -> bool:
    vendor_lower = (vendor or "").strip().lower()
    if not vendor_lower:
        return False
    return any(token in vendor_lower for token in LEGACY_SSH_VENDOR_TOKENS)


def legacy_openssh_cli_options(vendor: str | None) -> list[str]:
    if not needs_legacy_ssh_algorithms(vendor):
        return []
    return [
        "-o",
        "HostKeyAlgorithms=+ssh-rsa",
        "-o",
        "PubkeyAcceptedAlgorithms=+ssh-rsa",
    ]
