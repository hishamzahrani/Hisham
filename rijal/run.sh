#!/usr/bin/env bash
# يستخرج النصوص من المكتبة الشاملة على هذا الجهاز ثم يبني بيانات التطبيق.
#   ./run.sh                 # المسار الافتراضي /srv/shamela
#   ./run.sh /path/to/shamela
set -euo pipefail
ROOT="${1:-/srv/shamela}"
DIR="$(cd "$(dirname "$0")" && pwd)"
command -v java >/dev/null || { echo "يلزم Java 11 أو أحدث"; exit 1; }
python3 "$DIR/extractor/extract.py" --root "$ROOT" --out "$DIR/raw"
python3 "$DIR/build/build.py" --raw "$DIR/raw" --out "$DIR/app/data"
python3 "$DIR/build/quiz.py" --data "$DIR/app/data" --out "$DIR/quiz/js/data.js"
echo "تم. المسابقات: cd \"$DIR/quiz\" && python3 -m http.server 8000 — والمكتبة: cd \"$DIR/app\" && python3 -m http.server 8001"
