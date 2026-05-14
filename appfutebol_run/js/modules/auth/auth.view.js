import { APP_VERSION } from "../../core/version.js";

export function renderAuthScreen(uiState = {}) {
  const mode = uiState.authMode === 'register' ? 'register' : 'login';
  const message = uiState.authMessage;

  return `
    <div class="login-screen">
      <div class="login-logo">⚽</div>
      <div class="login-title">HARMONIA <span style='font-size:12px;opacity:0.7;'>${APP_VERSION}</span></div>
      <div class="login-subtitle">Login real com telefone e senha via Supabase Auth.</div>

      <section class="auth-card">
        <div class="auth-tabs">
          <button class="auth-tab ${mode === 'login' ? 'is-active' : ''}" type="button" data-auth-mode="login">Entrar</button>
          <button class="auth-tab ${mode === 'register' ? 'is-active' : ''}" type="button" data-auth-mode="register">Cadastrar</button>
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
          inputmode="tel"
          autocomplete="username"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="next"
          required
          placeholder="(48) 99999-9999"
        >
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

      <div class="footer-note">
        No iPhone/Mac, salve a senha do Harmonia FC no iCloud Keychain para preencher com Face ID ou Touch ID nas próximas entradas.
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
          <input class="input" id="register-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next" required placeholder="(48) 99999-9999">
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

      <div class="footer-note">
        O telefone será usado como login. Ao criar a senha, aceite salvar no iCloud Keychain/gerenciador do navegador para liberar preenchimento por Face ID ou Touch ID.
      </div>

      <div class="actions">
        <button class="btn btn-primary" type="submit">Criar cadastro</button>
      </div>
    </form>
  `;
}
