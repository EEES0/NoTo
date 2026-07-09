import { useState } from "react";

import "./App.css";
import AuthView from "./AuthView";
import MainView from "./MainView";
import {
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
  api,
  getErrorMessage,
  getStoredUser,
} from "./api";

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [currentUser, setCurrentUser] = useState(getStoredUser);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    email: "",
    nickname: "",
    password: "",
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const isLoggedIn = Boolean(token);

  const saveSession = (nextToken, user) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    setToken(nextToken);
    setCurrentUser(user);
  };

  const clearSession = (message = "") => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setToken(null);
    setCurrentUser(null);
    setAuthError(message);
  };

  const handleAuthModeChange = (nextMode) => {
    setAuthMode(nextMode);
    setAuthError("");
  };

  const handleAuthInputChange = (event) => {
    const { name, value } = event.target;
    setAuthForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
    setAuthError("");
  };

  const handleLogin = async (email, password) => {
    const response = await api.post("/auth/login", {
      email,
      password,
    });
    saveSession(response.data.access_token, response.data.user);
    setAuthError("");
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();

    const email = authForm.email.trim();
    const nickname = authForm.nickname.trim();
    const password = authForm.password;

    if (!email || !password || (authMode === "signup" && !nickname)) {
      setAuthError("필수 정보를 입력해 주세요.");
      return;
    }

    try {
      setAuthLoading(true);
      setAuthError("");

      if (authMode === "signup") {
        await api.post("/auth/signup", {
          email,
          nickname,
          password,
        });
      }

      await handleLogin(email, password);
    } catch (error) {
      console.error(error);
      setAuthError(
        getErrorMessage(
          error,
          authMode === "signup"
            ? "회원가입에 실패했습니다."
            : "로그인에 실패했습니다."
        )
      );
    } finally {
      setAuthLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <AuthView
        authMode={authMode}
        authForm={authForm}
        authLoading={authLoading}
        authError={authError}
        onAuthModeChange={handleAuthModeChange}
        onAuthInputChange={handleAuthInputChange}
        onAuthSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <MainView
      token={token}
      currentUser={currentUser}
      onLogout={() => clearSession()}
      onSessionExpired={clearSession}
    />
  );
}

export default App;
