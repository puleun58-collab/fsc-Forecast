import { buildCsv, buildExportDataset } from "@/lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildFilename(snapshotId: string): string {
  return `national-average-diesel-snapshot-${snapshotId}.csv`;
}

export async function GET(): Promise<Response> {
  const result = await buildExportDataset();

  if (result.status === "missing_snapshot" || !result.dataset) {
    return new Response("No successful national-average snapshot is available for export.", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  const body = buildCsv(result.dataset);

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${buildFilename(result.dataset.snapshot.id)}"`,
      "cache-control": "no-store",
    },
  });
}
