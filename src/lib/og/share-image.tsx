import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";

/**
 * The picture WhatsApp, X, iMessage and others show when a Perqly link is shared (1200×630).
 * Same look as the app: deep navy, soft blue and orange light, a glossy blue pass and cedi coins.
 * Rendered once at build time. Fonts: Geist (SIL OFL, see fonts/GEIST-LICENSE.txt).
 */
export const shareImageSize = { width: 1200, height: 630 };

type Props = {
  /** Up to two short lines. */
  headline: [string, string?];
  sub: string;
  /** Small label in the top-right pill. */
  tag: string;
  /** What the glossy card on the right shows. */
  card: { label: string; small: string } & ({ saving: number } | { big: string });
};

// import.meta.url lets Next.js bundle the font files with the image route.
async function fonts() {
  const [medium, black] = await Promise.all([
    readFile(new URL("./fonts/Geist-Medium.ttf", import.meta.url)),
    readFile(new URL("./fonts/Geist-Black.ttf", import.meta.url)),
  ]);
  return [
    { name: "Geist", data: medium, weight: 500 as const, style: "normal" as const },
    { name: "Geist", data: black, weight: 900 as const, style: "normal" as const },
  ];
}

/** Geist has no cedi sign (₵), so it is drawn: a C with a stroke through it. */
function Cedi({ size, color, weight = 900 }: { size: number; color: string; weight?: number }) {
  return (
    <div style={{ display: "flex", position: "relative", fontSize: size, fontWeight: weight, lineHeight: 1, color }}>
      C
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: size * 0.33,
          top: size * 0.02,
          width: size * 0.09,
          height: size * 0.96,
          borderRadius: size * 0.05,
          background: color,
        }}
      />
    </div>
  );
}

function Coin({ x, y, size, blue = false }: { x: number; y: number; size: number; blue?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        backgroundImage: blue
          ? "radial-gradient(circle at 32% 28%, #D6E6FF 0%, #3D8BFF 42%, #0039A6 100%)"
          : "radial-gradient(circle at 32% 28%, #FFD8C7 0%, #FF6B35 45%, #B93C0E 100%)",
        boxShadow: blue ? "0 18px 36px rgba(0,102,255,0.45)" : "0 18px 36px rgba(255,107,53,0.45)",
      }}
    >
      <Cedi size={size * 0.5} color={blue ? "#FFFFFF" : "#3A1405"} />
    </div>
  );
}

export async function shareImage({ headline, sub, tag, card }: Props) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: "#0B1220",
        backgroundImage:
          "radial-gradient(circle at 12% 8%, rgba(0,102,255,0.7) 0%, rgba(0,102,255,0) 50%), radial-gradient(circle at 92% 105%, rgba(255,107,53,0.5) 0%, rgba(255,107,53,0) 48%)",
        color: "#FFFFFF",
        fontFamily: "Geist",
        overflow: "hidden",
      }}
    >
      {/* Words */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 0 64px 72px", width: 700 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 18,
              background: "#0066FF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              boxShadow: "inset 0 2px 0 rgba(255,255,255,0.35)",
            }}
          >
            <div style={{ display: "flex", fontSize: 44, fontWeight: 900, color: "#FFFFFF", marginTop: -6 }}>p</div>
            <div
              style={{
                display: "flex",
                position: "absolute",
                right: 11,
                bottom: 11,
                width: 11,
                height: 11,
                borderRadius: 11,
                background: "#FF6B35",
              }}
            />
          </div>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 900, letterSpacing: -1.5 }}>perqly</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 66, fontWeight: 900, lineHeight: 1, letterSpacing: -3 }}>{headline[0]}</div>
          {headline[1] && (
            <div style={{ display: "flex", fontSize: 66, fontWeight: 900, lineHeight: 1, letterSpacing: -3, color: "#FF8A5C" }}>
              {headline[1]}
            </div>
          )}
          <div style={{ display: "flex", marginTop: 28, fontSize: 30, fontWeight: 500, lineHeight: 1.35, color: "#C9D4E8", maxWidth: 600 }}>
            {sub}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: "#9FB0CC" }}>perqly.online</div>
      </div>

      {/* The glossy pass */}
      <div style={{ position: "absolute", right: 72, top: 64, display: "flex" }}>
        <div
          style={{
            display: "flex",
            padding: "10px 20px",
            borderRadius: 999,
            fontSize: 22,
            fontWeight: 500,
            color: "#FFFFFF",
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.22)",
          }}
        >
          {tag}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 96,
          top: 170,
          width: 360,
          height: 380,
          borderRadius: 40,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 34,
          transform: "rotate(-6deg)",
          backgroundImage: "linear-gradient(150deg, #3D8BFF 0%, #0066FF 48%, #0039A6 100%)",
          boxShadow: "0 40px 80px rgba(0,30,90,0.6), inset 0 2px 0 rgba(255,255,255,0.4)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 70,
            top: -60,
            width: 90,
            height: 520,
            transform: "rotate(18deg)",
            backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.28), rgba(255,255,255,0))",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 900, letterSpacing: -0.8 }}>perqly pass</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 999,
              background: "#FF6B35",
              color: "#1F2937",
              fontSize: 18,
              fontWeight: 900,
            }}
          >
            <div style={{ display: "flex", width: 9, height: 9, borderRadius: 9, background: "#1F2937" }} />
            Live
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 22, fontWeight: 500, color: "#D6E6FF" }}>{card.label}</div>
          {"saving" in card ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ display: "flex", fontSize: 108, fontWeight: 900, lineHeight: 1 }}>−</div>
              <Cedi size={108} color="#FFFFFF" />
              <div style={{ display: "flex", fontSize: 108, fontWeight: 900, lineHeight: 1, letterSpacing: -5 }}>{card.saving}</div>
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 108, fontWeight: 900, lineHeight: 1, letterSpacing: -5 }}>{card.big}</div>
          )}
          <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: "#D6E6FF" }}>{card.small}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {Array.from({ length: 22 }).map((_, i) => (
            <div key={i} style={{ width: i % 3 === 0 ? 8 : 4, height: 34, background: "rgba(255,255,255,0.75)", borderRadius: 2 }} />
          ))}
        </div>
      </div>
      <Coin x={640} y={470} size={96} />
      <Coin x={1088} y={500} size={64} blue />
    </div>,
    { ...shareImageSize, fonts: await fonts() },
  );
}
