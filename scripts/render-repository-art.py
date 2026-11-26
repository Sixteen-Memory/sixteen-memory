"""Generate SixteenMemory repository artwork (Light & Dark adaptive assets).

Uses the official transparent SixteenMemory mark/wordmark and bundled SIL OFL
fonts; performs no network requests and is not required for runtime builds.
Run from the repository root: python3 scripts/render-repository-art.py
"""
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs/assets"
HOME_ASSETS = ROOT / "homepage/public/assets"
OFFICIAL_LOGO = HOME_ASSETS / "sixteenmemory-official-logo.png"


def extract_official_parts():
    logo = Image.open(OFFICIAL_LOGO).convert("RGBA")
    # Official 820x724 artwork has the cobalt emblem in y=[40,520] and wordmark in y=[584,684].
    emblem = logo.crop((220, 40, 599, 520))
    wordmark_dark_ink = logo.crop((40, 584, 780, 684))

    # Build white-ink wordmark for dark GitHub themes while preserving exact alpha antialiasing.
    wordmark_light_ink = Image.new("RGBA", wordmark_dark_ink.size, (0, 0, 0, 0))
    src = wordmark_dark_ink.load()
    dst = wordmark_light_ink.load()
    for y in range(wordmark_dark_ink.height):
        for x in range(wordmark_dark_ink.width):
            _, _, _, a = src[x, y]
            if a:
                dst[x, y] = (240, 246, 252, a)

    # Subtle lift on cobalt emblem for dark GitHub #0d1117 backgrounds so edges stay luminous.
    emblem_dark = Image.new("RGBA", emblem.size, (0, 0, 0, 0))
    esrc = emblem.load()
    edst = emblem_dark.load()
    for y in range(emblem.height):
        for x in range(emblem.width):
            r, g, b, a = esrc[x, y]
            if a:
                edst[x, y] = (min(255, r + 42), min(255, g + 34), min(255, b + 15), a)
    return emblem, emblem_dark, wordmark_dark_ink, wordmark_light_ink


def render_lockups(emblem, emblem_dark, wordmark_light_bg, wordmark_dark_bg):
    # Horizontal transparent retina lockup (1080 x 192 -> displayed at ~360-400px wide).
    emblem_h = 124
    emblem_w = round(emblem.width * emblem_h / emblem.height)
    wm_h = 84
    wm_w = round(wordmark_light_bg.width * wm_h / wordmark_light_bg.height)
    gap = 34
    pad_x = 40
    canvas_w = pad_x * 2 + emblem_w + gap + wm_w
    canvas_h = 184

    for mode, em, wm in [
        ("light", emblem, wordmark_light_bg),
        ("dark", emblem_dark, wordmark_dark_bg),
    ]:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        em_r = em.resize((emblem_w, emblem_h), Image.Resampling.LANCZOS)
        wm_r = wm.resize((wm_w, wm_h), Image.Resampling.LANCZOS)
        canvas.alpha_composite(em_r, (pad_x, (canvas_h - emblem_h) // 2))
        canvas.alpha_composite(wm_r, (pad_x + emblem_w + gap, (canvas_h - wm_h) // 2 + 4))
        out = ASSETS / f"hero-lockup-{mode}.png"
        canvas.save(out, optimize=True)
        print(f"Rendered {out.relative_to(ROOT)} ({canvas_w} x {canvas_h})")


def render_social_cover(emblem, wordmark_dark_ink):
    # Clean 1280x640 GitHub Social Preview / editorial light card (2x supersampled).
    W, H, S = 1280, 640, 2
    with TemporaryDirectory(prefix="sixteen-cover-") as tmp:
        def load_font(name, size, weight=None):
            src = TTFont(HOME_ASSETS / name)
            if weight and "fvar" in src:
                src = instantiateVariableFont(src, {"wght": weight})
            src.flavor = None
            p = Path(tmp) / f"{name}-{weight}.ttf"
            src.save(p)
            return ImageFont.truetype(str(p), round(size * S))

        f_tag = load_font("manrope.woff", 13, 700)
        f_head = load_font("manrope.woff", 48, 700)
        f_sub = load_font("manrope.woff", 21, 450)
        f_chip = load_font("manrope.woff", 13, 600)

        img = Image.new("RGBA", (W * S, H * S), (255, 255, 255, 255))
        draw = ImageDraw.Draw(img)

        # Subtle architectural dot grid on right margin
        for gx in range(860, 1220, 32):
            for gy in range(72, 576, 32):
                draw.ellipse(
                    ((gx - 1) * S, (gy - 1) * S, (gx + 1) * S, (gy + 1) * S),
                    fill=(226, 232, 240, 255),
                )

        # Outer subtle frame
        draw.rounded_rectangle(
            (28 * S, 28 * S, (W - 28) * S, (H - 28) * S),
            radius=24 * S,
            outline=(226, 232, 240, 255),
            width=S,
        )

        # Official lockup top-left
        em_h = 56 * S
        em_w = round(emblem.width * em_h / emblem.height)
        wm_h = 38 * S
        wm_w = round(wordmark_dark_ink.width * wm_h / wordmark_dark_ink.height)
        img.alpha_composite(emblem.resize((em_w, em_h), Image.Resampling.LANCZOS), (84 * S, 86 * S))
        img.alpha_composite(
            wordmark_dark_ink.resize((wm_w, wm_h), Image.Resampling.LANCZOS),
            (84 * S + em_w + 18 * S, 97 * S),
        )

        # Pill top-right
        draw.rounded_rectangle(
            (1024 * S, 92 * S, 1196 * S, 128 * S),
            radius=18 * S,
            fill=(239, 246, 255, 255),
            outline=(191, 219, 254, 255),
            width=S,
        )
        draw.text((1054 * S, 102 * S), "APACHE-2.0 · v0.3", font=f_tag, fill=(16, 96, 240, 255))

        # Main editorial headline
        draw.text((84 * S, 210 * S), "Source-linked memory", font=f_head, fill=(15, 23, 42, 255))
        draw.text((84 * S, 274 * S), "for AI Agents.", font=f_head, fill=(16, 96, 240, 255))
        draw.text(
            (84 * S, 366 * S),
            "Verbatim provenance, optimistic versions, incremental Wiki, and MCP — on SQLite.",
            font=f_sub,
            fill=(71, 85, 105, 255),
        )

        # Minimalist capability chips
        draw.line([(84 * S, 456 * S), (1196 * S, 456 * S)], fill=(226, 232, 240, 255), width=S)
        chips = [
            "TypeScript & Python SDKs",
            "Codex & Claude Code MCP",
            "Vercel AI SDK 7",
            "Cloudflare Workers + SQLite DO",
        ]
        cx = 84
        for label in chips:
            tw = draw.textlength(label, font=f_chip) / S
            bw = round(tw + 32)
            draw.rounded_rectangle(
                (cx * S, 492 * S, (cx + bw) * S, 532 * S),
                radius=20 * S,
                fill=(248, 250, 252, 255),
                outline=(226, 232, 240, 255),
                width=S,
            )
            draw.text(((cx + 16) * S, 504 * S), label, font=f_chip, fill=(51, 65, 85, 255))
            cx += bw + 14

        out = ASSETS / "repository-cover.png"
        img.convert("RGB").resize((W, H), Image.Resampling.LANCZOS).save(out, optimize=True)
        print(f"Rendered {out.relative_to(ROOT)} ({W} x {H})")


THEMES = {
    "light": {
        "card": "#ffffff",
        "card_alt": "#f8fafc",
        "card_core": "#eff6ff",
        "border": "#e2e8f0",
        "border_core": "#93c5fd",
        "border_dash": "#cbd5e1",
        "ink": "#0f172a",
        "muted": "#475569",
        "subtle": "#64748b",
        "accent": "#1060f0",
        "accent_soft": "#dbeafe",
        "code_bg": "#f1f5f9",
        "code_fg": "#1e3a8a",
        "line": "#94a3b8",
        "pill_bg": "#eff6ff",
        "pill_fg": "#1060f0",
    },
    "dark": {
        "card": "#161b22",
        "card_alt": "#0d1117",
        "card_core": "#101e36",
        "border": "#30363d",
        "border_core": "#2f6feb",
        "border_dash": "#3d444d",
        "ink": "#f0f6fc",
        "muted": "#9ca3af",
        "subtle": "#8b949e",
        "accent": "#4c8dff",
        "accent_soft": "#172b4d",
        "code_bg": "#1c2330",
        "code_fg": "#93c5fd",
        "line": "#6e7681",
        "pill_bg": "#152540",
        "pill_fg": "#79c0ff",
    },
}


def render_lifecycle_svgs():
    for mode, t in THEMES.items():
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="248" viewBox="0 0 1120 248" role="img" aria-labelledby="lc-title lc-desc">
  <title id="lc-title">SixteenMemory source-linked memory lifecycle</title>
  <desc id="lc-desc">Four minimalist stages: Write with verbatim source, Enforce scope and version, Retrieve bounded context via SDKs or MCP, and Maintain incremental source-linked Wiki pages.</desc>
  <defs>
    <marker id="lc-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M1 1 L6 3.5 L1 6" fill="none" stroke="{t['accent']}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
    <style>
      text {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif; }}
      .k {{ font-size: 11px; font-weight: 700; letter-spacing: 1.4px; fill: {t['accent']}; }}
      .h {{ font-size: 16px; font-weight: 600; fill: {t['ink']}; }}
      .p {{ font-size: 13px; fill: {t['muted']}; }}
      .m {{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; font-size: 11.5px; fill: {t['code_fg']}; }}
    </style>
  </defs>

  <!-- 01 -->
  <rect x="8" y="16" width="246" height="216" rx="14" fill="{t['card']}" stroke="{t['border']}" stroke-width="1.2"/>
  <text x="28" y="48" class="k">01 · CAPTURE</text>
  <text x="28" y="78" class="h">Write with source</text>
  <text x="28" y="106" class="p">Store facts, chats, or media</text>
  <text x="28" y="126" class="p">with verbatim user evidence.</text>
  <rect x="28" y="160" width="206" height="50" rx="8" fill="{t['code_bg']}"/>
  <text x="40" y="181" class="m">request_id + source.ref</text>
  <text x="40" y="199" class="m">assistant != proof</text>

  <path d="M254 124 H284" stroke="{t['accent']}" stroke-width="1.5" fill="none" marker-end="url(#lc-arr)"/>

  <!-- 02 -->
  <rect x="292" y="16" width="246" height="216" rx="14" fill="{t['card']}" stroke="{t['border']}" stroke-width="1.2"/>
  <text x="312" y="48" class="k">02 · GUARD</text>
  <text x="312" y="78" class="h">Scope &amp; version</text>
  <text x="312" y="106" class="p">Server enforces user_id keys,</text>
  <text x="312" y="126" class="p">versions, and full history.</text>
  <rect x="312" y="160" width="206" height="50" rx="8" fill="{t['code_bg']}"/>
  <text x="324" y="181" class="m">expected_version (409)</text>
  <text x="324" y="199" class="m">revoke · delete · audit</text>

  <path d="M538 124 H568" stroke="{t['accent']}" stroke-width="1.5" fill="none" marker-end="url(#lc-arr)"/>

  <!-- 03 -->
  <rect x="576" y="16" width="246" height="216" rx="14" fill="{t['card']}" stroke="{t['border']}" stroke-width="1.2"/>
  <text x="596" y="48" class="k">03 · RECALL</text>
  <text x="596" y="78" class="h">Bounded context</text>
  <text x="596" y="106" class="p">Retrieve whole records via</text>
  <text x="596" y="126" class="p">TS/Python SDKs or MCP.</text>
  <rect x="596" y="160" width="206" height="50" rx="8" fill="{t['code_bg']}"/>
  <text x="608" y="181" class="m">FTS5 / hybrid · /v1/mcp</text>
  <text x="608" y="199" class="m">zero truncated quotes</text>

  <path d="M822 124 H852" stroke="{t['accent']}" stroke-width="1.5" fill="none" marker-end="url(#lc-arr)"/>

  <!-- 04 -->
  <rect x="860" y="16" width="252" height="216" rx="14" fill="{t['card_core']}" stroke="{t['border_core']}" stroke-width="1.3"/>
  <text x="880" y="48" class="k">04 · EVOLVE</text>
  <text x="880" y="78" class="h">Incremental Wiki</text>
  <text x="880" y="106" class="p">Edits mark only dependent</text>
  <text x="880" y="126" class="p">pages stale; conflicts stay.</text>
  <rect x="880" y="160" width="212" height="50" rx="8" fill="{t['accent_soft']}"/>
  <text x="892" y="181" class="m">tracks (source_id, ver)</text>
  <text x="892" y="199" class="m">target_slugs rebuild</text>
</svg>
"""
        out = ASSETS / f"lifecycle-{mode}.svg"
        out.write_text(svg, encoding="utf-8")
        print(f"Rendered {out.relative_to(ROOT)}")


def render_architecture_svgs():
    for mode, t in THEMES.items():
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="516" viewBox="0 0 1120 516" role="img" aria-labelledby="ar-title ar-desc">
  <title id="ar-title">SixteenMemory architecture</title>
  <desc id="ar-desc">Clients (TypeScript and Python SDKs, Vercel AI SDK, MCP Code Agents, and React Console) call the Cloudflare Worker memory service. Solid core paths commit atomically to a SQLite Durable Object with built-in FTS5 and Wiki dependency tracking. Dashed opt-in provider paths run outside database transactions.</desc>
  <defs>
    <marker id="ar-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M1 1 L6 3.5 L1 6" fill="none" stroke="{t['line']}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
    <marker id="ar-arr-c" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M1 1 L6 3.5 L1 6" fill="none" stroke="{t['accent']}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
    <style>
      text {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif; }}
      .k {{ font-size: 11px; font-weight: 700; letter-spacing: 1.5px; fill: {t['subtle']}; }}
      .kc {{ font-size: 11px; font-weight: 700; letter-spacing: 1.5px; fill: {t['accent']}; }}
      .h {{ font-size: 16px; font-weight: 600; fill: {t['ink']}; }}
      .hb {{ font-size: 19px; font-weight: 700; fill: {t['ink']}; }}
      .p {{ font-size: 13px; fill: {t['muted']}; }}
      .m {{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; font-size: 11.5px; fill: {t['code_fg']}; }}
      .pill {{ font-size: 11px; font-weight: 600; fill: {t['pill_fg']}; }}
    </style>
  </defs>

  <!-- Column Headers -->
  <text x="16" y="26" class="k">CLIENTS &amp; AGENTS</text>
  <text x="384" y="26" class="kc">MEMORY SERVICE</text>
  <text x="804" y="26" class="k">STORAGE &amp; PROVIDERS</text>

  <!-- Column 1: Clients -->
  <rect x="16" y="44" width="296" height="114" rx="14" fill="{t['card']}" stroke="{t['border']}" stroke-width="1.2"/>
  <text x="36" y="76" class="h">SDKs &amp; Frameworks</text>
  <text x="36" y="100" class="p">TypeScript, Python, Vercel AI SDK 7</text>
  <text x="36" y="132" class="m">product/sdk · sdk-python · vercel-ai</text>

  <rect x="16" y="176" width="296" height="114" rx="14" fill="{t['card']}" stroke="{t['border']}" stroke-width="1.2"/>
  <text x="36" y="208" class="h">MCP &amp; Code Agents</text>
  <text x="36" y="232" class="p">Codex, Claude Code &amp; PKCE OAuth</text>
  <text x="36" y="264" class="m">/v1/mcp · integrations/code-agents</text>

  <rect x="16" y="308" width="296" height="114" rx="14" fill="{t['card']}" stroke="{t['border']}" stroke-width="1.2"/>
  <text x="36" y="340" class="h">Management Console</text>
  <text x="36" y="364" class="p">Memories, sources, Wiki &amp; API keys</text>
  <text x="36" y="396" class="m">product/src · Pages Service Binding</text>

  <!-- Connectors 1 -> 2 -->
  <path d="M312 101 H348 V176 H380" stroke="{t['line']}" stroke-width="1.4" fill="none" marker-end="url(#ar-arr)"/>
  <path d="M312 233 H380" stroke="{t['line']}" stroke-width="1.4" fill="none" marker-end="url(#ar-arr)"/>
  <path d="M312 365 H348 V292 H380" stroke="{t['line']}" stroke-width="1.4" fill="none" marker-end="url(#ar-arr)"/>

  <!-- Column 2: Cloudflare Worker -->
  <rect x="384" y="44" width="352" height="378" rx="16" fill="{t['card_core']}" stroke="{t['border_core']}" stroke-width="1.4"/>
  <rect x="408" y="66" width="142" height="24" rx="12" fill="{t['accent_soft']}"/>
  <text x="422" y="82" class="pill">CLOUDFLARE WORKER</text>
  <text x="408" y="122" class="hb">Access, Rules &amp; Wiki</text>
  <text x="408" y="144" class="m">product/worker</text>
  <line x1="408" y1="162" x2="712" y2="162" stroke="{t['border_core']}" stroke-opacity="0.5"/>

  <text x="408" y="192" class="p">Scope, roles, rate limits &amp; PKCE OAuth</text>
  <text x="408" y="218" class="p">Idempotent writes &amp; expected_version</text>
  <text x="408" y="244" class="p">Bilingual FTS5 search &amp; bounded context</text>
  <text x="408" y="270" class="p">Conversations &amp; incremental Wiki</text>

  <rect x="408" y="296" width="304" height="102" rx="12" fill="{t['card']}" stroke="{t['border_dash']}" stroke-dasharray="5 4" stroke-width="1.2"/>
  <text x="426" y="324" class="k">OPT-IN INTELLIGENCE</text>
  <text x="426" y="348" class="p">Fact extraction, RRF hybrid &amp; media</text>
  <text x="426" y="376" class="m">Runs outside SQLite transactions</text>

  <!-- Connectors 2 -> 3 -->
  <path d="M736 146 H800" stroke="{t['accent']}" stroke-width="1.6" fill="none" marker-end="url(#ar-arr-c)"/>
  <path d="M736 347 H800" stroke="{t['line']}" stroke-width="1.4" stroke-dasharray="5 4" fill="none" marker-end="url(#ar-arr)"/>

  <!-- Column 3: Storage & Opt-in Providers -->
  <rect x="804" y="44" width="300" height="202" rx="14" fill="{t['card']}" stroke="{t['border_core']}" stroke-width="1.3"/>
  <text x="826" y="76" class="h">SQLite Durable Object</text>
  <text x="826" y="99" class="p">Zero external DB · built-in FTS5</text>
  <line x1="826" y1="116" x2="1082" y2="116" stroke="{t['border']}"/>
  <text x="826" y="144" class="m">memories · sources · history</text>
  <text x="826" y="168" class="m">conversations · evidence_fts</text>
  <text x="826" y="192" class="m">wiki_pages · source_deps</text>
  <text x="826" y="216" class="m">keys · oauth · audit · vectors</text>

  <rect x="804" y="268" width="300" height="154" rx="14" fill="{t['card_alt']}" stroke="{t['border_dash']}" stroke-dasharray="5 4" stroke-width="1.2"/>
  <text x="826" y="300" class="h">Model Providers</text>
  <text x="826" y="324" class="p">OpenAI / Qwen · Omni media</text>
  <rect x="826" y="348" width="256" height="50" rx="8" fill="{t['code_bg']}"/>
  <text x="838" y="369" class="m">Disabled by default</text>
  <text x="838" y="387" class="m">Zero implicit retries</text>

  <!-- Minimalist Legend Footer -->
  <line x1="16" y1="454" x2="1104" y2="454" stroke="{t['border']}"/>
  <line x1="16" y1="484" x2="48" y2="484" stroke="{t['accent']}" stroke-width="2"/>
  <text x="60" y="488" class="p">Model-free core path (runs 100% locally or on Cloudflare Workers)</text>
  <line x1="560" y1="484" x2="592" y2="484" stroke="{t['line']}" stroke-width="1.6" stroke-dasharray="5 4"/>
  <text x="604" y="488" class="p">Opt-in provider path (enabled explicitly via env flags)</text>
</svg>
"""
        out = ASSETS / f"architecture-{mode}.svg"
        out.write_text(svg, encoding="utf-8")
        print(f"Rendered {out.relative_to(ROOT)}")
        if mode == "light":
            fallback = ASSETS / "architecture.svg"
            fallback.write_text(svg, encoding="utf-8")
            print(f"Synced   {fallback.relative_to(ROOT)}")


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    emblem, emblem_dark, wm_light_bg, wm_dark_bg = extract_official_parts()
    render_lockups(emblem, emblem_dark, wm_light_bg, wm_dark_bg)
    render_social_cover(emblem, wordmark_dark_ink=wm_light_bg)
    render_lifecycle_svgs()
    render_architecture_svgs()


if __name__ == "__main__":
    main()
