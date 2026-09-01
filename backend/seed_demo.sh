#!/usr/bin/env bash
# Seed a ready-to-demo dataset: accounts, expertise papers, and an auto-assigned
# review. Safe to run against a fresh stack. Requires the Rust API on :5000 and
# the Python vector service on :8001 (for metadata + reviewer matching).
#
#   backend/run_server.sh          # start the stack first, then:
#   bash backend/seed_demo.sh
#
# Demo accounts (sign in with these emails — no password):
#   editor@demo.edu     editor  (first sign-in becomes the editor)
#   reviewer@demo.edu   a maize expert — gets auto-assigned to the author's maize paper
#   author@demo.edu     deposits papers; reviewers are matched automatically
set -e
API="${API:-http://127.0.0.1:5000}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

login() { # email, name -> "token id"
  curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"display_name\":\"$2\"}" \
    | python -c "import json,sys; d=json.load(sys.stdin); print(d['token'], d['user']['id'])"
}
deposit() { # token, file
  curl -s -m 120 -X POST "$API/api/submissions" -H "Authorization: Bearer $1" -F "file=@$2" >/dev/null
}

echo "==> Creating accounts (editor first so it gets the editor role)..."
read -r ETOK EID < <(login "editor@demo.edu"   "Prof. Ada Okafor")
read -r RTOK RID < <(login "reviewer@demo.edu" "Dr. Kofi Reviewer")
read -r ATOK AID < <(login "author@demo.edu"   "Msc. Amara Author")
echo "    editor=$EID reviewer=$RID author=$AID"

# The reviewer deposits their own maize paper first: this is their expertise
# profile, so the matcher can auto-assign them to related work later.
cat > "$tmp/reviewer_maize.txt" <<'EOF'
Maize Genetics and Drought Tolerance Mechanisms in the Tropics

Abstract
We study the genetic basis of drought tolerance in tropical maize, identifying
QTL regions linked to water-use efficiency and grain yield under water stress.
EOF
echo "==> Reviewer deposits an expertise paper (maize genetics)..."
deposit "$RTOK" "$tmp/reviewer_maize.txt"
sleep 5   # let it embed into the index before we match against it

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
EOF

echo "==> Author deposits two papers (reviewers auto-matched by expertise)..."
deposit "$ATOK" "$tmp/maize.txt"     # should auto-assign the maize-expert reviewer
deposit "$ATOK" "$tmp/banking.txt"
sleep 5   # let the background auto-assign finish

echo
echo "==> Reviewer's auto-assigned queue:"
curl -s "$API/api/assignments/mine" -H "Authorization: Bearer $RTOK" \
  | python -c "import json,sys; d=json.load(sys.stdin); print('   ', [(a['title'][:40], a['state']) for a in d] or 'none yet — deposit more related work')"

echo
echo "Done. Sign in at http://localhost:8081 as:"
echo "  editor@demo.edu    -> publish/retract others' reviewed papers; add reviewers"
echo "  reviewer@demo.edu  -> Review > My review assignments (write + submit a signed review)"
echo "  author@demo.edu    -> Account (your deposits); open a paper to add a reviewer"
echo
echo "Tip: to watch the review-timeout fallback, restart the API with"
echo "     REVIEW_TIMEOUT_DAYS=0 REVIEW_SWEEP_SECS=15"
