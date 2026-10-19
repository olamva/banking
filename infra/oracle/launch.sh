#!/bin/bash
set -euo pipefail
export OCI_CLI_PROFILE=API PYTHONWARNINGS=ignore SUPPRESS_LABEL_WARNING=True

here="$(cd "$(dirname "$0")" && pwd)"
subnet="$(sed -n 's/^SUB=//p' "${OCI_IDS:-$HOME/Developer/minecraft-server/.notes/oci-ids.env}")"
compartment="$(oci network subnet get --subnet-id "$subnet" --query 'data."compartment-id"' --raw-output)"
shape=VM.Standard.E2.1.Micro

instance="$(oci compute instance list --compartment-id "$compartment" --display-name banking --all \
  --query "data[?\"lifecycle-state\" != 'TERMINATED'].id | [0]" --raw-output 2>/dev/null)"

if [ -z "$instance" ]; then
  image="$(oci compute image list --compartment-id "$compartment" --operating-system "Canonical Ubuntu" \
    --operating-system-version "24.04 Minimal" --shape "$shape" --sort-by TIMECREATED --sort-order DESC \
    --limit 1 --query 'data[0].id' --raw-output 2>/dev/null)"
  err="$(mktemp)"
  trap 'rm -f "$err"' EXIT
  until instance="$(oci compute instance launch --compartment-id "$compartment" \
    --availability-domain "UTTG:EU-STOCKHOLM-1-AD-1" --display-name banking --shape "$shape" \
    --image-id "$image" --boot-volume-size-in-gbs 50 --subnet-id "$subnet" --assign-public-ip true \
    --ssh-authorized-keys-file ~/.ssh/id_ed25519.pub --user-data-file "$here/cloud-init.yaml" \
    --wait-for-state RUNNING --max-wait-seconds 1200 --query 'data.id' --raw-output 2>"$err")"; do
    grep -qE 'capacity|TooManyRequests|InternalError' "$err" || { cat "$err" >&2; exit 1; }
    echo "$(date '+%F %T') $(grep -m1 '"message"' "$err" | tr -s ' ')"
    sleep 60
  done
fi

ip="$(oci compute instance list-vnics --instance-id "$instance" --query 'data[0]."public-ip"' --raw-output)"
for _ in $(seq 60); do
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "ubuntu@$ip" true 2>/dev/null && break
  sleep 10
done
ssh "ubuntu@$ip" 'cloud-init status --wait >/dev/null; cloud-init status'
echo "$instance at $ip"
