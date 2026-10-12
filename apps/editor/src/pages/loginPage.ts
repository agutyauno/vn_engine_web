// ================================================================
// LOGIN PAGE VIEW (ADR-019, SAD 3.6, UI/UX Spec)
// Dedicated full-page authentication & guest mode portal
// ================================================================

import { AuthService } from '../services/authService';

export class LoginPage {
  private container: HTMLElement;
  private authService: AuthService;
  private activeTab: 'signin' | 'signup' = 'signin';

  constructor(container: HTMLElement) {
    this.container = container;
    this.authService = AuthService.getInstance();
  }

  public render(): void {
    const isCloudConfigured = this.authService.isConfigured();

    this.container.innerHTML = `
      <div class="auth-page-wrapper">
        <div class="auth-card">
          <!-- LOGO & BRANDING -->
          <div class="auth-brand">
            <div class="auth-logo-badge">VN</div>
            <h1 class="auth-title">VN Engine Studio</h1>
            <p class="auth-subtitle">Web Visual Novel IDE & Creation Platform</p>
          </div>

          ${!isCloudConfigured ? `
            <div class="auth-env-hint">
              <span class="hint-icon">ℹ</span>
              <span>Cloud configuration (.env) not detected. You can proceed with Guest Mode or configure Supabase keys.</span>
            </div>
          ` : ''}

          <!-- AUTH TABS -->
          <div class="auth-tabs" id="auth-tabs-bar">
            <button class="auth-tab-btn ${this.activeTab === 'signin' ? 'active' : ''}" id="tab-btn-signin" type="button">Sign In</button>
            <button class="auth-tab-btn ${this.activeTab === 'signup' ? 'active' : ''}" id="tab-btn-signup" type="button">Sign Up</button>
          </div>

          <!-- FORM CONTAINER -->
          <form class="auth-form" id="auth-form">
            <div class="auth-field">
              <label for="auth-email">Email Address</label>
              <input type="email" id="auth-email" placeholder="author@visualnovel.io" required autocomplete="email" />
            </div>

            <div class="auth-field">
              <label for="auth-password">Password</label>
              <input type="password" id="auth-password" placeholder="••••••••" required autocomplete="current-password" minlength="6" />
            </div>

            <div id="auth-error-msg" class="auth-msg-banner error" style="display: none;"></div>
            <div id="auth-success-msg" class="auth-msg-banner success" style="display: none;"></div>

            <button type="submit" class="wf-btn btn-primary auth-submit-btn" id="btn-auth-submit">
              ${this.activeTab === 'signin' ? 'Sign In to Cloud' : 'Create Account'}
            </button>
          </form>

          <!-- DIVIDER -->
          <div class="auth-divider">
            <span>OR</span>
          </div>

          <!-- GUEST / OFFLINE BUTTON -->
          <button type="button" class="wf-btn auth-guest-btn" id="btn-continue-guest">
            <svg class="guest-btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            Continue as Guest (Offline)
          </button>

          <!-- OFFLINE DISCLAIMER NOTICE -->
          <div class="auth-offline-notice">
            <div class="notice-title">Notice:</div>
            <div class="notice-body">
              In Offline Mode, projects are saved solely within your local browser storage. Clearing browser cache/cookies or browsing in Incognito mode will cause permanent data loss. Projects cannot sync across devices. Sign in to enable cloud backup.
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    const tabSignin = this.container.querySelector('#tab-btn-signin');
    const tabSignup = this.container.querySelector('#tab-btn-signup');
    const form = this.container.querySelector('#auth-form') as HTMLFormElement;
    const submitBtn = this.container.querySelector('#btn-auth-submit') as HTMLButtonElement;
    const btnGuest = this.container.querySelector('#btn-continue-guest') as HTMLButtonElement;
    const emailInput = this.container.querySelector('#auth-email') as HTMLInputElement;
    const passwordInput = this.container.querySelector('#auth-password') as HTMLInputElement;
    const errorMsg = this.container.querySelector('#auth-error-msg') as HTMLElement;
    const successMsg = this.container.querySelector('#auth-success-msg') as HTMLElement;

    tabSignin?.addEventListener('click', () => {
      this.activeTab = 'signin';
      tabSignin.classList.add('active');
      tabSignup?.classList.remove('active');
      submitBtn.textContent = 'Sign In to Cloud';
      errorMsg.style.display = 'none';
      successMsg.style.display = 'none';
    });

    tabSignup?.addEventListener('click', () => {
      this.activeTab = 'signup';
      tabSignup.classList.add('active');
      tabSignin?.classList.remove('active');
      submitBtn.textContent = 'Create Account';
      errorMsg.style.display = 'none';
      successMsg.style.display = 'none';
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorMsg.style.display = 'none';
      successMsg.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      try {
        if (this.activeTab === 'signin') {
          const res = await this.authService.signIn(email, password);
          if (res.success) {
            window.location.hash = '#/projects';
          } else {
            errorMsg.textContent = res.error || 'Failed to sign in. Please verify your credentials.';
            errorMsg.style.display = 'block';
          }
        } else {
          const res = await this.authService.signUp(email, password);
          if (res.success) {
            successMsg.textContent = res.message || 'Account created successfully! Check your email to confirm registration.';
            successMsg.style.display = 'block';
            this.activeTab = 'signin';
            tabSignin?.classList.add('active');
            tabSignup?.classList.remove('active');
          } else {
            errorMsg.textContent = res.error || 'Failed to create account.';
            errorMsg.style.display = 'block';
          }
        }
      } catch (err: unknown) {
        errorMsg.textContent = (err as Error)?.message || 'An unexpected error occurred.';
        errorMsg.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = this.activeTab === 'signin' ? 'Sign In to Cloud' : 'Create Account';
      }
    });

    btnGuest?.addEventListener('click', () => {
      this.authService.continueAsGuest();
      window.location.hash = '#/projects';
    });
  }
}
