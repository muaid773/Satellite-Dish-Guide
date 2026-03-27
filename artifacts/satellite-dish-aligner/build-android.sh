#!/bin/bash
set -e

echo "========================================"
echo "  بناء تطبيق أندرويد - APK"
echo "  Satellite Dish Aligner"
echo "========================================"
echo ""

# ── التحقق من المتطلبات ─────────────────────────────────────────────────
check_command() {
  if ! command -v "$1" &>/dev/null; then
    echo "❌ غير موجود: $1"
    echo "   $2"
    exit 1
  else
    echo "✅ $1 موجود"
  fi
}

echo "── التحقق من المتطلبات..."
check_command node   "تثبيت Node.js: https://nodejs.org/"
check_command npm    "تثبيت npm: يأتي مع Node.js"
check_command java   "تثبيت JDK 17: sudo apt install openjdk-17-jdk"

echo ""

# ── التحقق من ANDROID_HOME ─────────────────────────────────────────────
if [ -z "$ANDROID_HOME" ]; then
  echo "⚠️  متغير ANDROID_HOME غير مضبوط"
  echo "   أضف هذا لملف ~/.bashrc أو ~/.zshrc:"
  echo '   export ANDROID_HOME=$HOME/Android/Sdk'
  echo '   export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools'
  echo ""
  echo "   ثم أعد تشغيل الطرفية وشغّل السكريبت مرةً أخرى"
  exit 1
else
  echo "✅ ANDROID_HOME = $ANDROID_HOME"
fi

echo ""
echo "── تثبيت Capacitor..."
npm install @capacitor/core @capacitor/cli @capacitor/android

echo ""
echo "── بناء ملفات الويب..."
npx vite build --config vite.config.local.ts

echo ""
echo "── تهيئة Capacitor..."
if [ ! -d "android" ]; then
  npx cap add android
else
  echo "   مجلد android موجود بالفعل، تخطي..."
fi

echo ""
echo "── مزامنة الأصول..."
npx cap sync android

echo ""
echo "── بناء APK (debug)..."
cd android
./gradlew assembleDebug
cd ..

APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

if [ -f "$APK_PATH" ]; then
  echo ""
  echo "========================================"
  echo "✅ تم بناء APK بنجاح!"
  echo "   المسار: $APK_PATH"
  echo ""
  echo "للتثبيت على جهاز أندرويد متصل:"
  echo "   adb install $APK_PATH"
  echo "========================================"
else
  echo "❌ لم يُبنَ APK، تحقق من الأخطاء أعلاه"
  exit 1
fi
