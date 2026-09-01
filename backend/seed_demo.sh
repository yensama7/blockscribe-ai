#!/usr/bin/env bash
# Seed a ready-to-demo dataset: three accounts, two deposited papers, and one
# review assignment. Safe to run against a fresh stack. Requires the Rust API
# on :5000 (and, for metadata/similarity, the Python service on :8001).
#
#   backend/run_server.sh          # start the stack first, then:
#   bash backend/seed_demo.sh
#
# Demo accounts (sign in with these emails — no password):
#   editor@demo.edu     editor  (first sign-in becomes the editor)
#   reviewer@demo.edu   reviewer target
#   author@demo.edu     author
set -e
API="${API:-http://127.0.0.1:5000}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

login() { # email, name -> prints "token id"
  curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"display_name\":\"$2\"}" \
    | python -c "import json,sys; d=json.load(sys.stdin); print(d['token'], d['user']['id'])"
}

echo "==> Creating accounts..."
read -r ETOK EID < <(login "editor@demo.edu"   "Prof. Ada Okafor")     # first user -> editor
read -r RTOK RID < <(login "reviewer@demo.edu" "Dr. Kofi Reviewer")
read -r ATOK AID < <(login "author@demo.edu"   "Msc. Amara Author")
echo "    editor=$EID reviewer=$RID author=$AID"

cat > "$tmp/maize.txt" <<'EOF'
Drought Resistant Maize Varieties in Northern Nigeria

Abstract
This study evaluates the yield performance of five drought resistant maize
varieties across three growing seasons in northern Nigeria. Improved varieties
outperformed local landraces by 34 percent under water stress conditions.

Introduction
Maize is a staple crop across West Africa and recurrent drought threatens
smallholder yields. Field trials measured rainfall, soil nitrogen, irrigation
and grain yield across replicated plots at three sites over three seasons.
EOF

cat > "$tmp/banking.txt" <<'EOF'
Mobile Banking Adoption Among Rural Traders in Ghana

Abstract
We survey 400 rural traders in Ghana to identify determinants of mobile banking
adoption. Trust in agents and transaction fees are the dominant factors.

Introduction
Financial inclusion remains low in rural areas. Respondents reported weekly
transaction volumes, agent proximity, fee sensitivity and trust levels.
EOF

echo "==> Depositing two papers as the author..."
deposit() { # token, file -> prints version_id
  curl -s -m 120 -X POST "$API/api/submissions" -H "Authorization: Bearer $1" \
    -F "file=@$2" | python -c "import json,sys; print(json.load(sys.stdin).get('version_id',''))"
}
VMAIZE=$(deposit "$ATOK" "$tmp/maize.txt")
VBANK=$(deposit "$ATOK" "$tmp/banking.txt")
echo "    maize version=$VMAIZE  banking version=$VBANK"

# let each deposit's background anchor/ingest settle before assigning
sleep 3

echo "==> Assigning the reviewer to the maize paper..."
RESP=$(curl -s -m 30 -X POST "$API/api/assignments" -H "Authorization: Bearer $ETOK" \
  -H "Content-Type: application/json" \
  -d "{\"version_id\":\"$VMAIZE\",\"reviewer_id\":\"$RID\"}")
if echo "$RESP" | grep -qo '"assignment_id"'; then
  echo "    assignment created: $(echo "$RESP" | grep -o '"assignment_id":"[^"]*"')"
else
  echo "    assignment response: $RESP"
fi

echo
echo "Done. Sign in at http://localhost:8081 as:"
echo "  editor@demo.edu    -> Review > Editorial desk (assign/queue), publish/retract on paper pages"
echo "  reviewer@demo.edu  -> Review > My review assignments (write + submit a signed review)"
echo "  author@demo.edu    -> Account (your deposits); open a paper to Request a review"
