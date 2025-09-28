#!/usr/bin/env python3
"""
Test Playwright - Logowanie i pobieranie wiadomości z Librus
"""

import os
import sys
import json
import asyncio
from datetime import datetime

print("=" * 60)
print("LIBRUS PLAYWRIGHT TEST - Logowanie + Wiadomości")
print("=" * 60)
print(f"Start: {datetime.now().isoformat()}")

# Dane logowania
USERNAME = os.getenv('LIBRUS_USERNAME', 'arkadiusz@mastalerz.it')
PASSWORD = os.getenv('LIBRUS_PASSWORD', '9WHmjbgt9WHmjbgt')

print(f"📧 Username: {USERNAME}")
print(f"🔑 Password: {'*' * len(PASSWORD)}")

try:
    from playwright.async_api import async_playwright
    print("✅ Playwright zainstalowany")
except ImportError:
    print("📦 Instaluję Playwright...")
    os.system("pip install playwright")
    os.system("playwright install chromium")
    from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        print("\n🌐 Uruchamiam przeglądarkę...")

        browser = await p.chromium.launch(
            headless=True,
            args=['--disable-blink-features=AutomationControlled']
        )

        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            locale='pl-PL'
        )

        page = await context.new_page()
        print("✅ Przeglądarka uruchomiona")

        # ========== LOGOWANIE ==========
        print("\n📡 Krok 1: Łączenie z Librus...")
        try:
            await page.goto('https://portal.librus.pl/konto-librus/login', timeout=30000)
            print("✅ Strona logowania załadowana")
        except Exception as e:
            print(f"❌ Nie można połączyć: {e}")
            await browser.close()
            return

        print("\n🔑 Krok 2: Logowanie...")
        try:
            await page.fill('input[name="email"]', USERNAME)
            await page.fill('input[name="password"]', PASSWORD)
            await page.wait_for_timeout(500)  # Krótka pauza
            await page.click('button[type="submit"]')

            await page.wait_for_load_state('networkidle', timeout=15000)

            if 'login' not in page.url:
                print("✅ Zalogowano pomyślnie!")
            else:
                print("❌ Logowanie nieudane")
                await browser.close()
                return

        except Exception as e:
            print(f"❌ Błąd logowania: {e}")
            await browser.close()
            return

        # ========== BEARER TOKEN ==========
        print("\n🎫 Krok 3: Pobieranie Bearer Token...")
        bearer_token = None

        try:
            await page.goto('https://portal.librus.pl/api/v3/SynergiaAccounts')
            content = await page.text_content('body')
            data = json.loads(content)

            if data.get('accounts'):
                account = data['accounts'][0]
                print(f"✅ Znaleziono konto: {account.get('studentName')}")
                bearer_token = account.get('accessToken')
                if bearer_token:
                    print(f"✅ Bearer Token pobrany: {bearer_token[:30]}...")

        except Exception as e:
            print(f"❌ Nie można pobrać Bearer Token: {e}")

        # ========== POBIERZ WIADOMOŚCI ==========
        if bearer_token:
            print("\n📬 Krok 4: Pobieranie wiadomości...")

            try:
                # Ustaw Bearer Token w nagłówkach
                await context.set_extra_http_headers({
                    'Authorization': f'Bearer {bearer_token}'
                })

                # Pobierz wiadomości
                await page.goto('https://api.librus.pl/3.0/Messages')
                messages_content = await page.text_content('body')
                messages_data = json.loads(messages_content)

                if 'Messages' in messages_data:
                    messages = messages_data['Messages']
                    print(f"✅ Znaleziono {len(messages)} wiadomości\n")

                    # Wyświetl pierwsze 5 wiadomości
                    for i, msg in enumerate(messages[:5], 1):
                        print(f"📧 Wiadomość {i}:")
                        print(f"   Temat: {msg.get('Subject', 'Brak tematu')}")
                        print(f"   Od: {msg.get('Sender', {}).get('Name', 'Nieznany')}")
                        print(f"   Data: {msg.get('SendDate', 'Nieznana')}")
                        print()

                else:
                    print("⚠️ Brak wiadomości w odpowiedzi")

            except Exception as e:
                print(f"❌ Błąd pobierania wiadomości: {e}")

        # ========== INNE ENDPOINTY DO TESTÓW ==========
        if bearer_token:
            print("\n🧪 Krok 5: Test innych endpointów...")

            endpoints = [
                ('HomeWorks', 'Zadania domowe'),
                ('Grades', 'Oceny'),
                ('Attendances', 'Obecności'),
                ('Timetables', 'Plan lekcji')
            ]

            for endpoint, nazwa in endpoints:
                try:
                    await page.goto(f'https://api.librus.pl/3.0/{endpoint}')
                    data = json.loads(await page.text_content('body'))

                    # Zlicz elementy
                    count = 0
                    if endpoint in data:
                        count = len(data[endpoint])
                    elif 'Timetable' in data:  # Timetables zwraca 'Timetable'
                        count = len(data['Timetable']) if isinstance(data['Timetable'], list) else 1

                    print(f"  ✅ {nazwa}: {count} elementów")

                except Exception as e:
                    print(f"  ❌ {nazwa}: Błąd - {str(e)[:50]}")

        await browser.close()
        print("\n✅ Test zakończony!")

# Uruchom
if __name__ == "__main__":
    asyncio.run(main())