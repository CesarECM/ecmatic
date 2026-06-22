import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { insertarImagenServicio, eliminarImagenServicio } from "@/services/imagen-servicio";
import type { CanalImagen } from "@/services/imagen-servicio";

// POST — sube imagen a Supabase Storage e inserta registro en imagenes_servicio
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: servicioId } = await params;
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const canal = form.get("canal") as CanalImagen | null;
    const etiqueta = (form.get("etiqueta") as string | null)?.trim() || undefined;

    if (!file || !canal) {
      return NextResponse.json({ error: "file y canal son requeridos" }, { status: 400 });
    }

    const CANALES_VALIDOS: CanalImagen[] = ["whatsapp", "email", "landing"];
    if (!CANALES_VALIDOS.includes(canal)) {
      return NextResponse.json({ error: "canal inválido" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const storagePath = `${servicioId}/${canal}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("imagenes-servicios")
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: `Upload falló: ${uploadError.message}` }, { status: 500 });
    }

    const imagen = await insertarImagenServicio({ servicioId, storagePath, canal, etiqueta });
    return NextResponse.json({ imagen });
  } catch (err) {
    console.error("[imagenes POST]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// DELETE ?imagenId=xxx&storagePath=xxx
export async function DELETE(req: NextRequest) {
  try {
    const imagenId = req.nextUrl.searchParams.get("imagenId");
    const storagePath = req.nextUrl.searchParams.get("storagePath");
    if (!imagenId || !storagePath) {
      return NextResponse.json({ error: "imagenId y storagePath requeridos" }, { status: 400 });
    }
    await eliminarImagenServicio(imagenId, storagePath);
    return NextResponse.json({ eliminado: true });
  } catch (err) {
    console.error("[imagenes DELETE]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
