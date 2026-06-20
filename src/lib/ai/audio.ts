import { toFile } from "openai/uploads";
import { openai } from "./client";

export async function transcribirAudio(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const ext = mimeType.split("/")[1]?.split(";")[0] ?? "ogg";
  const file = await toFile(buffer, `audio.${ext}`, { type: mimeType });

  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "es",
  });

  return result.text.trim();
}
