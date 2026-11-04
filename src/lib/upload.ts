/**
 * Sends one file to a channel's pending uploads, reporting progress from 0 to 1. Uses XHR because fetch can't
 * report upload progress. Resolves with the id to send with the message.
 */
export function uploadFile(
  channelId: string,
  file: { blob: Blob; name: string; fields?: Record<string, string | number | undefined> },
  onProgress: (done: number) => void,
  signal?: AbortSignal,
) {
  const form = new FormData();
  // What the server reads beside the file: picture size and stand-in, or a voice note's length and waveform.
  for (const [key, value] of Object.entries(file.fields ?? {})) if (value !== undefined && value !== "") form.append(key, String(value));
  form.append("file", file.blob, file.name);

  return new Promise<{ id: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/channels/${channelId}/files`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const data = (xhr.response ?? {}) as { id?: string; error?: string };
      if (xhr.status === 401) window.location.replace("/login");
      if (xhr.status >= 200 && xhr.status < 300 && data.id) resolve({ id: data.id });
      else reject(new Error(data.error ?? "بارگذاری فایل ممکن نشد"));
    };
    xhr.onerror = () => reject(new Error("اتصال قطع شد. دوباره تلاش کنید"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}
