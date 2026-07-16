import { useEffect, useState } from "react";

/** Extensions we can show inline. */
export const TEXT_EXTS = new Set(["txt", "bat", "ps1", "cmd", "md", "ini", "cfg", "conf", "log", "json", "xml", "yml", "yaml", "reg", "csv"]);
export const isPreviewableFile = (ext: string) => ext === "pdf" || TEXT_EXTS.has(ext);

/** Renders a PDF or text file inside the detail sheet.
 *
 *  The Worker serves every object with `content-disposition: attachment`, so pointing an
 *  <iframe> straight at the gated URL makes the browser DOWNLOAD the file instead of showing
 *  it. So we fetch the bytes ourselves and render from a blob (PDF) or as text — which also
 *  keeps the gate's key handling unchanged. */
export function SpecialsFilePreview({ url, ext, name }: { url: string; ext: string; name: string }) {
  const isPdf = ext === "pdf";
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setBlobUrl(null);
    setText(null);
    setError(null);

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`couldn't load (${res.status})`);
        if (isPdf) {
          const buf = await res.arrayBuffer();
          created = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
          if (!cancelled) setBlobUrl(created);
        } else {
          const t = await res.text();
          if (!cancelled) setText(t);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url, isPdf]);

  if (error) return <p className="specials-detail__file-msg">{error}</p>;
  if (isPdf) {
    return blobUrl ? (
      <iframe className="specials-detail__pdf" src={blobUrl} title={name} />
    ) : (
      <p className="specials-detail__file-msg">Loading preview…</p>
    );
  }
  return text !== null ? (
    <pre className="specials-detail__text">{text}</pre>
  ) : (
    <p className="specials-detail__file-msg">Loading preview…</p>
  );
}
