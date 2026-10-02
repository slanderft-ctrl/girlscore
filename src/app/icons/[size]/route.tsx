import { ImageResponse } from "next/og";

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = raw === "512" ? 512 : 192;
  const letter = (process.env.NEXT_PUBLIC_STUDIO_NAME ?? "S").charAt(0).toUpperCase();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#2f6f5e", color: "#fff", fontSize: size * 0.55, fontWeight: 600 }}>
        {letter}
      </div>
    ),
    { width: size, height: size },
  );
}
