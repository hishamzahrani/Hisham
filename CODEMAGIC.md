# بناء التطبيق ونشره عبر Codemagic (دون جهاز Mac)

كل الخطوات تتم من **المتصفح**، على الـ iMac أو على Windows. ملف الإعداد `codemagic.yaml` جاهز في المستودع.

> **التكلفة:** للحسابات الشخصية في Codemagic دقائق بناء مجانية شهريًّا تكفي لعدة بناءات. يستغرق البناء الواحد نحو ١٠–٢٠ دقيقة.

---

## الجزء الأول: إعداد Apple (مرة واحدة)

### ١. تسجيل معرّف التطبيق
- **developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → (+)**:
  1. اختر **App IDs** ثم **App**.
  2. Description: `QuranQuest`.
  3. Bundle ID: اختر **Explicit** واكتب `ae.quranquest.app`.
  4. فعّل **In-App Purchase**، ثم **Register**.

### ٢. إنشاء التطبيق في App Store Connect
- **appstoreconnect.apple.com → My Apps → (+) → New App**:
  - الاسم الذي اخترته، واللغة العربية.
  - Bundle ID: `ae.quranquest.app`.
  - SKU: `quranquest001`.
- بعد الإنشاء افتح **App Information** وانسخ **Apple ID** الرقمي (مثل `6740000000`). ستحتاجه في الخطوة ٨.

### ٣. مفتاح App Store Connect API
- **App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → (+)**:
  1. Name: `Codemagic`، وAccess: **App Manager**.
  2. اضغط **Generate**، ثم **Download API Key**. ملف `.p8` يُنزَّل **مرة واحدة فقط**، فاحفظه في مكان آمن.
  3. سجّل **Issuer ID** (أعلى الصفحة) و**Key ID** (بجانب المفتاح).

---

## الجزء الثاني: إعداد Codemagic

### ٤. إنشاء الحساب وربط المستودع
1. ادخل **codemagic.io** واختر **Sign up with GitHub**.
2. **Add application → GitHub** واختر المستودع **hishamzahrani/Hisham**.
3. Project type: **Capacitor** (أو Other)، ثم سيكتشف ملف `codemagic.yaml` تلقائيًا.

### ٥. إضافة مفتاح Apple
- **Team settings → Team integrations → Developer Portal → Connect / Manage keys → Add key**:
  - Name: **`QuranQuest ASC`** (بهذا الاسم حرفيًا، لأنه مكتوب في الملف).
  - Issuer ID وKey ID، ثم ارفع ملف `.p8`.

### ٦. شهادة التوقيع
- **Team settings → Code signing identities → iOS certificates → Generate certificate**:
  - اختر المفتاح `QuranQuest ASC` والنوع **Apple Distribution**.
  - Codemagic يُنشئ الشهادة ويحفظها. **نزّل نسخة منها مع كلمة مرورها** واحفظها.

### ٧. ملف التعريف (Provisioning profile)
- في **developer.apple.com → Profiles → (+)**:
  1. اختر **App Store Connect** (Distribution).
  2. App ID: `ae.quranquest.app`، والشهادة التي أنشأها Codemagic.
  3. الاسم: `QuranQuest AppStore`، ثم **Generate**.
- ارجع إلى **Codemagic → Code signing identities → iOS provisioning profiles → Fetch profiles**، واختر الملف الجديد.

### ٨. رقم التطبيق في الملف
- افتح `codemagic.yaml` في GitHub من المتصفح (اضغط ✏️ لتعديله).
- غيّر السطر:
```yaml
APP_STORE_APPLE_ID: 0000000000
```
- ضع الرقم الذي نسخته في الخطوة ٢، ثم **Commit changes**.

### ٩. البناء الأول 🚀
1. في Codemagic افتح التطبيق، ثم **Start new build**.
2. Branch: `claude/happy-faraday-qbf8lw`، وWorkflow: **iOS — App Store / TestFlight**.
3. اضغط **Start new build**.
- بعد نجاحه (١٠–٢٠ دقيقة) تظهر النسخة في **App Store Connect → TestFlight** بعد معالجة قصيرة.
- ثبّت تطبيق **TestFlight** على الـ iPhone وجرّب تطبيقك.

### ١٠. الإرسال للمراجعة
من App Store Connect: أكمل صفحة المتجر (الوصف، واللقطات، والخصوصية، والاشتراكات)، ثم اختر النسخة و**Submit for Review**. التفاصيل في `PUBLISHING.md`.

---

## الجزء الثالث: Android (اختياري، بالطريقة نفسها)

### ١١. مفتاح التوقيع (Keystore)
- على أي جهاز فيه Java (أو Android Studio)، شغّل:
```bash
keytool -genkey -v -keystore quranquest.keystore -alias quranquest -keyalg RSA -keysize 2048 -validity 10000
```
- **احفظ الملف وكلمتي المرور في مكانين آمنين.** بدونه لا تستطيع تحديث التطبيق بسهولة.
- ارفعه في **Codemagic → Code signing identities → Android keystores** باسم **`quranquest_keystore`**.

### ١٢. مفتاح Google Play
1. **Play Console → Setup → API access**: اربط مشروع Google Cloud، ثم أنشئ **Service account**.
2. امنحه صلاحية **Release manager** على التطبيق.
3. نزّل مفتاح **JSON** الخاص به.
4. في **Codemagic → Environment variables** أنشئ مجموعة اسمها **`google_play`**، وفيها المتغير **`GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`** (قيمته محتوى ملف JSON)، وفعّل **Secure**.

### ١٣. البناء
- شغّل Workflow **Android — Google Play**.
- **أول ملف AAB يُرفع يدويًّا:** نزّله من صفحة البناء في Codemagic وارفعه من Play Console، لأن Google تشترط ذلك في أول رفع. بعدها يرفع Codemagic التحديثات تلقائيًا إلى مسار الاختبار الداخلي.

---

## عند كل تحديث
1. نعدّل الأسئلة أو التطبيق ونرفع التعديل إلى GitHub.
2. في Codemagic: **Start new build**. رقم البناء يُزاد تلقائيًا.
3. جرّب النسخة في TestFlight ثم أرسلها للمراجعة.

## قبل النشر الفعلي
- ضع مفاتيح RevenueCat في `js/config.js`. بدونها يعمل التطبيق كاملًا، لكن زر «بلس» يُظهر أن الاشتراك غير متاح.
- ضع بريد التواصل في `privacy.html`، وانشرها على رابط عام.
