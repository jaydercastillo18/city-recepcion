import { attendanceSession } from "@/features/attendance/server";
export async function GET(request: Request) {
  try {
    const { client } = await attendanceSession();
    const id = new URL(request.url).searchParams.get("record");
    if (!id || !/^[a-f\d-]{36}$/i.test(id))
      return Response.json({ error: "Registro inválido." }, { status: 400 });
    // RLS authorizes the record before the storage path is resolved.
    const { data: record } = await client
      .from("attendance_records")
      .select("photo_storage_path")
      .eq("id", id)
      .single();
    if (!record?.photo_storage_path)
      return Response.json({ error: "Foto no encontrada." }, { status: 404 });
    const { data, error } = await client.storage
      .from("attendance-evidence")
      .createSignedUrl(record.photo_storage_path, 60);
    if (error || !data)
      return Response.json({ error: "Foto no disponible." }, { status: 404 });
    return Response.json(
      { url: data.signedUrl },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  } catch {
    return Response.json({ error: "No autorizado." }, { status: 403 });
  }
}
