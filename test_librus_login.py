#!/usr/bin/env python3
"""
Minimalny test logowania do Librus - POC dla GitHub Actions
Tylko sprawdza czy może się zalogować i pobrać Bearer Token
"""

import os
import sys
import json
import time
import requests
from datetime import datetime

print("=" * 60)
print("LIBRUS LOGIN TEST - GitHub Actions POC")
print("=" * 60)
print(f"Start time: {datetime.now().isoformat()}")
print(f"Python version: {sys.version}")
print()

# ============== KONFIGURACJA ==============
USERNAME = os.getenv('LIBRUS_USERNAME', '')
PASSWORD = os.getenv('LIBRUS_PASSWORD', '')

if not USERNAME or not PASSWORD:
    print("❌ BŁĄD: Brak danych logowania!")
    print("Ustaw LIBRUS_USERNAME i LIBRUS_PASSWORD")
    sys.exit(1)

print(f"📧 Username: {USERNAME}")
print(f"🔑 Password: {'*' * len(PASSWORD)}")
print()

# ============== TEST 1: POŁĄCZENIE ==============
print("TEST 1: Sprawdzanie połączenia z Librus...")
print("-" * 40)

try:
    response = requests.get('https://portal.librus.pl', timeout=10)
    print(f"✅ portal.librus.pl dostępny (status: {response.status_code})")
except Exception as e:
    print(f"❌ Nie można połączyć: {e}")
    sys.exit(1)

# ============== TEST 2: POBIERZ CSRF ==============
print("\nTEST 2: Pobieranie tokenu CSRF...")
print("-" * 40)

session = requests.Session()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
})

# Krok 1: Strona główna
try:
    resp = session.get('https://portal.librus.pl/rodzina')
    print(f"  /rodzina status: {resp.status_code}")
    print(f"  Cookies po /rodzina: {list(session.cookies.keys())}")
except Exception as e:
    print(f"  ⚠️ Błąd /rodzina: {e}")
    print("  Próbuję bezpośrednio /konto-librus/login...")

# Krok 2: Strona logowania
try:
    resp = session.get('https://portal.librus.pl/konto-librus/login')
    print(f"  /konto-librus/login status: {resp.status_code}")
    print(f"  Rozmiar HTML: {len(resp.text)} bajtów")

    # Szukaj CSRF token
    import re
    token_match = re.search(r'name="_token"[^>]*value="([^"]+)"', resp.text)

    if token_match:
        csrf_token = token_match.group(1)
        print(f"✅ CSRF Token znaleziony: {csrf_token[:20]}...")
    else:
        print("❌ Nie znaleziono CSRF token")
        print("Fragment HTML:", resp.text[:500])
        sys.exit(1)

except Exception as e:
    print(f"❌ Błąd pobierania strony logowania: {e}")
    sys.exit(1)

# ============== TEST 3: LOGOWANIE ==============
print("\nTEST 3: Próba logowania...")
print("-" * 40)

login_data = {
    'email': USERNAME,
    'password': PASSWORD,
    '_token': csrf_token,
    'redirectTo': '',
    'redirectCrc': ''
}

try:
    resp = session.post(
        'https://portal.librus.pl/konto-librus/login/action',
        data=login_data,
        headers={
            'Referer': 'https://portal.librus.pl/konto-librus/login',
            'Origin': 'https://portal.librus.pl'
        },
        allow_redirects=False
    )

    print(f"  Status odpowiedzi: {resp.status_code}")
    print(f"  Cookies po logowaniu: {list(session.cookies.keys())}")

    if resp.status_code in [302, 303]:
        print("✅ Logowanie udane (otrzymano przekierowanie)")
        location = resp.headers.get('Location', '')
        print(f"  Przekierowanie do: {location}")
    elif resp.status_code == 200:
        if 'błąd' in resp.text.lower() or 'error' in resp.text.lower():
            print("❌ Logowanie nieudane - sprawdź dane")
            sys.exit(1)
        else:
            print("⚠️ Status 200 - może być OK")
    else:
        print(f"❌ Nieoczekiwany status: {resp.status_code}")

except Exception as e:
    print(f"❌ Błąd podczas logowania: {e}")
    sys.exit(1)

# ============== TEST 4: BEARER TOKEN ==============
print("\nTEST 4: Pobieranie Bearer Token...")
print("-" * 40)

try:
    resp = session.get(
        'https://portal.librus.pl/api/v3/SynergiaAccounts',
        headers={'Accept': 'application/json'}
    )

    print(f"  Status API: {resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        print(f"  Struktura odpowiedzi: {list(data.keys())}")

        if 'accounts' in data and data['accounts']:
            print(f"✅ Znaleziono {len(data['accounts'])} kont(a)")

            for i, account in enumerate(data['accounts']):
                print(f"\n  Konto {i+1}:")
                print(f"    - Student: {account.get('studentName', 'N/A')}")
                print(f"    - Login: {account.get('login', 'N/A')}")
                print(f"    - ID: {account.get('id', 'N/A')}")

                if account.get('accessToken'):
                    token = account['accessToken']
                    print(f"    - Bearer Token: {token[:30]}...")
                    print(f"    - Token length: {len(token)}")
                else:
                    print(f"    - Bearer Token: BRAK")
        else:
            print("❌ Brak kont w odpowiedzi")
    else:
        print(f"❌ Błąd API: {resp.status_code}")
        print(f"  Treść: {resp.text[:200]}")

except Exception as e:
    print(f"❌ Błąd pobierania Bearer Token: {e}")

# ============== TEST 5: TEST API Z BEARER ==============
if 'token' in locals():
    print("\nTEST 5: Testowanie API z Bearer Token...")
    print("-" * 40)

    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/json'
    }

    endpoints = [
        ('Me', 'Dane użytkownika'),
        ('Schools', 'Szkoły'),
        ('Timetables', 'Plan lekcji'),
        ('HomeWorks', 'Zadania domowe')
    ]

    for endpoint, desc in endpoints:
        try:
            resp = requests.get(
                f'https://api.librus.pl/3.0/{endpoint}',
                headers=headers,
                timeout=10
            )
            print(f"  {desc}: {resp.status_code}", end='')

            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict):
                    print(f" ✅ (keys: {list(data.keys())})")
                else:
                    print(f" ✅")
            else:
                print(f" ❌")

        except Exception as e:
            print(f"  {desc}: ❌ {e}")

# ============== PODSUMOWANIE ==============
print("\n" + "=" * 60)
print("PODSUMOWANIE TESTÓW")
print("=" * 60)
print("✅ Połączenie z Librus: TAK")
print("✅ CSRF Token: TAK" if 'csrf_token' in locals() else "❌ CSRF Token: NIE")
print("✅ Logowanie: TAK" if resp.status_code in [302, 303, 200] else "❌ Logowanie: NIE")
print("✅ Bearer Token: TAK" if 'token' in locals() else "❌ Bearer Token: NIE")
print("\n🎉 TEST ZAKOŃCZONY POMYŚLNIE!" if 'token' in locals() else "\n❌ TEST NIEUDANY")
print(f"\nEnd time: {datetime.now().isoformat()}")
print("=" * 60)