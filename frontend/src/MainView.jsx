import { useCallback, useEffect, useMemo, useState } from "react";

import { UPLOAD_CHUNK_SIZE, api, getErrorMessage } from "./api";

function MainView({ token, currentUser, onLogout, onSessionExpired }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [activeView, setActiveView] = useState("refined");
  const [appView, setAppView] = useState("materials");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [refineLoading, setRefineLoading] = useState(false);
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

  const isAdmin = Boolean(currentUser?.is_admin);

  const activeText = useMemo(() => {
    if (!selectedMaterial) {
      return "";
    }

    if (selectedMaterial.status === "processing") {
      return "변환을 처리하는 중입니다. 잠시 후 자동으로 결과가 표시됩니다.";
    }

    if (selectedMaterial.status === "failed") {
      return selectedMaterial.error_message || "변환에 실패했습니다.";
    }

    if (activeView === "summary") {
      return selectedMaterial.summary || "아직 생성된 요약이 없습니다.";
    }

    if (activeView === "original") {
      return selectedMaterial.transcript;
    }

    return selectedMaterial.refined_transcript || selectedMaterial.transcript;
  }, [activeView, selectedMaterial]);

  const handleAuthFailure = useCallback((error, fallback) => {
    if (error.response?.status === 401) {
      onSessionExpired("로그인이 만료되었습니다. 다시 로그인해 주세요.");
      return;
    }

    setErrorMessage(getErrorMessage(error, fallback));
  }, [onSessionExpired]);

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
        onSessionExpired("로그인이 만료되었습니다. 다시 로그인해 주세요.");
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

    api
      .get("/materials", authConfig)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setMaterials(response.data);
        setSelectedMaterial(response.data[0] ?? null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error(error);
        handleAuthFailure(error, "초기 데이터를 불러오지 못했습니다.");
      });

    return () => {
      cancelled = true;
    };
  }, [authConfig, handleAuthFailure, token]);

  useEffect(() => {
    if (!token || !materials.some((material) => material.status === "processing")) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      const processingMaterials = materials.filter(
        (material) => material.status === "processing"
      );

      try {
        const responses = await Promise.all(
          processingMaterials.map((material) =>
            api.get(`/materials/${material.id}/status`, authConfig)
          )
        );
        const updatedById = new Map(
          responses.map((response) => [response.data.id, response.data])
        );

        setMaterials((currentMaterials) =>
          currentMaterials.map((material) =>
            updatedById.get(material.id) || material
          )
        );

        setSelectedMaterial((currentMaterial) => {
          if (!currentMaterial) {
            return currentMaterial;
          }

          return updatedById.get(currentMaterial.id) || currentMaterial;
        });
      } catch (error) {
        console.error(error);
      }
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [authConfig, materials, token]);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files?.[0] ?? null);
    setErrorMessage("");
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage("파일을 선택해 주세요.");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");
      setUploadProgress(0);

      const totalChunks = Math.ceil(selectedFile.size / UPLOAD_CHUNK_SIZE);
      const initResponse = await api.post(
        "/materials/uploads/init",
        {
          filename: selectedFile.name,
          total_chunks: totalChunks,
        },
        authConfig
      );
      const uploadId = initResponse.data.upload_id;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const start = chunkIndex * UPLOAD_CHUNK_SIZE;
        const end = Math.min(start + UPLOAD_CHUNK_SIZE, selectedFile.size);
        const chunk = selectedFile.slice(start, end);
        const formData = new FormData();
        formData.append("chunk_index", String(chunkIndex));
        formData.append("file", chunk, selectedFile.name);

        await api.post(`/materials/uploads/${uploadId}/chunks`, formData, authConfig);
        setUploadProgress(Math.round(((chunkIndex + 1) / totalChunks) * 100));
      }

      const response = await api.post(
        `/materials/uploads/${uploadId}/complete`,
        null,
        authConfig
      );
      setMaterials((currentMaterials) => [response.data, ...currentMaterials]);
      setSelectedMaterial(response.data);
      setActiveView("original");
      setSelectedFile(null);
    } catch (error) {
      console.error(error);
      handleAuthFailure(error, "STT 변환 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setUploadProgress(0);
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

  const handleCreateRefined = async () => {
    if (!selectedMaterial) {
      return;
    }

    if (selectedMaterial.status !== "done") {
      setErrorMessage("변환이 끝난 뒤 정리본을 만들 수 있습니다.");
      return;
    }

    try {
      setRefineLoading(true);
      setErrorMessage("");
      const response = await api.post(
        `/materials/${selectedMaterial.id}/refine`,
        null,
        authConfig
      );
      const updatedMaterial = {
        ...selectedMaterial,
        refined_transcript: response.data.refined_transcript,
      };

      setSelectedMaterial(updatedMaterial);
      setMaterials((currentMaterials) =>
        currentMaterials.map((material) =>
          material.id === updatedMaterial.id ? updatedMaterial : material
        )
      );
      setActiveView("refined");
    } catch (error) {
      console.error(error);
      handleAuthFailure(error, "정리본을 생성하지 못했습니다.");
    } finally {
      setRefineLoading(false);
    }
  };

  const handleCreateSummary = async () => {
    if (!selectedMaterial) {
      return;
    }

    if (selectedMaterial.status !== "done") {
      setErrorMessage("변환이 끝난 뒤 요약을 만들 수 있습니다.");
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

  return (
    <div className="container">
      <main className="card">
        <header className="app-header">
          <div>
            <h1>NoTo</h1>
            <p className="subtitle">
              {currentUser?.nickname}님의 강의 음성을 텍스트로 바꾸고 정리합니다.
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
            <button className="ghost-button" onClick={onLogout}>
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
                          {material.user_email} · {material.status} ·{" "}
                          {formatDate(material.created_at)}
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
                <p>{selectedFile ? selectedFile.name : "클릭하여 파일을 선택해 주세요"}</p>
                <span className="upload-support">MP3, WAV, M4A</span>
              </label>
            </div>

            {selectedFile && (
              <div className="selected-file">
                <span>{selectedFile.name}</span>
                <span>
                  {loading
                    ? `${uploadProgress}%`
                    : `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`}
                </span>
              </div>
            )}

            <button className="primary-button" onClick={handleUpload} disabled={loading}>
              {loading ? `업로드 ${uploadProgress}%` : "변환"}
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
                      <small>
                        {material.status === "processing"
                          ? "처리 중"
                          : material.status === "failed"
                            ? "실패"
                            : formatDate(material.created_at)}
                      </small>
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
                    onClick={handleCreateRefined}
                    disabled={
                      refineLoading ||
                      selectedMaterial.status !== "done" ||
                      Boolean(selectedMaterial.refined_transcript)
                    }
                  >
                    {refineLoading ? "정리 중..." : "정리본 생성"}
                  </button>
                )}
                {selectedMaterial && (
                  <button
                    className="secondary-button"
                    onClick={handleCreateSummary}
                    disabled={summaryLoading || selectedMaterial.status !== "done"}
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
                  ? "파일을 업로드하는 중입니다..."
                  : activeText || "자료를 업로드하거나 목록에서 선택해 주세요."}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default MainView;
