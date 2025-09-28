#!/usr/bin/env python3
"""
Test Librus z Selenium - działa przez przeglądarkę
"""

import os
import sys
import time
from datetime import datetime

print("=" * 60)
print("LIBRUS SELENIUM TEST - GitHub Actions")
print("=" * 60)

# Sprawdź zmienne środowiskowe
USERNAME = os.getenv('LIBRUS_USERNAME', '')
PASSWORD = os.getenv('LIBRUS_PASSWORD', '')

if not USERNAME or not PASSWORD:
    print("❌ Brak danych logowania!")
    sys.exit(1)

print(f"📧 Username: {USERNAME}")
print(f"🔑 Password: {'*' * len(PASSWORD)}")

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    print("✅ Selenium zainstalowane")
except ImportError:
    print("❌ Brak Selenium - instaluję...")
    os.system("pip install selenium")
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service

# Konfiguracja Chrome
chrome_options = Options()
chrome_options.add_argument('--headless')
chrome_options.add_argument('--no-sandbox')
chrome_options.add_argument('--disable-dev-shm-usage')
chrome_options.add_argument('--disable-gpu')
chrome_options.add_argument('--disable-features=VizDisplayCompositor')
chrome_options.add_argument('--window-size=1920,1080')

# Dodatkowe opcje stealth
chrome_options.add_argument('--disable-blink-features=AutomationControlled')
chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
chrome_options.add_experimental_option('useAutomationExtension', False)
chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

print("\n🌐 Uruchamiam przeglądarkę...")

try:
    driver = webdriver.Chrome(options=chrome_options)
    print("✅ Chrome uruchomiony")

    # Usuń webdriver property
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

    print("\n📡 Łączenie z Librus...")
    driver.get("https://portal.librus.pl/konto-librus/login")

    # Czekaj na załadowanie
    time.sleep(3)

    # Sprawdź tytuł
    print(f"📄 Tytuł strony: {driver.title}")

    # Znajdź formularz
    wait = WebDriverWait(driver, 10)

    print("\n🔑 Wypełniam formularz logowania...")

    # Email
    email_input = wait.until(
        EC.presence_of_element_located((By.NAME, "email"))
    )
    email_input.send_keys(USERNAME)
    print("  ✓ Email wpisany")

    # Hasło
    password_input = driver.find_element(By.NAME, "password")
    password_input.send_keys(PASSWORD)
    print("  ✓ Hasło wpisane")

    # Przycisk logowania
    login_button = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
    login_button.click()
    print("  ✓ Przycisk kliknięty")

    # Czekaj na przekierowanie
    time.sleep(5)

    # Sprawdź URL
    current_url = driver.current_url
    print(f"\n📍 URL po logowaniu: {current_url}")

    if "login" not in current_url:
        print("✅ LOGOWANIE UDANE!")

        # Spróbuj pobrać Bearer Token
        print("\n🎫 Pobieranie Bearer Token...")
        driver.get("https://portal.librus.pl/api/v3/SynergiaAccounts")
        time.sleep(2)

        # Pobierz JSON
        page_source = driver.find_element(By.TAG_NAME, "pre").text
        import json
        data = json.loads(page_source)

        if data.get('accounts'):
            print(f"✅ Znaleziono {len(data['accounts'])} kont")
            for acc in data['accounts']:
                print(f"  - {acc.get('studentName')}")
                if acc.get('accessToken'):
                    print(f"  - Token: {acc['accessToken'][:30]}...")
    else:
        print("❌ Logowanie nieudane")

except Exception as e:
    print(f"\n❌ Błąd: {e}")
    import traceback
    traceback.print_exc()

finally:
    if 'driver' in locals():
        driver.quit()
        print("\n🔚 Przeglądarka zamknięta")

print("\n" + "=" * 60)
print("TEST ZAKOŃCZONY")
print("=" * 60)