import google.generativeai as genai
import os
from dotenv import load_dotenv

# بارگذاری API Key
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("خطا: API Key یافت نشد. فایل .env را چک کنید.")
else:
    genai.configure(api_key=api_key)

    print("--- لیست مدل‌های در دسترس برای شما ---")
    try:
        for m in genai.list_models():
            # فقط مدل‌هایی را نمایش بده که از قابلیت تولید محتوا پشتیبانی می‌کنند
            if 'generateContent' in m.supported_generation_methods:
                print(f"نام مدل: {m.name}")
                print(f"توضیحات: {m.display_name}")
                print(f"نسخه: {m.version}")
                print("-" * 30)
    except Exception as e:
        print(f"خطا در دریافت لیست مدل‌ها: {e}")