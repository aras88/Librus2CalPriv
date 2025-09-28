#!/usr/bin/env python3
"""
Test Librus z Playwright - nowocześniejsza alternatywa dla Selenium
Playwright jest szybszy i bardziej odporny na wykrywanie
"""

import os
import sys
import json
import asyncio
from datetime import datetime

print("=" * 60)
print("LIBRUS PLAYWRIGHT TEST - GitHub Actions")
print("=" * 60)
print(f"Start: {datetime.now().isoformat()}")

# Dane logowania
USERNAME = os.getenv('LIBRUS_USERNAME', '')
PASSWORD = os.getenv('LIBRUS_PASSWORD', '')

if not USERNAME or not PASSWORD:
    print("❌ Brak danych logowania w secrets!")
    sys.exit(1)

print(f"📧 Username: {USERNAME}")
print(f"🔑 Password: {'*' * len(PASSWORD)}")

# Instalacja Playwright jeśli brak
try:
    from playwright.async_api import async_playwright
    print("✅ Playwright zainstalowany")
except ImportError:
    print("📦 Instaluję Playwright...")
    os.system("pip install playwright")
    os.system("playwright install chromium")
    from playwright.async_api import async_playwright

async def test_librus_login():
    """Główny test logowania"""

    async with async_playwright() as p:
        print("\n🌐 Uruchamiam przeglądarkę...")

        # Opcje przeglądarki - stealth mode
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox'
            ]
        )

        # Nowy kontekst z user agent
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport={'width': 1920, 'height': 1080},
            locale='pl-PL'
        )

        # Dodaj skrypty anti-detection
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
        """)

        page = await context.new_page()

        print("✅ Przeglądarka uruchomiona (Playwright/Chromium)")

        # ============== TEST POŁĄCZENIA ==============
        print("\n📡 TEST 1: Łączenie z Librus...")

        try:
            # Idź do strony logowania
            response = await page.goto(
                'https://portal.librus.pl/konto-librus/login',
                wait_until='networkidle',
                timeout=30000
            )

            print(f"  Status: {response.status}")
            print(f"  URL: {page.url}")

            if response.status == 200:
                print("✅ Połączono z Librus!")
            else:
                print(f"⚠️ Nieoczekiwany status: {response.status}")

            # Screenshot dla debugowania
            await page.screenshot(path='login_page.png')
            print("  📸 Screenshot zapisany: login_page.png")

        except Exception as e:
            print(f"❌ Nie można połączyć: {e}")
            await browser.close()
            return False

        # ============== LOGOWANIE ==============
        print("\n🔑 TEST 2: Logowanie...")

        try:
            # Znajdź i wypełnij formularz
            print("  Wypełniam email...")
            await page.fill('input[name="email"]', USERNAME)

            print("  Wypełniam hasło...")
            await page.fill('input[name="password"]', PASSWORD)

            # Czekaj chwilę (symulacja człowieka)
            await page.wait_for_timeout(1000)

            print("  Klikam przycisk logowania...")
            await page.click('button[type="submit"]')

            # Czekaj na nawigację
            print("  Czekam na przekierowanie...")
            await page.wait_for_load_state('networkidle', timeout=15000)

            # Sprawdź URL po logowaniu
            current_url = page.url
            print(f"  URL po logowaniu: {current_url}")

            if 'login' not in current_url.lower():
                print("✅ LOGOWANIE UDANE!")
                await page.screenshot(path='after_login.png')
            else:
                print("❌ Logowanie nieudane - nadal na stronie logowania")
                # Sprawdź błędy
                error_element = await page.query_selector('.error, .alert-danger')
                if error_element:
                    error_text = await error_element.text_content()
                    print(f"  Błąd: {error_text}")
                await browser.close()
                return False

        except Exception as e:
            print(f"❌ Błąd podczas logowania: {e}")
            await page.screenshot(path='error.png')
            await browser.close()
            return False

        # ============== BEARER TOKEN ==============
        print("\n🎫 TEST 3: Pobieranie Bearer Token...")

        try:
            # Idź do API endpoint
            api_response = await page.goto(
                'https://portal.librus.pl/api/v3/SynergiaAccounts',
                wait_until='networkidle'
            )

            # Pobierz JSON
            content = await page.content()

            # Wyciągnij JSON z <pre> jeśli jest
            json_element = await page.query_selector('pre')
            if json_element:
                json_text = await json_element.text_content()
            else:
                json_text = await page.text_content()

            data = json.loads(json_text)

            if data.get('accounts'):
                print(f"✅ Znaleziono {len(data['accounts'])} kont(a)")

                for i, account in enumerate(data['accounts']):
                    print(f"\n  Konto {i+1}:")
                    print(f"    Student: {account.get('studentName')}")
                    print(f"    Login: {account.get('login')}")

                    if account.get('accessToken'):
                        token = account['accessToken']
                        print(f"    Token: {token[:40]}...")
                        print(f"    Token length: {len(token)}")

                        # Test API z tokenem
                        await test_api_with_token(page, token)
            else:
                print("⚠️ Brak kont w odpowiedzi")

        except Exception as e:
            print(f"❌ Błąd pobierania Bearer Token: {e}")

        # Zamknij przeglądarkę
        await browser.close()
        return True

async def test_api_with_token(page, token):
    """Test API z Bearer Token"""
    print("\n  🧪 Test API z Bearer Token:")

    endpoints = [
        ('Me', 'https://api.librus.pl/3.0/Me'),
        ('Schools', 'https://api.librus.pl/3.0/Schools'),
        ('Timetables', 'https://api.librus.pl/3.0/Timetables')
    ]

    for name, url in endpoints:
        try:
            # Ustaw nagłówek Authorization
            await page.set_extra_http_headers({
                'Authorization': f'Bearer {token}'
            })

            response = await page.goto(url, wait_until='networkidle')
            print(f"    {name}: {response.status} {'✅' if response.status == 200 else '❌'}")

        except Exception as e:
            print(f"    {name}: ❌ {str(e)[:50]}")

# ============== URUCHOMIENIE ==============

async def main():
    """Główna funkcja"""
    success = await test_librus_login()

    print("\n" + "=" * 60)
    if success:
        print("🎉 TEST ZAKOŃCZONY POMYŚLNIE!")
    else:
        print("❌ TEST NIEUDANY")
    print("=" * 60)

    return 0 if success else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)