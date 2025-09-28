const { chromium } = require('playwright');
const fs = require('fs').promises;

/**
 * Librus Sync - Based on LibrusAuthFinal.gs logic
 * Uses Playwright to handle authentication with proper cookie management
 */

class LibrusClient {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.cookies = {};
    this.bearerToken = null;
    this.synergiaAccounts = [];
    this.isAuthenticated = false;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * Initialize Playwright browser
   */
  async init() {
    console.log('🚀 Inicjalizacja przeglądarki...');

    this.browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage'
      ]
    });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'pl-PL',
      timezoneId: 'Europe/Warsaw'
    });

    this.page = await this.context.newPage();

    // Intercept requests to handle cookies better
    await this.page.route('**/*', async route => {
      const request = route.request();
      const headers = {
        ...request.headers(),
        'Accept-Language': 'pl-PL,pl;q=0.9'
      };
      await route.continue({ headers });
    });
  }

  /**
   * Main login method - follows LibrusAuthFinal.gs logic
   */
  async login() {
    console.log('🔐 Rozpoczynam logowanie do Librus...');
    console.log('⏰ Czas startu:', new Date().toISOString());
    console.log('👤 Użytkownik:', this.username);

    try {
      await this.init();

      // Krok 1: Pobierz token CSRF
      console.log('\n📝 KROK 1/3: Pobieranie tokenu CSRF...');
      const startCsrf = Date.now();
      const csrfToken = await this.getCsrfToken();
      console.log(`⏱️ Czas pobrania CSRF: ${Date.now() - startCsrf}ms`);

      if (!csrfToken) {
        throw new Error('Nie można pobrać tokenu CSRF');
      }
      console.log('✓ Token CSRF pobrany:', csrfToken.substring(0, 20) + '...');

      // Krok 2: Zaloguj się
      console.log('\n🔑 KROK 2/3: Wykonywanie logowania...');
      const startLogin = Date.now();
      const loginSuccess = await this.performLogin(csrfToken);
      console.log(`⏱️ Czas logowania: ${Date.now() - startLogin}ms`);

      if (!loginSuccess) {
        throw new Error('Logowanie nieudane - sprawdź hasło');
      }
      console.log('✓ Logowanie zakończone sukcesem');

      // Krok 3: Pobierz Bearer Token i dane kont
      console.log('\n🎫 KROK 3/3: Pobieranie danych kont Synergia...');
      const startAccounts = Date.now();
      await this.fetchSynergiaAccounts();
      console.log(`⏱️ Czas pobrania kont: ${Date.now() - startAccounts}ms`);

      if (this.bearerToken) {
        console.log('✅ Zalogowano pomyślnie z Bearer Token!');
        console.log('🎯 Token (pierwsze 30 znaków):', this.bearerToken.substring(0, 30) + '...');
        this.isAuthenticated = true;
        return true;
      } else {
        console.log('⚠️ Zalogowano ale brak Bearer Token');
        console.log('📋 Dostępne ciasteczka:', Object.keys(this.cookies).join(', '));
        this.isAuthenticated = true;
        return true;
      }

    } catch (error) {
      console.error('❌ Błąd logowania:', error.toString());
      console.error('📊 Stack trace:', error.stack);
      return false;
    }
  }

  /**
   * Get CSRF token from login page
   */
  async getCsrfToken() {
    console.log('  🌐 Pobieranie strony głównej...');

    try {
      // First visit main page
      console.log('  ⏱️ Start request:', new Date().toISOString());
      const response1 = await this.page.goto('https://portal.librus.pl/rodzina', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      console.log('  ⏱️ End request:', new Date().toISOString());
      console.log(`  📊 Status strony głównej: ${response1.status()}`);

      // Store cookies
      await this.updateCookies();
      console.log(`  🍪 Ciasteczka po stronie głównej: ${Object.keys(this.cookies).join(', ')}`);

      // Now go to login page
      console.log('  🌐 Pobieranie strony logowania...');
      console.log('  ⏱️ Start login page request:', new Date().toISOString());
      const response2 = await this.page.goto('https://portal.librus.pl/konto-librus/login', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      console.log('  ⏱️ End login page request:', new Date().toISOString());
      console.log(`  📊 Status strony logowania: ${response2.status()}`);

      await this.updateCookies();
      console.log(`  🍪 Ciasteczka po stronie logowania: ${Object.keys(this.cookies).join(', ')}`);

      // Check for form fields
      const hasEmail = await this.page.$('input[name="email"]');
      const hasPassword = await this.page.$('input[name="password"]');

      if (hasEmail) {
        console.log('  ✓ Znaleziono pole email w formularzu');
      }
      if (hasPassword) {
        console.log('  ✓ Znaleziono pole hasła w formularzu');
      }

      // Extract CSRF token
      const csrfToken = await this.page.evaluate(() => {
        const tokenInput = document.querySelector('input[name="_token"]');
        return tokenInput ? tokenInput.value : null;
      });

      if (csrfToken) {
        console.log('  ✓ Token CSRF znaleziony w HTML');
        return csrfToken;
      } else {
        console.log('  ❌ Nie znaleziono tokenu CSRF w HTML');
        const html = await this.page.content();
        console.log('  📝 Pierwsze 500 znaków HTML:', html.substring(0, 500));
        return null;
      }

    } catch (error) {
      console.error('  ❌ Błąd podczas pobierania tokenu CSRF:', error.toString());

      if (error.toString().includes('timeout')) {
        console.error('  ⏱️ TIMEOUT - strona nie odpowiada');
      } else if (error.toString().includes('DNS')) {
        console.error('  🌐 Problem z DNS - nie można znaleźć serwera');
      }

      // Take screenshot for debugging
      await this.page.screenshot({ path: 'debug-csrf-error.png' });
      return null;
    }
  }

  /**
   * Perform login with credentials
   */
  async performLogin(csrfToken) {
    console.log('  📮 Wysyłanie danych logowania...');
    console.log(`  🍪 Ciasteczka przed logowaniem: ${Object.keys(this.cookies).join(', ')}`);

    try {
      // Fill and submit form
      await this.page.fill('input[name="email"]', this.username);
      await this.page.fill('input[name="password"]', this.password);

      // Set CSRF token if not already set
      await this.page.evaluate((token) => {
        const tokenInput = document.querySelector('input[name="_token"]');
        if (tokenInput) tokenInput.value = token;
      }, csrfToken);

      // Submit form with navigation wait
      const [response] = await Promise.all([
        this.page.waitForNavigation({
          waitUntil: 'domcontentloaded',
          timeout: 30000
        }),
        this.page.click('button[type="submit"], input[type="submit"]')
      ]);

      const statusCode = response.status();
      const url = response.url();
      console.log(`  📊 Status odpowiedzi: ${statusCode}`);
      console.log(`  🔗 URL po logowaniu: ${url}`);

      await this.updateCookies();
      console.log(`  🍪 Ciasteczka po logowaniu: ${Object.keys(this.cookies).join(', ')}`);

      // Check if login was successful
      if (url.includes('rodzina') || url.includes('konto')) {
        console.log('  ✓ Logowanie pomyślne - przekierowano na stronę główną');

        // Follow any additional redirects
        if (url.includes('oauth2')) {
          console.log('  🔄 Wykryto OAuth2 flow, podążam...');
          await this.page.waitForLoadState('networkidle');
        }

        return true;
      }

      // Check for error messages
      const errorMsg = await this.page.textContent('.alert-danger, .error').catch(() => null);
      if (errorMsg) {
        console.log('  ❌ Błąd logowania:', errorMsg);
      }

      return false;

    } catch (error) {
      console.error('  ❌ Błąd podczas logowania:', error.toString());
      await this.page.screenshot({ path: 'debug-login-error.png' });
      return false;
    }
  }

  /**
   * Fetch Synergia accounts and bearer token
   */
  async fetchSynergiaAccounts() {
    console.log('  📚 Pobieranie kont Synergia...');

    try {
      // Navigate to accounts endpoint
      const response = await this.page.goto('https://portal.librus.pl/konto-librus/informacje/dane-uczniow', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      console.log(`  📊 Status: ${response.status()}`);

      // Try to get bearer token from page or API calls
      const bearerToken = await this.page.evaluate(async () => {
        // Check localStorage
        const storedToken = localStorage.getItem('bearer-token') ||
                          sessionStorage.getItem('bearer-token');
        if (storedToken) return storedToken;

        // Try to fetch accounts via API
        try {
          const response = await fetch('https://portal.librus.pl/api/v3/SynergiaAccounts', {
            credentials: 'include'
          });
          const data = await response.json();

          // Return first account's token if available
          if (data.accounts && data.accounts[0]) {
            return data.accounts[0].accessToken;
          }
        } catch (e) {
          console.error('API call failed:', e);
        }

        return null;
      });

      if (bearerToken) {
        this.bearerToken = bearerToken;
        console.log('  ✓ Bearer token pobrany!');
      }

      // Extract account information from page
      const accountInfo = await this.page.evaluate(() => {
        const accounts = [];
        // Look for student names in various places
        document.querySelectorAll('.student-name, .uczen-nazwa, [data-student-name]').forEach(el => {
          accounts.push({
            name: el.textContent.trim()
          });
        });
        return accounts;
      });

      if (accountInfo.length > 0) {
        this.synergiaAccounts = accountInfo;
        console.log(`  ✓ Znaleziono ${accountInfo.length} kont(a)`);
        accountInfo.forEach(acc => {
          console.log(`    - ${acc.name}`);
        });
      }

      return true;

    } catch (error) {
      console.error('  ❌ Błąd podczas pobierania kont:', error.toString());
      return false;
    }
  }

  /**
   * Update cookies from page
   */
  async updateCookies() {
    const cookies = await this.context.cookies();
    cookies.forEach(cookie => {
      this.cookies[cookie.name] = cookie.value;
    });
  }

  /**
   * Test API access with bearer token
   */
  async testApiAccess() {
    if (!this.bearerToken) {
      console.log('⚠️ Brak Bearer Token - pomijam test API');
      return;
    }

    console.log('\n🧪 Testowanie dostępu do API z Bearer Token...');

    const endpoints = [
      { url: 'https://api.librus.pl/3.0/Me', desc: 'Dane użytkownika' },
      { url: 'https://api.librus.pl/3.0/Timetables', desc: 'Plan lekcji' },
      { url: 'https://api.librus.pl/3.0/Homeworks', desc: 'Prace domowe' }
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await this.page.evaluate(async (params) => {
          const res = await fetch(params.url, {
            headers: {
              'Authorization': `Bearer ${params.token}`,
              'Accept': 'application/json'
            }
          });
          return {
            status: res.status,
            ok: res.ok
          };
        }, { url: endpoint.url, token: this.bearerToken });

        console.log(`  ${endpoint.desc}: ${response.status} ${response.ok ? '✅' : '❌'}`);
      } catch (error) {
        console.log(`  ${endpoint.desc}: ❌ ${error.message}`);
      }
    }
  }

  /**
   * Cleanup browser
   */
  async cleanup() {
    console.log('\n🧹 Czyszczenie...');
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Main run method
   */
  async run() {
    const success = await this.login();

    if (success) {
      console.log('\n✨ SUKCES! Zalogowano do Librus');
      console.log('📊 Podsumowanie:');
      console.log(`  - Użytkownik: ${this.username}`);
      console.log(`  - Bearer Token: ${this.bearerToken ? '✅ Pobrany' : '❌ Brak'}`);
      console.log(`  - Konta: ${this.synergiaAccounts.length}`);
      console.log(`  - Ciasteczka: ${Object.keys(this.cookies).length}`);

      await this.testApiAccess();
    } else {
      console.log('\n❌ NIEPOWODZENIE - nie udało się zalogować');
    }

    await this.cleanup();

    return {
      success: success,
      bearerToken: this.bearerToken,
      accounts: this.synergiaAccounts,
      timestamp: new Date().toISOString()
    };
  }
}

// Main execution
async function main() {
  console.log('='.repeat(60));
  console.log('LIBRUS SYNC - FINAL VERSION (Based on LibrusAuthFinal.gs)');
  console.log('='.repeat(60));

  const config = {
    username: process.env.LIBRUS_USERNAME || 'arkadiusz@mastalerz.it',
    password: process.env.LIBRUS_PASSWORD || '9WHmjbgt9WHmjbgt'
  };

  const client = new LibrusClient(config.username, config.password);
  const results = await client.run();

  // Save results
  await fs.writeFile(
    'sync-results.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n📁 Wyniki zapisane do sync-results.json');
  process.exit(results.success ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { LibrusClient };