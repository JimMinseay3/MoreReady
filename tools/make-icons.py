# -*- coding: utf-8 -*-
"""生成托盘图标：圆角渐变底 + 白色 P（浅色任务栏用）与白色剪影版（深色任务栏用）"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
os.makedirs(OUT, exist_ok=True)

S = 256  # 先画大图再缩小，边缘更干净


def rounded_gradient(size, radius, c1, c2, diagonal=True):
    base = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    grad = Image.new('RGBA', (size, size))
    px = grad.load()
    for y in range(size):
        for x in range(size):
            t = ((x + y) / (2 * size - 2)) if diagonal else (y / (size - 1))
            px[x, y] = (
                round(c1[0] + (c2[0] - c1[0]) * t),
                round(c1[1] + (c2[1] - c1[1]) * t),
                round(c1[2] + (c2[2] - c1[2]) * t),
                255,
            )
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    base.paste(grad, (0, 0), mask)
    return base


def letter_mask(size, text, font_path, ratio=0.62):
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    font = ImageFont.truetype(font_path, int(size * ratio))
    box = d.textbbox((0, 0), text, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1] - size * 0.015), text, font=font, fill=255)
    return m


FONT = r'C:\Windows\Fonts\msyhbd.ttc'   # 微软雅黑 Bold，和界面里的 P 一致

# 1) 彩色版：渐变底 + 白色 P
icon = rounded_gradient(S, int(S * 0.26), (0x5b, 0x8c, 0xff), (0x8f, 0x6b, 0xff))
icon.paste((255, 255, 255, 255), (0, 0), letter_mask(S, 'P', FONT))
for s in (16, 20, 24, 32, 40, 48, 64, 128, 256):
    icon.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f'tray-{s}.png'))

# 2) 剪影版（深色任务栏）：白色圆角块 + 镂空 P
sil = rounded_gradient(S, int(S * 0.26), (255, 255, 255), (232, 237, 247))
cut = letter_mask(S, 'P', FONT)
sil.putalpha(Image.composite(Image.new('L', (S, S), 0), sil.getchannel('A'), cut))
for s in (16, 24, 32, 48):
    sil.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f'tray-light-{s}.png'))

# 3) 应用窗口图标（多尺寸 ico 交给 Electron 用 png 即可，这里额外给个大图）
icon.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, 'app-256.png'))

print('written ->', OUT)
for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    print(' ', f, os.path.getsize(p), 'bytes')
