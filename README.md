# 🧪 Librus Login Test - GitHub Actions POC

## Minimalne rozwiązanie testujące logowanie do Librus

### 📁 Zawartość:
- `test_librus_login.py` - Prosty skrypt testujący logowanie (bez Selenium!)
- `.github/workflows/test-librus-login.yml` - GitHub Actions workflow

### ✅ Co robi ten test:
1. Łączy się z portal.librus.pl
2. Pobiera token CSRF
3. Loguje się używając requests (bez przeglądarki!)
4. Pobiera Bearer Token
5. Testuje API endpoints
6. Wyświetla szczegółowe logi

### 🚀 Jak użyć:

#### Krok 1: Stwórz nowe repo na GitHub
```bash
# Utwórz nowe repo na github.com
# Lub użyj istniejącego
```

#### Krok 2: Wrzuć pliki
```bash
git init
git add .
git commit -m "Initial commit - Librus login test"
git remote add origin https://github.com/TWOJ_USER/NAZWA_REPO.git
git push -u origin main
```

#### Krok 3: Dodaj secrety
Idź do: **Settings → Secrets and variables → Actions → New repository secret**

Dodaj 2 secrety:
- `LIBRUS_USERNAME` - twój email do Librus
- `LIBRUS_PASSWORD` - twoje hasło do Librus

#### Krok 4: Uruchom test
1. Idź do zakładki **Actions**
2. Wybierz **"Test Librus Login"**
3. Kliknij **"Run workflow"**
4. Obserwuj logi

### 📊 Przykładowy output:
```
============================================================
LIBRUS LOGIN TEST - GitHub Actions POC
============================================================
Start time: 2024-12-28T18:30:00
Python version: 3.10.12

📧 Username: arkadiusz@mastalerz.it
🔑 Password: ***************

TEST 1: Sprawdzanie połączenia z Librus...
----------------------------------------
✅ portal.librus.pl dostępny (status: 200)

TEST 2: Pobieranie tokenu CSRF...
----------------------------------------
  /rodzina status: 200
  Cookies po /rodzina: ['PHPSESSID', 'device_identifier']
  /konto-librus/login status: 200
  Rozmiar HTML: 45632 bajtów
✅ CSRF Token znaleziony: K8zX9mN2pQ1rS3tU5vW...

TEST 3: Próba logowania...
----------------------------------------
  Status odpowiedzi: 302
  Cookies po logowaniu: ['PHPSESSID', 'portal_librus_session']
✅ Logowanie udane (otrzymano przekierowanie)
  Przekierowanie do: /rodzina/uczen/index

TEST 4: Pobieranie Bearer Token...
----------------------------------------
  Status API: 200
  Struktura odpowiedzi: ['accounts']
✅ Znaleziono 1 kont(a)

  Konto 1:
    - Student: Jan Kowalski
    - Login: jan123
    - ID: 123456
    - Bearer Token: eyJhbGciOiJIUzI1NiIsInR5cCI...
    - Token length: 256

TEST 5: Testowanie API z Bearer Token...
----------------------------------------
  Dane użytkownika: 200 ✅ (keys: ['Me'])
  Szkoły: 200 ✅ (keys: ['Schools'])
  Plan lekcji: 200 ✅ (keys: ['Timetable'])
  Zadania domowe: 200 ✅ (keys: ['HomeWorks'])

============================================================
PODSUMOWANIE TESTÓW
============================================================
✅ Połączenie z Librus: TAK
✅ CSRF Token: TAK
✅ Logowanie: TAK
✅ Bearer Token: TAK

🎉 TEST ZAKOŃCZONY POMYŚLNIE!
```

### ❓ Co jeśli nie działa?

1. **"Nie można połączyć"** - GitHub Actions może być blokowane przez Librus
2. **"Brak CSRF token"** - Librus zmienił strukturę HTML
3. **"Logowanie nieudane"** - Sprawdź dane w secrets

### 🎯 Co dalej?

Jeśli test przejdzie pomyślnie, można rozbudować o:
- Pobieranie wydarzeń
- Integrację z Google Calendar
- Automatyczne uruchamianie co godzinę

### 📝 Uwagi:
- To rozwiązanie **NIE używa Selenium** - czysty requests
- Działa szybko (< 10 sekund)
- Nie wymaga Chrome/Firefox
- 100% darmowe na GitHub Actions