import os
import math
from PIL import Image, ImageDraw, ImageFont

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "assets")
os.makedirs(ASSETS_DIR, exist_ok=True)

HEADER_LOGO_PATH = os.path.join(ASSETS_DIR, "shravan_header.png")
WATERMARK_PATH = os.path.join(ASSETS_DIR, "shravan_watermark.png")
DIAMOND_ICON_PATH = os.path.join(ASSETS_DIR, "diamond_icon.png")

def get_devanagari_font(size=44):
    candidates = [
        "/System/Library/Fonts/Supplemental/DevanagariMT.ttc",
        "/System/Library/Fonts/Supplemental/ITFDevanagari.ttc",
        "/System/Library/Fonts/Kohinoor.ttc",
        "/System/Library/Fonts/DevanagariSangamMN.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()

def draw_diamond(draw, cx, cy, radius, stroke_color, line_width=2, with_rays=True):
    # Diamond geometry:
    # Table top flat: y = cy - radius*0.7
    # Girdle corners: (cx - radius, cy - radius*0.3), (cx + radius, cy - radius*0.3)
    # Bottom culet: (cx, cy + radius)
    top_y = cy - radius * 0.7
    girdle_y = cy - radius * 0.25
    bottom_y = cy + radius
    left_x = cx - radius
    right_x = cx + radius
    top_left_x = cx - radius * 0.6
    top_right_x = cx + radius * 0.6

    # Outline
    points = [
        (top_left_x, top_y),
        (top_right_x, top_y),
        (right_x, girdle_y),
        (cx, bottom_y),
        (left_x, girdle_y),
    ]
    draw.polygon(points, outline=stroke_color, width=line_width)

    # Horizontal girdle line
    draw.line([(left_x, girdle_y), (right_x, girdle_y)], fill=stroke_color, width=line_width)

    # Internal facet lines
    draw.line([(top_left_x, top_y), (cx, bottom_y)], fill=stroke_color, width=line_width)
    draw.line([(top_right_x, top_y), (cx, bottom_y)], fill=stroke_color, width=line_width)
    draw.line([(cx, top_y), (cx - radius * 0.35, girdle_y)], fill=stroke_color, width=line_width)
    draw.line([(cx, top_y), (cx + radius * 0.35, girdle_y)], fill=stroke_color, width=line_width)
    draw.line([(cx - radius * 0.35, girdle_y), (cx, bottom_y)], fill=stroke_color, width=line_width)
    draw.line([(cx + radius * 0.35, girdle_y), (cx, bottom_y)], fill=stroke_color, width=line_width)

    if with_rays:
        # Rays radiating above diamond
        ray_angles = [-60, -40, -20, 0, 20, 40, 60]
        for angle in ray_angles:
            rad = math.radians(angle - 90)
            r1 = radius * 0.88
            r2 = radius * 1.15
            x1 = cx + r1 * math.cos(rad)
            y1 = (cy - radius * 0.4) + r1 * math.sin(rad)
            x2 = cx + r2 * math.cos(rad)
            y2 = (cy - radius * 0.4) + r2 * math.sin(rad)
            draw.line([(x1, y1), (x2, y2)], fill=stroke_color, width=max(1, line_width - 1))

USER_REF_IMAGE = "/Users/sandeepkumar/.gemini/antigravity-ide/brain/1770b1ff-d5a4-4e00-a6b7-f77b5d2d3627/.user_uploaded/media_1789066483192.png"

def make_white_transparent(img, threshold=245):
    """Converts near-white pixels to transparent alpha for clean overlay"""
    img = img.convert("RGBA")
    datas = img.getdata()
    new_data = []
    for item in datas:
        # If pixel is close to white (background of paper), make transparent
        if item[0] >= threshold and item[1] >= threshold and item[2] >= threshold:
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
    img.putdata(new_data)
    return img

def extract_from_reference():
    if not os.path.exists(USER_REF_IMAGE):
        return False
    try:
        ref = Image.open(USER_REF_IMAGE)
        w, h = ref.size
        
        # 1. Crop Diamond Icon (top-left)
        # Bounding box approximately: x = [4.5%, 18.5%], y = [2.2%, 10.2%]
        dim_box = (int(w * 0.045), int(h * 0.022), int(w * 0.185), int(h * 0.102))
        dim_img = ref.crop(dim_box)
        dim_clean = make_white_transparent(dim_img, threshold=240)
        dim_clean.save(DIAMOND_ICON_PATH, "PNG")
        
        # 2. Crop Header ("श्रवण ज्वेलर्स" + TRUST | PURITY | TIMELESS BEAUTY)
        # Bounding box approximately: x = [25%, 75%], y = [1.5%, 10.5%]
        header_box = (int(w * 0.25), int(h * 0.015), int(w * 0.75), int(h * 0.105))
        header_img = ref.crop(header_box)
        header_clean = make_white_transparent(header_img, threshold=240)
        header_clean.save(HEADER_LOGO_PATH, "PNG")
        
        # 3. Clean Watermark composed from diamond and header with soft opacity
        wm_canvas = Image.new("RGBA", (700, 500), (255, 255, 255, 0))
        
        # Diamond icon at center top
        d_icon = Image.open(DIAMOND_ICON_PATH).convert("RGBA")
        d_icon = d_icon.resize((170, 145), Image.Resampling.LANCZOS)
        wm_canvas.paste(d_icon, ((700 - 170) // 2, 40), d_icon)
        
        # Header logo below diamond
        h_logo = Image.open(HEADER_LOGO_PATH).convert("RGBA")
        h_logo = h_logo.resize((480, 110), Image.Resampling.LANCZOS)
        wm_canvas.paste(h_logo, ((700 - 480) // 2, 205), h_logo)
        
        # Soften opacity for watermark (alpha ~ 16%)
        r, g, b, a = wm_canvas.split()
        a = a.point(lambda p: int(p * 0.18))
        wm_clean = Image.merge("RGBA", (r, g, b, a))
        wm_clean.save(WATERMARK_PATH, "PNG")
        
        print("Successfully extracted exact branding assets and composed clean watermark!")
        return True

    except Exception as e:
        print(f"Extraction from reference failed: {e}")
        return False

def generate_assets_if_needed(force=False):
    # If forced or assets missing, first try extracting directly from reference image
    if force or not os.path.exists(HEADER_LOGO_PATH) or not os.path.exists(WATERMARK_PATH) or not os.path.exists(DIAMOND_ICON_PATH):
        if extract_from_reference():
            return
            
        # Fallback generation if reference image not accessible
        # 1. Standalone Diamond Icon
        img_dim = Image.new("RGBA", (200, 200), (255, 255, 255, 0))
        d_draw = ImageDraw.Draw(img_dim)
        draw_diamond(d_draw, 100, 105, 65, (161, 98, 7, 255), line_width=4, with_rays=True)
        img_dim.save(DIAMOND_ICON_PATH, "PNG")

        # 2. Header Shop Name "श्रवण ज्वेलर्स" + Subtitle
        font_hindi = get_devanagari_font(size=72)
        font_sub = None
        for p in ["/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"]:
            if os.path.exists(p):
                try:
                    font_sub = ImageFont.truetype(p, 24)
                    break
                except Exception:
                    pass
        if not font_sub:
            font_sub = ImageFont.load_default()

        # Canvas for header title
        w, h = 900, 180
        img_header = Image.new("RGBA", (w, h), (255, 255, 255, 0))
        h_draw = ImageDraw.Draw(img_header)

        # Draw Hindi title
        title_text = "श्रवण ज्वेलर्स"
        bbox = h_draw.textbbox((0, 0), title_text, font=font_hindi)
        tw = bbox[2] - bbox[0]
        tx = (w - tw) // 2
        h_draw.text((tx, 15), title_text, font=font_hindi, fill=(92, 29, 14, 255))

        # Subtitle
        sub_text = "TRUST  |  PURITY  |  TIMELESS BEAUTY"
        s_bbox = h_draw.textbbox((0, 0), sub_text, font=font_sub)
        sw = s_bbox[2] - s_bbox[0]
        sx = (w - sw) // 2
        sy = 115

        # Lines flanking subtitle
        line_color = (120, 53, 15, 255)
        h_draw.line([(sx - 80, sy + 14), (sx - 15, sy + 14)], fill=line_color, width=2)
        h_draw.text((sx, sy), sub_text, font=font_sub, fill=line_color)
        h_draw.line([(sx + sw + 15, sy + 14), (sx + sw + 80, sy + 14)], fill=line_color, width=2)

        img_header.save(HEADER_LOGO_PATH, "PNG")

        # 3. Watermark (Diamond + श्रवण ज्वेलर्स + Subtitle) with low opacity
        wm_w, wm_h = 700, 500
        img_wm = Image.new("RGBA", (wm_w, wm_h), (255, 255, 255, 0))
        wm_draw = ImageDraw.Draw(img_wm)

        # Draw centered diamond
        draw_diamond(wm_draw, wm_w // 2, 130, 80, (180, 120, 60, 45), line_width=3, with_rays=True)

        font_wm_hindi = get_devanagari_font(size=64)
        font_wm_sub = None
        for p in ["/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"]:
            if os.path.exists(p):
                try:
                    font_wm_sub = ImageFont.truetype(p, 18)
                    break
                except Exception:
                    pass
        if not font_wm_sub:
            font_wm_sub = ImageFont.load_default()

        wb = wm_draw.textbbox((0, 0), title_text, font=font_wm_hindi)
        wtx = (wm_w - (wb[2] - wb[0])) // 2
        wm_draw.text((wtx, 240), title_text, font=font_wm_hindi, fill=(140, 70, 40, 42))

        ws_bbox = wm_draw.textbbox((0, 0), sub_text, font=font_wm_sub)
        wsw = ws_bbox[2] - ws_bbox[0]
        wsx = (wm_w - wsw) // 2
        wsy = 330
        wm_draw.line([(wsx - 60, wsy + 10), (wsx - 12, wsy + 10)], fill=(140, 70, 40, 35), width=2)
        wm_draw.text((wsx, wsy), sub_text, font=font_wm_sub, fill=(140, 70, 40, 35))
        wm_draw.line([(wsx + wsw + 12, wsy + 10), (wsx + wsw + 60, wsy + 10)], fill=(140, 70, 40, 35), width=2)

        img_wm.save(WATERMARK_PATH, "PNG")
        print("Generated invoice assets: diamond icon, header title, and watermark.")

generate_assets_if_needed(force=True)


def num_to_words_indian(num: float) -> str:
    """Converts a number to Indian currency words, e.g. RUPEES EIGHTY SIX THOUSAND TWO HUNDRED FIFTY EIGHT AND THIRTY EIGHT PAISE ONLY."""
    ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
            "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
            "SEVENTEEN", "EIGHTEEN", "NINETEEN"]
    tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"]

    def two_digit_words(n):
        if n < 20:
            return ones[n]
        else:
            t = tens[n // 10]
            o = ones[n % 10]
            return f"{t} {o}".strip()

    def three_digit_words(n):
        res = []
        if n >= 100:
            res.append(f"{ones[n // 100]} HUNDRED")
            n = n % 100
        if n > 0:
            res.append(two_digit_words(n))
        return " ".join(res).strip()

    num = round(float(num), 2)
    int_part = int(math.floor(num))
    paise = int(round((num - int_part) * 100))

    if int_part == 0:
        words = "ZERO"
    else:
        crores = int_part // 10000000
        rem = int_part % 10000000
        lakhs = rem // 100000
        rem = rem % 100000
        thousands = rem // 1000
        rem = rem % 1000

        parts = []
        if crores > 0:
            parts.append(f"{two_digit_words(crores)} CRORE")
        if lakhs > 0:
            parts.append(f"{two_digit_words(lakhs)} LAKH")
        if thousands > 0:
            parts.append(f"{two_digit_words(thousands)} THOUSAND")
        if rem > 0:
            parts.append(three_digit_words(rem))
        words = " ".join(parts).strip()

    result = f"RUPEES {words}"
    if paise > 0:
        result += f" AND {two_digit_words(paise)} PAISE"
    result += " ONLY."
    return result

