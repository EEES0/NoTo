import { useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function App() {
  const [files, setFiles] = useState([]);
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files);
    setFiles(selectedFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      alert("파일을 선택하세요.");
      return;
    }

    const formData = new FormData();
    formData.append("file", files[0]);

    try {
      setLoading(true);
      setTranscript("");
      const response = await axios.post(
        `${API_BASE_URL}/materials`,
        formData
      );
      setTranscript(response.data.transcript);
    } catch (error) {
      console.error(error);
      alert("STT 변환 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h1>NoTo</h1>
        <p className="subtitle"></p>

        <div className="upload-box">
          <label className="upload-area">
            <input
              type="file"
              accept=".mp3,.wav,.m4a"
              onChange={handleFileChange}
            />
            <div className="upload-icon"></div>
            <p>클릭하여 파일을 선택하세요</p>
            <span className="upload-support">MP3, WAV, M4A</span>
          </label>
        </div>

        <div className="file-list">
          <h3>업로드 목록</h3>
          {files.length === 0 ? (
            <p className="empty">업로드된 파일이 없습니다.</p>
          ) : (
            files.map((file, index) => (
              <div className="file-item" key={index}>
                <span>🎵 {file.name}</span>
                <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            ))
          )}
        </div>

        <button onClick={handleUpload} disabled={loading}>
          {loading ? "변환 중..." : "변환"}
        </button>

        <div className="result">
          <h2>변환 결과</h2>
          <div className="result-box">
            {loading
              ? "AI가 음성을 분석하는 중입니다..."
              : transcript || "변환 결과가 여기에 표시됩니다."}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
