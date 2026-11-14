import { ImageResponse } from "next/og";

export const alt = "Perqly: show your pass, pay the student price.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0066FF",
        padding: 72,
        color: "#FFFFFF",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 22,
            background: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 52,
            fontWeight: 800,
            color: "#0066FF",
          }}
        >
          p
        </div>
        <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: -2 }}>perqly</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 1, letterSpacing: -3 }}>Show your pass.</div>
        <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 1, letterSpacing: -3 }}>Pay the student price.</div>
        <div style={{ marginTop: 36, fontSize: 34, color: "#D6E6FF" }}>Student discounts near campus. Launching first at GCTU.</div>
      </div>
      <div style={{ position: "absolute", right: 72, top: 72, width: 28, height: 28, borderRadius: 14, background: "#FF6B35" }} />
    </div>,
    size,
  );
}
