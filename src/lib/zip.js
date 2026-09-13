import { zipSync } from "fflate";

function uniqueName(name, used) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  let i = 2;
  let candidate = `${base} (${i})${ext}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${base} (${i})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

export async function zipBlobs(entries) {
  const used = new Set();
  const files = {};
  for (const { name, blob } of entries) {
    files[uniqueName(name, used)] = new Uint8Array(await blob.arrayBuffer());
  }
  return new Blob([zipSync(files, { level: 0 })], { type: "application/zip" });
}
