// ------------------------------------------------------------------
// إعدادات الاشتراكات (عدّلها من هنا دون المساس بباقي الكود)
// ------------------------------------------------------------------
const MONETIZATION = {
  enabled: true,
  // المحتوى كله مجاني. القلوب تحدّ اللعب المتواصل، والاشتراك يمنح قلوبًا غير محدودة.
  hearts: { max: 5, refillHours: 16 },
  currency: "د.إ",
  // الأسعار المعروضة في نسخة الويب. في تطبيقي المتجرين يُعرض السعر الرسمي من المتجر نفسه بعملة المستخدم.
  plans: [
    { id: "monthly", name: "شهري",       price: 9.99,  period: "شهريًا", note: "إلغاء في أي وقت" },
    { id: "yearly",  name: "سنوي",       price: 59.99, period: "سنويًا", note: "يعادل ٥ د.إ شهريًا — وفّر ٥٠٪", best: true },
    { id: "family",  name: "عائلي سنوي", price: 89.99, period: "سنويًا", note: "حتى ٥ أفراد من الأسرة", webOnly: true },
  ],

  // ---------- تطبيقا App Store وGoogle Play (الشراء داخل التطبيق عبر RevenueCat) ----------
  store: {
    // مفاتيح RevenueCat العامة (Public SDK keys) من لوحة RevenueCat → Project → API keys
    revenuecatApiKeys: { ios: "", android: "" },
    entitlement: "plus",       // اسم الصلاحية في RevenueCat
    // معرّفات المنتجات كما تُنشأ في App Store Connect وGoogle Play Console
    products: { monthly: "quranquest_plus_monthly", yearly: "quranquest_plus_yearly" },
  },

  // ---------- نسخة الويب (Stripe متاح في الإمارات) ----------
  checkoutLinks: { monthly: "", yearly: "", family: "" },  // روابط Stripe Payment Links
  licenseApi: "",             // خادم يتحقق من رمز الاشتراك ويعيد {valid, plan, until}

  // رابط نسخة الويب المنشورة (مثل https://example.com/) لتُرسل روابط التحدي؛ إن تُرك فارغًا يُرسل رمز التحدي وحده
  shareUrl: "",

  privacyUrl: "privacy.html",
  termsUrl: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
  scholarshipContact: "",     // وسيلة طلب المنحة المجانية لغير القادرين
};
