let counter = 0;

export function createBatchItems(files) {
  return files.map((file) => ({
    id: `${Date.now()}-${counter++}`,
    file,
    name: file.name,
    status: "queued",
    engine: null,
    resultBlob: null,
    error: null,
  }));
}

export async function runBatch(items, cutOutFn, onUpdate) {
  for (const item of items) {
    onUpdate(item.id, { status: "processing" });
    try {
      const { blob, engine } = await cutOutFn(item.file);
      onUpdate(item.id, { status: "done", engine, resultBlob: blob });
    } catch (err) {
      onUpdate(item.id, { status: "error", error: err?.message || "Background removal failed." });
    }
  }
}
