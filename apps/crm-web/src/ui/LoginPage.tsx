import { useState } from "react";

export function LoginPage({
  isSubmitting,
  error,
  onSubmit,
}: {
  isSubmitting: boolean;
  error: string | null;
  onSubmit: (login: string, password: string) => Promise<void>;
}) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-eyebrow">GoPark CRM</div>
        <div className="brand brand--login">
          <div className="brand__logo">
            <img src="/gopark-logo.png" alt="GoPark" />
          </div>
          <div className="brand__copy">
            <h1>Вход в систему</h1>
            <p>Войдите в свой рабочий кабинет по логину или номеру телефона.</p>
          </div>
        </div>
        <div className="login-copy">
          <strong>Добро пожаловать</strong>
          <span>После входа откроются доступные вам разделы.</span>
        </div>
        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(login.trim(), password);
          }}
        >
          <label className="login-field">
            <span>Логин или номер телефона</span>
            <input
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              placeholder="Например, admin@gopark.local или +996555123456"
              autoComplete="username"
            />
          </label>
          <label className="login-field">
            <span>Пароль</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Пароль"
              autoComplete="current-password"
            />
          </label>
          {error ? <div className="login-error">{error}</div> : null}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Вход..." : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
