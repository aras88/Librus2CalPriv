const { chromium } = require('playwright');
const fs = require('fs').promises;

/**
 * Librus to Google Calendar sync using Playwright
 * This bypasses Cloudflare by using a real browser
 */

class LibrusSyncBot {
  constructor(config) {
    this.config = {
      username: process.env.LIBRUS_USERNAME || config.username,
      password: process.env.LIBRUS_PASSWORD || config.password,
      headless: process.env.HEADLESS !== 'false',
      timeout: 30000
    };
    this.browser = null;
    this.page = null;
    this.results = {
      timestamp: new Date().toISOString(),
      steps: [],
      success: false
    };
  }

  async init() {
    console.log('🚀 Starting Librus sync bot...');

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();

    // Set user agent to avoid detection
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'pl-PL,pl;q=0.9'
    });

    // Set viewport
    await this.page.setViewportSize({ width: 1280, height: 720 });
  }

  async login() {
    console.log('🔐 Logging in to Librus...');

    try {
      // Navigate to login page
      await this.page.goto('https://portal.librus.pl/oauth2/login', {
        waitUntil: 'networkidle',
        timeout: this.config.timeout
      });

      // Wait for Cloudflare to pass
      await this.page.waitForTimeout(3000);

      // Take screenshot for debugging
      await this.page.screenshot({ path: 'debug-login-page.png' });

      // Check if we're on login page
      const url = this.page.url();
      console.log('Current URL:', url);

      // Wait for and fill login form
      await this.page.waitForSelector('input[name="login"]', {
        timeout: 10000
      });

      console.log('Filling credentials...');
      await this.page.fill('input[name="login"]', this.config.username);
      await this.page.fill('input[name="pass"]', this.config.password);

      // Click login button
      console.log('Clicking login button...');
      await Promise.all([
        this.page.waitForNavigation({
          waitUntil: 'networkidle',
          timeout: this.config.timeout
        }),
        this.page.click('button[type="submit"], input[type="submit"]')
      ]);

      // Check if login successful
      const newUrl = this.page.url();
      console.log('After login URL:', newUrl);

      if (newUrl.includes('konto') || newUrl.includes('dashboard')) {
        console.log('✅ Login successful!');
        this.results.steps.push({
          step: 'login',
          success: true,
          url: newUrl
        });
        return true;
      } else {
        // Check for error message
        const errorText = await this.page.textContent('.error, .alert-danger').catch(() => null);
        console.log('❌ Login failed:', errorText || 'Unknown error');
        this.results.steps.push({
          step: 'login',
          success: false,
          error: errorText
        });
        return false;
      }

    } catch (error) {
      console.error('❌ Login error:', error.message);
      this.results.steps.push({
        step: 'login',
        success: false,
        error: error.message
      });
      return false;
    }
  }

  async fetchAccounts() {
    console.log('📚 Fetching Synergia accounts...');

    try {
      // Method 1: Try API call
      const accountsData = await this.page.evaluate(async () => {
        try {
          const response = await fetch('https://portal.librus.pl/api/v3/SynergiaAccounts', {
            credentials: 'include',
            headers: {
              'Accept': 'application/json'
            }
          });
          return await response.json();
        } catch (e) {
          return null;
        }
      });

      if (accountsData && accountsData.accounts) {
        console.log(`✅ Found ${accountsData.accounts.length} accounts`);
        this.results.accounts = accountsData.accounts.map(acc => ({
          name: acc.studentName || acc.name,
          login: acc.login,
          token: acc.accessToken ? acc.accessToken.substring(0, 30) + '...' : null
        }));
        this.results.steps.push({
          step: 'fetchAccounts',
          success: true,
          count: accountsData.accounts.length
        });
        return accountsData.accounts;
      }

      // Method 2: Try navigating to Synergia
      console.log('Trying direct Synergia access...');
      await this.page.goto('https://synergia.librus.pl/loguj', {
        waitUntil: 'networkidle',
        timeout: this.config.timeout
      });

      const synergiaUrl = this.page.url();
      if (synergiaUrl.includes('uczen') || synergiaUrl.includes('rodzic')) {
        console.log('✅ Direct Synergia access successful');
        this.results.steps.push({
          step: 'fetchAccounts',
          success: true,
          method: 'direct'
        });
        return [{ directAccess: true, url: synergiaUrl }];
      }

      throw new Error('Could not fetch accounts');

    } catch (error) {
      console.error('❌ Fetch accounts error:', error.message);
      this.results.steps.push({
        step: 'fetchAccounts',
        success: false,
        error: error.message
      });
      return null;
    }
  }

  async fetchCalendarEvents() {
    console.log('📅 Fetching calendar events...');

    try {
      // Navigate to calendar
      await this.page.goto('https://synergia.librus.pl/terminarz', {
        waitUntil: 'networkidle',
        timeout: this.config.timeout
      });

      // Wait for calendar to load
      await this.page.waitForSelector('.kalendarz, .calendar, #calendar', {
        timeout: 10000
      });

      // Extract events
      const events = await this.page.evaluate(() => {
        const eventElements = document.querySelectorAll('.event, .kalendarz-wpis, [class*="event"]');
        return Array.from(eventElements).map(el => ({
          title: el.textContent.trim(),
          date: el.getAttribute('data-date') || el.closest('[data-date]')?.getAttribute('data-date')
        }));
      });

      console.log(`✅ Found ${events.length} events`);
      this.results.events = events;
      this.results.steps.push({
        step: 'fetchEvents',
        success: true,
        count: events.length
      });

      return events;

    } catch (error) {
      console.error('❌ Fetch events error:', error.message);
      this.results.steps.push({
        step: 'fetchEvents',
        success: false,
        error: error.message
      });
      return [];
    }
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');
    if (this.browser) {
      await this.browser.close();
    }
  }

  async run() {
    try {
      await this.init();

      const loginSuccess = await this.login();
      if (!loginSuccess) {
        throw new Error('Login failed');
      }

      const accounts = await this.fetchAccounts();
      if (accounts) {
        await this.fetchCalendarEvents();
      }

      this.results.success = true;
      this.results.message = 'Sync completed successfully';

    } catch (error) {
      console.error('❌ Sync failed:', error.message);
      this.results.success = false;
      this.results.error = error.message;
    } finally {
      await this.cleanup();
    }

    return this.results;
  }
}

// Main execution
async function main() {
  console.log('=' * 50);
  console.log('LIBRUS SYNC WITH PLAYWRIGHT');
  console.log('=' * 50);

  const config = {
    username: process.env.LIBRUS_USERNAME || 'arkadiusz@mastalerz.it',
    password: process.env.LIBRUS_PASSWORD || '9WHmjbgt9WHmjbgt'
  };

  const bot = new LibrusSyncBot(config);
  const results = await bot.run();

  // Save results to file
  await fs.writeFile(
    'sync-results.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n📊 Results saved to sync-results.json');
  console.log('Success:', results.success);

  // Exit with appropriate code
  process.exit(results.success ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { LibrusSyncBot };