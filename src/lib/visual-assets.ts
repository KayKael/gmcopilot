import { supabase } from "@/integrations/supabase/client";

export const VISUAL_BUCKET = "visual-assets";

export interface VisualAsset {
  id: string;
  nome: string;
  storage_path: string;
  public_url: string;
  ordem: number;
  created_at: string;
}

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export function isImageFile(file: File): boolean {
  if (IMAGE_TYPES.has(file.type)) return true;
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(file.name);
}

function safeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

export async function listarAssets(): Promise<VisualAsset[]> {
  const { data, error } = await supabase
    .from("visual_assets")
    .select("*")
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as VisualAsset[];
}

export async function uploadAsset(file: File): Promise<VisualAsset> {
  if (!isImageFile(file)) {
    throw new Error(`${file.name}: só aceito imagens (jpg, png, webp, gif, avif)`);
  }

  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf("."))
    : "";
  const path = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName(file.name.replace(/\.[^.]+$/, ""))}${ext}`;

  const { error: upErr } = await supabase.storage
    .from(VISUAL_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      ...(file.type ? { contentType: file.type } : {}),
    });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from(VISUAL_BUCKET).getPublicUrl(path);
  const public_url = pub.publicUrl;

  const { data: maxRow } = await supabase
    .from("visual_assets")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordem = (maxRow?.ordem ?? 0) + 1;

  const { data, error } = await supabase
    .from("visual_assets")
    .insert({
      nome: file.name,
      storage_path: path,
      public_url,
      ordem,
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from(VISUAL_BUCKET).remove([path]);
    throw error;
  }
  return data as VisualAsset;
}

export async function uploadAssets(files: FileList | File[]): Promise<VisualAsset[]> {
  const list = Array.from(files);
  const out: VisualAsset[] = [];
  for (const f of list) {
    out.push(await uploadAsset(f));
  }
  return out;
}

export async function apagarAsset(asset: VisualAsset): Promise<void> {
  const { error: dbErr } = await supabase.from("visual_assets").delete().eq("id", asset.id);
  if (dbErr) throw dbErr;
  const { error: stErr } = await supabase.storage
    .from(VISUAL_BUCKET)
    .remove([asset.storage_path]);
  if (stErr) console.warn("Falha a apagar ficheiro do storage:", stErr.message);
}
