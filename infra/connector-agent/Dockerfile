FROM debian:bookworm-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AGENT_HOME=/opt/netops-connector

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    iproute2 \
    iputils-ping \
    traceroute \
    openssh-client \
    snmp \
    wireguard-tools \
    curl \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR ${AGENT_HOME}

COPY requirements.txt .
RUN pip3 install --break-system-packages -r requirements.txt

COPY agent/ ./agent/
COPY scripts/ ./scripts/

RUN chmod +x ./scripts/*.sh \
    && mkdir -p /var/log/netops-connector /var/run/netops-connector /etc/netops-connector/wireguard

ENV PYTHONPATH=${AGENT_HOME}

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD ["/opt/netops-connector/scripts/healthcheck.sh"]

ENTRYPOINT ["/opt/netops-connector/scripts/entrypoint.sh"]
CMD ["python3", "-m", "agent.main"]
