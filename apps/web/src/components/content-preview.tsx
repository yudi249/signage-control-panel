import { useState } from "react";
import type { Content } from "@signage/shared";

export const contentTypeLabels = { text: "Teks", image: "Gambar", video: "Video", url: "Tautan web" };

export function ContentPreview({ content, detail = false }: { content: Content; detail?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="preview-fallback"><span aria-hidden="true">▧</span><p>Media tidak dapat dimuat</p></div>;
  if (content.tipe === "image") return <img src={content.payload} alt={content.judul} loading="lazy" onError={() => setFailed(true)} />;
  if (content.tipe === "video") return <><video src={content.payload} controls={detail} muted={!detail} playsInline preload="metadata" onError={() => setFailed(true)} />{!detail && <span className="video-preview-mark" aria-hidden="true">▶</span>}</>;
  if (content.tipe === "url") {
    let domain = content.payload;
    try { domain = new URL(content.payload).host; } catch { /* Tampilkan URL asli. */ }
    return <div className="link-preview"><span className="link-preview-icon" aria-hidden="true">↗</span><strong>{domain}</strong><p>{content.payload}</p></div>;
  }
  return <div className={`text-preview ${detail ? "text-preview-full" : ""}`}><span aria-hidden="true">T</span><p>{content.payload}</p></div>;
}
