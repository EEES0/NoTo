import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const TOKEN_STORAGE_KEY = "noto_access_token";
const USER_STORAGE_KEY = "noto_user";

const api = axios.create({
  baseURL: API_BASE_URL,
});

function getErrorMessage(error, fallback) {
  return error.response?.data?.detail || fallback;
}

function getStoredUser() {
  try {
    const value = localStorage.getItem(USER_STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

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
  const [selectedFile, setSelectedFile] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [activeView, setActiveView] = useState("refined");
  const [appView, setAppView] = useState("materials");
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminMaterials, setAdminMaterials] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");

  const authConfig = useMemo(
    () => ({
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),
    [token]
  );

  const isLoggedIn = Boolean(token);
  const isAdmin = Boolean(currentUser?.is_admin);

  const activeText = useMemo(() => {
    if (!selectedMaterial) {
      return "";
    }

    if (activeView === "summary") {
      return selectedMaterial.summary || "아직 생성된 요약이 없습니다.";
    }

    if (activeView === "original") {
      return selectedMaterial.transcript;
    }

    return selectedMaterial.refined_transcript || selectedMaterial.transcript;
  }, [activeView, selectedMaterial]);

  const saveSession = (nextToken, user) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    setToken(nextToken);
    setCurrentUser(user);
  };

  const clearSession = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setToken(null);
    setCurrentUser(null);
    setMaterials([]);
    setSelectedMaterial(null);
    setSelectedFile(null);
    setAdminUsers([]);
    setAdminMaterials([]);
    setAppView("materials");
    setErrorMessage("");
    setAdminError("");
  };

  const handleAuthFailure = (error, fallback) => {
    if (error.response?.status === 401) {
      clearSession();
      setAuthError("로그인이 만료되었습니다. 다시 로그인해 주세요.");
      return;
    }

    setErrorMessage(getErrorMessage(error, fallback));
  };

  const fetchMaterials = async () => {
    if (!token) {
      return;
    }

    try {
      setListLoading(true);
      const response = await api.get("/materials", authConfig);
      setMaterials(response.data);

      if (response.data.length === 0) {
        setSelectedMaterial(null);
        return;
      }

      if (!selectedMaterial) {
        setSelectedMaterial(response.data[0]);
      }
    } catch (error) {
      console.error(error);
      handleAuthFailure(error, "업로드 목록을 불러오지 못했습니다.");
    } finally {
      setListLoading(false);
    }
  };

  const fetchMaterial = async (materialId) => {
    try {
      const response = await api.get(`/materials/${materialId}`, authConfig);
      setSelectedMaterial(response.data);
      setActiveView(response.data.refined_transcript ? "refined" : "original");
    } catch (error) {
      console.error(error);
      handleAuthFailure(error, "자료 상세 정보를 불러오지 못했습니다.");
    }
  };

  const fetchAdminData = async () => {
    if (!token || !isAdmin) {
      return;
    }

    try {
      setAdminLoading(true);
      setAdminError("");
      const [usersResponse, materialsResponse] = await Promise.all([
        api.get("/admin/users", authConfig),
        api.get("/admin/materials", authConfig),
      ]);
      setAdminUsers(usersResponse.data);
      setAdminMaterials(materialsResponse.data);
    } catch (error) {
      console.error(error);
      if (error.response?.status === 401) {
        clearSession();
        setAuthError("로그인이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }

      setAdminError(getErrorMessage(error, "관리자 데이터를 불러오지 못했습니다."));
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    Promise.all([
      api.get("/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      api.get("/materials", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
    ])
      .then(([meResponse, materialsResponse]) => {
        if (cancelled) {
          return;
        }

        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(meResponse.data));
        setCurrentUser(meResponse.data);
        setMaterials(materialsResponse.data);
        setSelectedMaterial(materialsResponse.data[0] ?? null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error(error);
        if (error.response?.status === 401) {
          clearSession();
          setAuthError("로그인이 만료되었습니다. 다시 로그인해 주세요.");
          return;
        }

        setErrorMessage(getErrorMessage(error, "초기 데이터를 불러오지 못했습니다."));
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

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

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files?.[0] ?? null);
    setErrorMessage("");
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage("파일을 선택해 주세요.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      setLoading(true);
      setErrorMessage("");
      const response = await api.post("/materials", formData, authConfig);
      await fetchMaterials();
      await fetchMaterial(response.data.id);
      setSelectedFile(null);
    } catch (error) {
      console.error(error);
      handleAuthFailure(error, "STT 변환 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (materialId) => {
    try {
      setErrorMessage("");
      await api.delete(`/materials/${materialId}`, authConfig);

      const nextMaterials = materials.filter((material) => material.id !== materialId);
      setMaterials(nextMaterials);

      if (selectedMaterial?.id === materialId) {
        setSelectedMaterial(nextMaterials[0] ?? null);
        setActiveView(nextMaterials[0]?.refined_transcript ? "refined" : "original");
      }
    } catch (error) {
      console.error(error);
      handleAuthFailure(error, "자료를 삭제하지 못했습니다.");
    }
  };

  const handleCreateSummary = async () => {
    if (!selectedMaterial) {
      return;
    }

    try {
      setSummaryLoading(true);
      setErrorMessage("");
      const response = await api.post(
        `/materials/${selectedMaterial.id}/summary`,
        null,
        authConfig
      );
      const updatedMaterial = {
        ...selectedMaterial,
        summary: response.data.summary,
      };

      setSelectedMaterial(updatedMaterial);
      setMaterials((currentMaterials) =>
        currentMaterials.map((material) =>
          material.id === updatedMaterial.id ? updatedMaterial : material
        )
      );
      setActiveView("summary");
    } catch (error) {
      console.error(error);
      handleAuthFailure(error, "요약을 생성하지 못했습니다.");
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleToggleAdmin = async (user) => {
    try {
      setAdminError("");
      await api.patch(
        `/admin/users/${user.id}/admin`,
        { is_admin: !user.is_admin },
        authConfig
      );
      await fetchAdminData();
    } catch (error) {
      console.error(error);
      setAdminError(getErrorMessage(error, "관리자 권한을 변경하지 못했습니다."));
    }
  };

  const handleAdminDeleteUser = async (userId) => {
    if (!window.confirm("이 사용자와 사용자의 자료를 모두 삭제할까요?")) {
      return;
    }

    try {
      setAdminError("");
      await api.delete(`/admin/users/${userId}`, authConfig);
      await fetchAdminData();
    } catch (error) {
      console.error(error);
      setAdminError(getErrorMessage(error, "사용자를 삭제하지 못했습니다."));
    }
  };

  const handleAdminDeleteMaterial = async (materialId) => {
    if (!window.confirm("이 자료를 삭제할까요?")) {
      return;
    }

    try {
      setAdminError("");
      await api.delete(`/admin/materials/${materialId}`, authConfig);
      await fetchAdminData();
    } catch (error) {
      console.error(error);
      setAdminError(getErrorMessage(error, "자료를 삭제하지 못했습니다."));
    }
  };

  const formatDate = (value) => {
    if (!value) {
      return "";
    }

    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  };

  if (!isLoggedIn) {
    return (
      <div className="container auth-container">
        <main className="auth-panel">
          <div className="auth-copy">
            <h1>NoTo</h1>
            <p>강의 음성을 텍스트로 바꾸고 정리하는 개인 노트 공간입니다.</p>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <div className="auth-tabs" aria-label="인증 모드">
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => {
                  setAuthMode("login");
                  setAuthError("");
                }}
              >
                로그인
              </button>
              <button
                type="button"
                className={authMode === "signup" ? "active" : ""}
                onClick={() => {
                  setAuthMode("signup");
                  setAuthError("");
                }}
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
                onChange={handleAuthInputChange}
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
                  onChange={handleAuthInputChange}
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
                onChange={handleAuthInputChange}
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

  return (
    <div className="container">
      <main className="card">
        <header className="app-header">
          <div>
            <h1>NoTo</h1>
            <p className="subtitle">
              {currentUser?.nickname}님, 강의 음성을 텍스트로 바꾸고 정리합니다.
            </p>
          </div>
          <div className="header-actions">
            {isAdmin && (
              <button
                className="ghost-button"
                onClick={() => {
                  const nextView = appView === "admin" ? "materials" : "admin";
                  setAppView(nextView);
                  if (nextView === "admin") {
                    fetchAdminData();
                  }
                }}
              >
                {appView === "admin" ? "자료 화면" : "관리자"}
              </button>
            )}
            <button
              className="icon-button"
              onClick={appView === "admin" ? fetchAdminData : fetchMaterials}
              disabled={appView === "admin" ? adminLoading : listLoading}
            >
              새로고침
            </button>
            <button className="ghost-button" onClick={clearSession}>
              로그아웃
            </button>
          </div>
        </header>

        {appView === "admin" && isAdmin ? (
          <section className="admin-panel">
            <div className="section-header">
              <h2>관리자</h2>
              <span>
                사용자 {adminUsers.length}명 · 자료 {adminMaterials.length}개
              </span>
            </div>

            {adminError && <p className="error-message">{adminError}</p>}

            <section className="admin-section">
              <h3>사용자</h3>
              <div className="admin-list">
                {adminUsers.map((user) => (
                  <div className="admin-row" key={user.id}>
                    <div>
                      <strong>{user.nickname}</strong>
                      <span>{user.email}</span>
                    </div>
                    <div className="admin-actions">
                      <button
                        className={user.is_admin ? "status-button active" : "status-button"}
                        onClick={() => handleToggleAdmin(user)}
                      >
                        {user.is_admin ? "관리자" : "일반"}
                      </button>
                      <button
                        className="delete-button"
                        onClick={() => handleAdminDeleteUser(user.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-section">
              <h3>전체 자료</h3>
              <div className="admin-list">
                {adminMaterials.length === 0 ? (
                  <p className="empty">등록된 자료가 없습니다.</p>
                ) : (
                  adminMaterials.map((material) => (
                    <div className="admin-row" key={material.id}>
                      <div>
                        <strong>{material.filename}</strong>
                        <span>
                          {material.user_email} · {formatDate(material.created_at)}
                        </span>
                      </div>
                      <button
                        className="delete-button"
                        onClick={() => handleAdminDeleteMaterial(material.id)}
                      >
                        삭제
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </section>
        ) : (
          <>
            <div className="upload-box">
              <label className="upload-area">
                <input
                  key={selectedFile?.name ?? "empty"}
                  type="file"
                  accept=".mp3,.wav,.m4a"
                  onChange={handleFileChange}
                />
                <div className="upload-icon">+</div>
                <p>{selectedFile ? selectedFile.name : "클릭하여 파일을 선택해 주세요."}</p>
                <span className="upload-support">MP3, WAV, M4A</span>
              </label>
            </div>

            {selectedFile && (
              <div className="selected-file">
                <span>{selectedFile.name}</span>
                <span>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            )}

            <button className="primary-button" onClick={handleUpload} disabled={loading}>
              {loading ? "변환 중..." : "변환"}
            </button>

            {errorMessage && <p className="error-message">{errorMessage}</p>}

            <section className="file-list">
              <div className="section-header">
                <h3>업로드 목록</h3>
                <span>{materials.length}개</span>
              </div>

              {materials.length === 0 ? (
                <p className="empty">
                  {listLoading ? "목록을 불러오는 중입니다." : "업로드된 파일이 없습니다."}
                </p>
              ) : (
                materials.map((material) => (
                  <div
                    className={`file-item ${
                      selectedMaterial?.id === material.id ? "active" : ""
                    }`}
                    key={material.id}
                  >
                    <button
                      className="file-select"
                      onClick={() => fetchMaterial(material.id)}
                    >
                      <span>{material.filename || material.original_filename}</span>
                      <small>{formatDate(material.created_at)}</small>
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => handleDelete(material.id)}
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
            </section>

            <section className="result">
              <div className="section-header">
                <h2>변환 결과</h2>
                {selectedMaterial && (
                  <button
                    className="secondary-button"
                    onClick={handleCreateSummary}
                    disabled={summaryLoading}
                  >
                    {summaryLoading ? "요약 중..." : "요약 생성"}
                  </button>
                )}
              </div>

              {selectedMaterial && (
                <div className="tabs">
                  <button
                    className={activeView === "refined" ? "active" : ""}
                    onClick={() => setActiveView("refined")}
                  >
                    정리본
                  </button>
                  <button
                    className={activeView === "original" ? "active" : ""}
                    onClick={() => setActiveView("original")}
                  >
                    원문
                  </button>
                  <button
                    className={activeView === "summary" ? "active" : ""}
                    onClick={() => setActiveView("summary")}
                  >
                    요약
                  </button>
                </div>
              )}

              <div className="result-box">
                {loading
                  ? "AI가 음성을 분석하는 중입니다..."
                  : activeText || "자료를 업로드하거나 목록에서 선택해 주세요."}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
