// S34.2 — CRUD de secuencias y sus pasos
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any;

export async function GET() {
  try {
    const { data: secuencias } = await db()
      .from("prospeccion_secuencias")
      .select("*, prospeccion_secuencia_pasos(*)")
      .order("created_at", { ascending: false });
    return NextResponse.json({ secuencias: secuencias ?? [] });
  } catch (err) {
    console.error("[prospeccion/secuencias GET]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { nombre } = await req.json();
    if (!nombre?.trim()) {
      return NextResponse.json({ error: "nombre requerido" }, { status: 400 });
    }
    const { data, error } = await db()
      .from("prospeccion_secuencias")
      .insert({ nombre: nombre.trim() })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ secuencia: data }, { status: 201 });
  } catch (err) {
    console.error("[prospeccion/secuencias POST]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
