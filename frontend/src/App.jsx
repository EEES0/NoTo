import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [activeView, setActiveView] = useState("refined");
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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

  useEffect(() => {
    let cancelled = false;

    axios
      .get(`${API_BASE_URL}/materials`)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setMaterials(response.data);
        if (response.data.length > 0) {
          setSelectedMaterial(response.data[0]);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error(error);
        setErrorMessage("업로드 목록을 불러오지 못했습니다.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchMaterials = async () => {
    try {
      setListLoading(true);
      const response = await axios.get(`${API_BASE_URL}/materials`);
      setMaterials(response.data);

      if (!selectedMaterial && response.data.length > 0) {
        setSelectedMaterial(response.data[0]);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("업로드 목록을 불러오지 못했습니다.");
    } finally {
      setListLoading(false);
    }
  };

  const fetchMaterial = async (materialId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/materials/${materialId}`);
      setSelectedMaterial(response.data);
      setActiveView(response.data.refined_transcript ? "refined" : "original");
    } catch (error) {
      console.error(error);
      setErrorMessage("자료 상세 정보를 불러오지 못했습니다.");
    }
  };

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files?.[0] ?? null);
    setErrorMessage("");
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage("파일을 선택하세요.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      setLoading(true);
      setErrorMessage("");
      const response = await axios.post(`${API_BASE_URL}/materials`, formData);
      await fetchMaterials();
      await fetchMaterial(response.data.id);
      setSelectedFile(null);
    } catch (error) {
      console.error(error);
      setErrorMessage("STT 변환 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (materialId) => {
    try {
      setErrorMessage("");
      await axios.delete(`${API_BASE_URL}/materials/${materialId}`);

      const nextMaterials = materials.filter((material) => material.id !== materialId);
      setMaterials(nextMaterials);

      if (selectedMaterial?.id === materialId) {
        setSelectedMaterial(nextMaterials[0] ?? null);
        setActiveView(nextMaterials[0]?.refined_transcript ? "refined" : "original");
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("자료를 삭제하지 못했습니다.");
    }
  };

  const handleCreateSummary = async () => {
    if (!selectedMaterial) {
      return;
    }

    try {
      setSummaryLoading(true);
      setErrorMessage("");
      const response = await axios.post(
        `${API_BASE_URL}/materials/${selectedMaterial.id}/summary`
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
      setErrorMessage("요약을 생성하지 못했습니다.");
    } finally {
      setSummaryLoading(false);
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
      <div className="card">
        <header className="app-header">
          <div>
            <h1>NoTo</h1>
            <p className="subtitle">강의 음성을 텍스트로 바꾸고 정리합니다.</p>
          </div>
          <button className="icon-button" onClick={fetchMaterials} disabled={listLoading}>
            새로고침
          </button>
        </header>

        <div className="upload-box">
          <label className="upload-area">
            <input
              key={selectedFile?.name ?? "empty"}
              type="file"
              accept=".mp3,.wav,.m4a"
              onChange={handleFileChange}
            />
            <div className="upload-icon">+</div>
            <p>{selectedFile ? selectedFile.name : "클릭하여 파일을 선택하세요"}</p>
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
              : activeText || "자료를 업로드하거나 목록에서 선택하세요."}
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
