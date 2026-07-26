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
      <div class="login-subtitle" style="margin-top:6px;color:var(--hfc-text);font-weight:600;letter-spacing:.04em;">Convocados</div>
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
        <label class="form-label">Seu clube</label>
        <div class="auth-tabs" style="margin-bottom:8px;">
          <button class="auth-tab is-active" type="button" data-club-mode="join">Entrar com código</button>
          <button class="auth-tab" type="button" data-club-mode="create">Criar um clube</button>
        </div>
        <input type="hidden" id="register-club-mode" name="clubMode" value="join">
        <input class="input" id="register-club-name" name="clubName" type="text" autocapitalize="words" enterkeyhint="next" placeholder="Nome do clube (ex.: Pelada da Firma)" style="display:none;">
        <input class="input" id="register-invite-code" name="inviteCode" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="next" placeholder="Código do clube (ex.: ABC234)" style="text-transform:uppercase;">
        <small class="field-hint" id="register-club-hint">Peça o código ao administrador. Você entra como pendente até ele aprovar.</small>
      </div>

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

      <div id="register-minor-block" class="register-minor-block" style="display:none;">
        <p class="footer-note"><strong>Menor de 18 anos.</strong> O cadastro precisa ser autorizado por um responsável legal (LGPD art. 14 / ECA).</p>
        <div class="form-group">
          <label class="form-label" for="register-guardian-name">Nome do responsável legal</label>
          <input class="input" id="register-guardian-name" name="guardianName" type="text" autocomplete="name" autocapitalize="words" placeholder="Nome completo do responsável">
        </div>
        <div class="form-group">
          <label class="form-label" for="register-guardian-phone">Telefone do responsável</label>
          <input class="input" id="register-guardian-phone" name="guardianPhone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="Com DDD, só números">
        </div>
        <label class="register-consent">
          <input type="checkbox" id="register-guardian-consent" name="guardianConsent" />
          <span>Sou o responsável legal por este jogador menor de idade e autorizo o cadastro e o tratamento dos dados dele.</span>
        </label>
      </div>

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
