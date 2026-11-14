#!/usr/bin/env bash
# يجلب نصوص الكتب من نسخ مشروع OpenITI لكتب المكتبة الشاملة (بأرقامها في الشاملة نفسها)
# ثم يحوّلها إلى raw/ بصيغة أداة الاستخراج. لا يحتاج جهاز الشاملة.
#   bash extractor/from_openiti.sh [مجلد_العمل]
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
W="${1:-$HOME/openiti}"
mkdir -p "$W"
get() {  # get <repo> <path...>
  local r="$1"; shift
  local d="$W/$(echo "$r" | tr A-Z a-z)"
  [ -d "$d/.git" ] || GIT_LFS_SKIP_SMUDGE=1 git clone -q --depth 1 --filter=blob:none --sparse "https://github.com/OpenITI/$r" "$d"
  git -C "$d" sparse-checkout add "$@"
}
get 0875AH data/0852IbnHajarCasqalani/0852IbnHajarCasqalani.TaqribTahdhib data/0852IbnHajarCasqalani/0852IbnHajarCasqalani.TacrifAhlTaqdis data/0852IbnHajarCasqalani/0852IbnHajarCasqalani.TahdhibTahdhib
get 0750AH data/0742Mizzi/0742Mizzi.TahdhibKamal data/0748Dhahabi/0748Dhahabi.TadhhibTahdhib
get 0275AH data/0256Bukhari/0256Bukhari.TarikhKabir data/0256Bukhari/0256Bukhari.DucafaSaghir
get 0375AH data/0354IbnHibbanBusti/0354IbnHibbanBusti.Majruhin data/0354IbnHibbanBusti/0354IbnHibbanBusti.Thiqat data/0365IbnCadiJurjani/0365IbnCadiJurjani.KamilFiDucafa
get 0325AH data/0303Nasai/0303Nasai.DucafaWaMatrukin data/0322AbuJacfarCuqayli/0322AbuJacfarCuqayli.DucafaKabir
get 0400AH data/0385Daraqutni/0385Daraqutni.Ducafa

c() {  # c <glob> <id> <key> <name> <author> [offset]
  local f; f=$(ls $1 | head -1)
  python3 "$DIR/extractor/openiti.py" "$f" "$2" "$3" --name "$4" --author "$5" ${6:+--page-offset $6} --out "$DIR/raw"
}
c "$W/0875ah/data/*/*TaqribTahdhib/*Shamela0008609-ara1" 8609 taqrib "تقريب التهذيب" "ابن حجر العسقلاني" 74
c "$W/0875ah/data/*/*TacrifAhlTaqdis/*Shamela0001186BK1-ara1" 1186 mudallisin "طبقات المدلسين = تعريف أهل التقديس بمراتب الموصوفين بالتدليس" "ابن حجر العسقلاني"
c "$W/0875ah/data/*/*TahdhibTahdhib/*Shamela0003310-ara2" 3310 tahdhib_tahdhib "تهذيب التهذيب - ط الهندية" "ابن حجر العسقلاني"
c "$W/0750ah/data/0742Mizzi/*/*Shamela0003722-ara1.mARkdown" 3722 tahdhib_kamal "تهذيب الكمال في أسماء الرجال" "المزي"
c "$W/0750ah/data/0748Dhahabi/*/*Sham19Y0149213-ara1.completed" 149213 tadhhib "تذهيب تهذيب الكمال في أسماء الرجال" "الذهبي"
c "$W/0275ah/data/0256Bukhari/*TarikhKabir/*Shamela0000956-ara1.completed" 956 tarikh_kabir "التاريخ الكبير - ت المعلمي" "البخاري"
c "$W/0275ah/data/0256Bukhari/*DucafaSaghir/*Shamela0010542-ara1" 10542 bukhari_duafa "الضعفاء الصغير - ت زايد" "البخاري"
c "$W/0375ah/data/0354IbnHibbanBusti/*Thiqat/*Shamela0005816-ara1.completed" 5816 thiqat "الثقات" "ابن حبان"
c "$W/0375ah/data/0354IbnHibbanBusti/*Majruhin/*Shamela0005834-ara1" 5834 majruhin "المجروحين - ت زايد" "ابن حبان"
c "$W/0375ah/data/0365IbnCadiJurjani/*/*Shamela0012579-ara1.mARkdown" 12579 kamil "الكامل في ضعفاء الرجال" "ابن عدي"
c "$W/0325ah/data/0303Nasai/*/*Shamela0010805-ara2" 10805 nasai "الضعفاء والمتروكون" "النسائي"
c "$W/0325ah/data/0322AbuJacfarCuqayli/*/*Shamela0013041-ara1.completed" 13041 uqayli "الضعفاء الكبير" "العقيلي"
c "$W/0400ah/data/0385Daraqutni/*/*Shamela0010802-ara1.completed" 10802 daraqutni "الضعفاء والمتروكون" "الدارقطني"
