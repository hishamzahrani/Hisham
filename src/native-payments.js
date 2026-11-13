// جسر الشراء داخل التطبيق (يُحزَم بـ esbuild إلى www/js/native-payments.js عند بناء نسخة المتجر)
import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";

const platform = Capacitor.getPlatform(); // "ios" | "android" | "web"

window.NativePurchases = {
  platform,
  isNative: platform === "ios" || platform === "android",
  async configure(apiKey) { await Purchases.configure({ apiKey }); },
  async customerInfo() { return (await Purchases.getCustomerInfo()).customerInfo; },
  async packages() {
    const offerings = await Purchases.getOfferings();
    return (offerings.current && offerings.current.availablePackages) || [];
  },
  async purchase(aPackage) {
    try {
      const r = await Purchases.purchasePackage({ aPackage });
      return { customerInfo: r.customerInfo };
    } catch (e) {
      const cancelled = e && (e.userCancelled || e.code === "1" || e.code === 1);
      return { cancelled, error: cancelled ? null : (e && e.message) || String(e) };
    }
  },
  async restore() { return (await Purchases.restorePurchases()).customerInfo; },
  onChange(cb) { Purchases.addCustomerInfoUpdateListener(cb); },
};
