/**
 * Range-aware media responses. Video elements need byte ranges to seek, and
 * the behaviour analyser seeks constantly — without this every seek would
 * restart the download.
 */
export async function mediaResponse(req: Request, path: string, mime: string, filename: string): Promise<Response> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return new Response(JSON.stringify({ error: "The stored media file is missing from disk." }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  const size = file.size;
  const headers: Record<string, string> = {
    "content-type": mime || "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-disposition": `inline; filename="${filename.replace(/["\\\r\n]/g, "_")}"`,
  };

  const range = req.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      let end = match[2] ? Number(match[2]) : size - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || start > end) {
        return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
      }
      end = Math.min(end, size - 1);
      const length = end - start + 1;
      return new Response(file.slice(start, end + 1), {
        status: 206,
        headers: {
          ...headers,
          "content-range": `bytes ${start}-${end}/${size}`,
          "content-length": String(length),
        },
      });
    }
  }

  return new Response(file, { status: 200, headers: { ...headers, "content-length": String(size) } });
}
