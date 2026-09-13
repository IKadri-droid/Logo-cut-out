let counter = 0;

export function createBatchItems(files) {
  return files.map((file) => ({
    id: `${Date.now()}-${counter++}`,
    file,
    name: file.name,
    sourceUrl: URL.createObjectURL(file),
    status: "queued",
    engine: null,
    fallbackReason: null,
    resultUrl: null,
    resultBlob: null,
    error: null,
  }));
}

export async function runBatch(items, cutOutFn, onUpdate) {
  for (const item of items) {
    onUpdate(item.id, { status: "processing" });
    try {
      const { blob, engine, fallbackReason } = await cutOutFn(item.file);
      onUpdate(item.id, {
        status: "done",
        engine,
        fallbackReason: fallbackReason || null,
        resultBlob: blob,
        resultUrl: URL.createObjectURL(blob),
      });
    } catch (err) {
      onUpdate(item.id, { status: "error", error: err?.message || "Background removal failed." });
    }
  }
}
