export function renderAuthScreen(uiState = {}) {
  const mode = uiState.authMode === 'register' ? 'register' : 'login';
  const message = uiState.authMessage;

  return `
    <div class="login-screen">
      <div class="login-logo">⚽</div>
      <div class="login-title">HARMONIA <span style='font-size:12px;opacity:0.7;'>v1.20.8</span></div>
      <div class="login-subtitle">Entre com telefone e senha ou faça seu cadastro para participar do futebol e acompanhar a tabela da carne.</div>

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
    <form id="login-form" class="form-stack" novalidate>
      <div class="form-group">
        <label class="form-label" for="login-phone">Telefone</label>
        <input class="input" id="login-phone" name="phone" inputmode="numeric" autocomplete="tel" placeholder="(48) 99999-9999">
      </div>

      <div class="form-group">
        <label class="form-label" for="login-password">Senha</label>
        <input class="input" id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Digite sua senha">
      </div>

      <div class="helper-text">Seed local: use o <strong>telefone</strong> cadastrado (William 48991520230, André 48999999999, Lucas 48988888888, Marcelo 48977777777, Carlos 48966666666) com senha <strong>123456</strong>.</div>

      <div class="actions">
        <button class="btn btn-primary" type="submit">Entrar</button>
      </div>
    </form>
  `;
}

function renderRegisterForm() {
  return `
    <form id="register-form" class="form-stack" novalidate>
      <div class="form-group">
        <label class="form-label" for="register-name">Nome</label>
        <input class="input" id="register-name" name="name" autocomplete="name" placeholder="Seu nome completo">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="register-phone">Telefone</label>
          <input class="input" id="register-phone" name="phone" inputmode="numeric" autocomplete="tel" placeholder="48999999999">
        </div>

        <div class="form-group">
          <label class="form-label" for="register-birthdate">Nascimento</label>
          <input class="input" id="register-birthdate" name="birthDate" type="date" autocomplete="bday">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="register-role">Perfil</label>
          <select class="select" id="register-role" name="role">
            <option value="jogador">Jogador</option>
            <option value="carne">Apenas carne</option>
          </select>
        </div>

        <div class="form-group" id="position-group">
          <label class="form-label" for="register-position">Posição</label>
          <select class="select" id="register-position" name="position">
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
          <input class="input" id="register-password" name="password" type="password" autocomplete="new-password" placeholder="Crie uma senha">
        </div>

        <div class="form-group">
          <label class="form-label" for="register-password-confirm">Repetir senha</label>
          <input class="input" id="register-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" placeholder="Repita a senha">
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-primary" type="submit">Criar cadastro</button>
      </div>
    </form>
  `;
}
