#!/usr/bin/env bash
# generate-certs.sh — Generate self-signed TLS certificates for RabbitMQ
#
# Produces:
#   certs/ca.crt        CA certificate  (shared with API server and workers)
#   certs/ca.key        CA private key  (kept on the server only)
#   certs/server.crt    RabbitMQ server certificate (signed by the CA)
#   certs/server.key    RabbitMQ server private key
#
# The certificates are valid for 10 years. Regenerate by deleting the certs/
# directory and re-running this script (or ./start.sh which calls it).
#
# For production deployments, replace these self-signed certs with certificates
# issued by your internal CA or a trusted public CA.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT_DIR="$SCRIPT_DIR/certs"

# ── Skip if certs already exist ────────────────────────────────────────────────
if [ -f "$CERT_DIR/ca.crt" ] && \
   [ -f "$CERT_DIR/server.crt" ] && \
   [ -f "$CERT_DIR/server.key" ]; then
    echo "[certs] Certificates already exist — skipping generation."
    echo "[certs] Delete the certs/ directory to force regeneration."
    exit 0
fi

# ── Ensure openssl is available ────────────────────────────────────────────────
if ! command -v openssl &>/dev/null; then
    echo "ERROR: openssl is not installed. Install it and re-run this script."
    exit 1
fi

echo "[certs] Generating TLS certificates for RabbitMQ..."
mkdir -p "$CERT_DIR"

# ── 1. Certificate Authority ───────────────────────────────────────────────────
echo "[certs]   Generating CA private key..."
openssl genrsa -out "$CERT_DIR/ca.key" 4096 2>/dev/null

echo "[certs]   Generating self-signed CA certificate (10 years)..."
openssl req -new -x509 \
    -days 3650 \
    -key "$CERT_DIR/ca.key" \
    -out "$CERT_DIR/ca.crt" \
    -subj "/C=US/ST=State/O=SpiderFoot/CN=SpiderFoot-CA" \
    2>/dev/null

# ── 2. RabbitMQ Server Certificate ────────────────────────────────────────────
echo "[certs]   Generating server private key..."
openssl genrsa -out "$CERT_DIR/server.key" 4096 2>/dev/null

echo "[certs]   Generating server certificate signing request..."
openssl req -new \
    -key "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.csr" \
    -subj "/C=US/ST=State/O=SpiderFoot/CN=rabbitmq" \
    2>/dev/null

# Subject Alternative Names — covers all hostnames workers might use to reach
# the broker: the Docker service name, localhost, and a wildcard for custom setups.
cat > "$CERT_DIR/server.ext" <<EOF
[SAN]
subjectAltName=DNS:rabbitmq,DNS:localhost,DNS:sf-rabbitmq,IP:127.0.0.1
EOF

echo "[certs]   Signing server certificate with CA (10 years)..."
openssl x509 -req \
    -days 3650 \
    -in "$CERT_DIR/server.csr" \
    -CA "$CERT_DIR/ca.crt" \
    -CAkey "$CERT_DIR/ca.key" \
    -CAcreateserial \
    -out "$CERT_DIR/server.crt" \
    -extensions SAN \
    -extfile "$CERT_DIR/server.ext" \
    2>/dev/null

# ── 3. Cleanup & permissions ───────────────────────────────────────────────────
rm -f "$CERT_DIR/server.csr" "$CERT_DIR/server.ext" "$CERT_DIR/ca.srl"

# Private keys: readable only by owner
chmod 600 "$CERT_DIR/ca.key" "$CERT_DIR/server.key"
# Certificates: readable by all (needed inside containers)
chmod 644 "$CERT_DIR/ca.crt" "$CERT_DIR/server.crt"

echo "[certs] Done. Certificates written to $CERT_DIR/"
echo "[certs]   CA cert    : certs/ca.crt  (distribute to all workers)"
echo "[certs]   Server cert: certs/server.crt + server.key  (API server only)"
