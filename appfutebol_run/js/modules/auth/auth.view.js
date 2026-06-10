import { APP_VERSION } from "../../core/version.js";

export function renderAuthScreen(uiState = {}) {
  const mode = 'login';
  const message = uiState.authMessage;

  return `
    <div class="login-screen">
      <img class="login-crest" src="./assets/harmonia-crest.jpeg" alt="Escudo Harmonia">
      <div class="login-title">HARMONIA <span style='font-size:12px;opacity:0.7;'>${String(APP_VERSION || '').replace(/^v/, '').split('-')[0]}</span></div>
      <div class="login-subtitle">Login com telefone e senha.</div>

      <section class="auth-card">
        <div class="auth-tabs auth-tabs-single">
          <button class="auth-tab is-active" type="button" data-auth-mode="login">Entrar</button>
        </div>

        ${message ? `<div class="message-box ${message.type === 'success' ? 'is-success' : 'is-error'}">${message.text}</div>` : ''}

        ${mode === 'login' ? renderLoginForm() : renderRegisterForm()}
      </section>
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
          autocomplete="username"
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

      <div class="actions">
        <button class="btn btn-primary" type="submit">Criar cadastro</button>
      </div>
    </form>
  `;
}
