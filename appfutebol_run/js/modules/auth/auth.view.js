import { APP_VERSION } from "../../core/version.js";

export function renderAuthScreen(uiState = {}) {
  const mode = uiState.authMode === 'register' ? 'register' : 'login';
  // Aceita tanto string solta quanto objeto { type, text }. Antes, uma string
  // (ex.: sessão expirada) caía em message.text === undefined e renderizava
  // literalmente "undefined" na caixa de aviso.
  const raw = uiState.authMessage;
  const message = typeof raw === 'string' ? { type: 'info', text: raw } : raw;
  const messageText = message && message.text ? message.text : '';
  const messageClass = message
    ? (message.type === 'success' ? 'is-success' : message.type === 'info' ? 'is-info' : 'is-error')
    : '';

  return `
    <div class="login-screen">
      <img class="login-crest" src="./img/convocados-crest.png" alt="Escudo Convocados" style="width:188px;height:188px;border-radius:0;object-fit:contain;box-shadow:none;background:transparent;border:none;outline:none;">
      <div class="login-subtitle" style="margin-top:6px;color:var(--hfc-text);font-weight:600;letter-spacing:.04em;">Harmonia FC</div>
      <div class="login-subtitle" style="margin-top:2px;font-size:13px;opacity:0.75;">Convoca. Joga. Resenha. <span style="opacity:.6;">· ${String(APP_VERSION || '').replace(/^v/, '').split('-')[0]}</span></div>

      <section class="auth-card">
        <div class="auth-tabs">
          <button class="auth-tab ${mode === 'login' ? 'is-active' : ''}" type="button" data-auth-mode="login">Entrar</button>
          <button class="auth-tab ${mode === 'register' ? 'is-active' : ''}" type="button" data-auth-mode="register">Cadastrar</button>
        </div>

        ${messageText ? `<div class="message-box ${messageClass}">${messageText}</div>` : ''}

        ${mode === 'login' ? renderLoginForm() : renderRegisterForm()}
      </section>

      <p class="login-legal">
        Ao continuar, você concorda com os
        <a href="./termos.html" target="_blank" rel="noopener">Termos de Uso</a>
        e a <a href="./privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>.
      </p>
    </div>
  `;
}

function renderLoginForm() {
  return `
    <form id="login-form" class="form-stack" autocomplete="on" novalidate>
      <div class="form-group">
        <label class="form-label" for="login-phone">Telefone</label>
        <input
          class="input"
          id="login-phone"
          name="phone"
          type="tel"
          inputmode="numeric"
          autocomplete="username webauthn"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="next"
          required
          placeholder="48999999999"
        >
        <small class="field-hint">Digite apenas números, com DDD.</small>
      </div>

      <div class="form-group">
        <label class="form-label" for="login-password">Senha</label>
        <input
          class="input"
          id="login-password"
          name="password"
          type="password"
          autocomplete="current-password"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="done"
          required
          placeholder="Digite sua senha"
        >
      </div>

      <div class="actions">
        <button class="btn btn-primary" type="submit">Entrar</button>
      </div>
    </form>
  `;
}

function renderRegisterForm() {
  return `
    <form id="register-form" class="form-stack" autocomplete="on" novalidate>
      <div class="form-group">
        <label class="form-label" for="register-name">Nome</label>
        <input class="input" id="register-name" name="name" autocomplete="name" autocapitalize="words" enterkeyhint="next" required placeholder="Seu nome completo">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="register-phone">Telefone</label>
          <input class="input" id="register-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next" required placeholder="48999999999">
          <small class="field-hint">Digite apenas números, com DDD.</small>
        </div>

        <div class="form-group">
          <label class="form-label" for="register-birthdate">Nascimento</label>
          <input class="input" id="register-birthdate" name="birthDate" type="date" autocomplete="bday" required>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="register-role">Perfil</label>
          <select class="select" id="register-role" name="role" autocomplete="off">
            <option value="player">Jogador</option>
            <option value="carne">Apenas carne</option>
          </select>
        </div>

        <div class="form-group" id="position-group">
          <label class="form-label" for="register-position">Posição</label>
          <select class="select" id="register-position" name="position" autocomplete="off">
            <option value="">Selecione</option>
            <option value="gol">Goleiro</option>
            <option value="zag">Zagueiro</option>
            <option value="meia">Meia</option>
            <option value="atk">Atacante</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="register-password">Senha</label>
          <input class="input" id="register-password" name="password" type="password" autocomplete="new-password" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next" required placeholder="Crie uma senha">
        </div>

        <div class="form-group">
          <label class="form-label" for="register-password-confirm">Repetir senha</label>
          <input class="input" id="register-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done" required placeholder="Repita a senha">
        </div>
      </div>

      <p class="footer-note">Essa senha ficará vinculada ao seu usuário e será usada nos próximos acessos.</p>

      <label class="register-consent">
        <input type="checkbox" id="register-consent" name="consent" />
        <span>Li e aceito os <a href="./termos.html" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="./privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>.</span>
      </label>

      <div class="actions">
        <button class="btn btn-primary" type="submit">Criar cadastro</button>
      </div>
    </form>
  `;
}
