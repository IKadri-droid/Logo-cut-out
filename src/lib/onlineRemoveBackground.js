const DEFAULT_MODEL = "briaai/RMBG-2.0";
const TOKEN_KEY = "lco_hf_token";
const MODEL_KEY = "lco_hf_model";

export function getHfToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setHfToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getHfModel() {
  return localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL;
}

export function setHfModel(model) {
  if (model && model !== DEFAULT_MODEL) localStorage.setItem(MODEL_KEY, model);
  else localStorage.removeItem(MODEL_KEY);
}

/**
 * Sends `file` to a Hugging Face Inference API model for background
 * removal. Requires a free Hugging Face account and API token, entered by
 * the user in Settings and kept only in this browser's local storage.
 */
export async function removeBackgroundOnline(file) {
  const token = getHfToken();
  if (!token) throw new Error("No Hugging Face API token configured.");
  const model = getHfModel();

  const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Hugging Face API error ${response.status}: ${detail.slice(0, 200)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Unexpected response from "${model}" (${contentType}) — try a different model id in Settings.`);
  }

  return response.blob();
}
