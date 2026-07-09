function AuthView({
  authMode,
  authForm,
  authLoading,
  authError,
  onAuthModeChange,
  onAuthInputChange,
  onAuthSubmit,
}) {
  return (
    <div className="container auth-container">
      <main className="auth-panel">
        <div className="auth-copy">
          <h1>NoTo</h1>
          <p>강의 음성을 텍스트로 바꾸고 정리하는 개인 노트 공간입니다.</p>
        </div>

        <form className="auth-form" onSubmit={onAuthSubmit}>
          <div className="auth-tabs" aria-label="인증 모드">
            <button
              type="button"
              className={authMode === "login" ? "active" : ""}
              onClick={() => onAuthModeChange("login")}
            >
              로그인
            </button>
            <button
              type="button"
              className={authMode === "signup" ? "active" : ""}
              onClick={() => onAuthModeChange("signup")}
            >
              회원가입
            </button>
          </div>

          <label>
            이메일
            <input
              name="email"
              type="email"
              value={authForm.email}
              onChange={onAuthInputChange}
              autoComplete="email"
              required
            />
          </label>

          {authMode === "signup" && (
            <label>
              닉네임
              <input
                name="nickname"
                type="text"
                value={authForm.nickname}
                onChange={onAuthInputChange}
                autoComplete="nickname"
                required
              />
            </label>
          )}

          <label>
            비밀번호
            <input
              name="password"
              type="password"
              value={authForm.password}
              onChange={onAuthInputChange}
              autoComplete={authMode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>

          {authError && <p className="error-message">{authError}</p>}

          <button className="primary-button" type="submit" disabled={authLoading}>
            {authLoading
              ? "처리 중..."
              : authMode === "signup"
                ? "가입하고 시작"
                : "로그인"}
          </button>
        </form>
      </main>
    </div>
  );
}

export default AuthView;
