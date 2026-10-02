#!/usr/bin/env python3
"""Import a user-supplied PopCap PAK without changing engine sprite geometry.

Requires Python 3, Pillow and ffmpeg. The package is never checked into git.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import tempfile
import zlib
from PIL import Image


def source_image(source, key):
    """PNG as well as JPEG colour pieces can have separate grayscale masks."""
    from io import BytesIO
    original = Image.open(BytesIO(source[key]))
    image = original.convert('RGBA')
    mask_key = str(Path(key).with_suffix('')) + '_.png'
    if 'A' not in original.getbands() and mask_key in source:
        mask = Image.open(BytesIO(source[mask_key])).convert('L')
        if mask.size != image.size:
            raise ValueError(f'Alpha mask dimensions differ for {key}')
        image.putalpha(mask)
    return image


def unpack(path):
    data = bytes(v ^ 0xF7 for v in path.read_bytes())
    if data[:8] != bytes.fromhex('c04ac0ba00000000'):
        raise ValueError('Unsupported PAK header')
    pos, entries = 8, []
    while True:
        flag = data[pos]; pos += 1
        if flag & 0x80:
            break
        length = data[pos]; pos += 1
        name = data[pos:pos + length].decode().replace('\\', '/'); pos += length
        if name.startswith('/') or '..' in Path(name).parts:
            raise ValueError('Unsafe PAK path')
        size = struct.unpack_from('<I', data, pos)[0]; pos += 12
        entries.append((name, size))
    if pos + sum(size for _, size in entries) != len(data):
        raise ValueError('Truncated PAK')
    result = {}
    for name, size in entries:
        if name.lower() in result:
            raise ValueError('Duplicate PAK path')
        result[name.lower()] = data[pos:pos + size]; pos += size
    return result


def reanim(blob):
    data = zlib.decompress(blob[8:])
    if len(data) != struct.unpack_from('<I', blob, 4)[0]:
        raise ValueError('Invalid reanimation size')
    count = struct.unpack_from('<I', data, 8)[0]
    fps = struct.unpack_from('<f', data, 12)[0]
    pos = 20
    def integer():
        nonlocal pos
        value = struct.unpack_from('<I', data, pos)[0]; pos += 4
        return value
    def string():
        nonlocal pos
        length = integer()
        value = data[pos:pos + length].decode(); pos += length
        return value
    if integer() != 12:
        raise ValueError('Unsupported reanimation track layout')
    counts = [struct.unpack_from('<I', data, pos + i * 12 + 8)[0] for i in range(count)]
    pos += count * 12
    tracks = []
    for length in counts:
        name = string()
        if integer() != 44:
            raise ValueError('Unsupported reanimation transform layout')
        frames = [list(struct.unpack_from('<8f', data, pos + i * 44)) for i in range(length)]
        pos += length * 44
        previous = [0, 0, 0, 0, 1, 1, 0, 1, '', '', '']
        for frame in frames:
            frame.extend([string(), string(), string()])
            for i in range(11):
                if frame[i] == (-10000 if i < 8 else ''):
                    frame[i] = previous[i]
                previous[i] = frame[i]
        tracks.append({'name': name, 'frames': frames})
    if pos != len(data):
        raise ValueError('Unexpected reanimation data')
    return fps, tracks


class Renderer:
    def __init__(self, source):
        self.source, self.images, self.models = source, {}, {}

    def image(self, name):
        from io import BytesIO
        if name not in self.images:
            base = name.lower().removeprefix('image_reanim_')
            keys = [f'reanim/{base}.png', f'reanim/{base}.jpg', f'images/{base}.png', f'images/{base}.jpg']
            key = next((k for k in keys if k in self.source), None)
            if key is None:
                raise ValueError(f'Missing image {name}')
            image = source_image(self.source,key)
            self.images[name] = image
        return self.images[name]

    def model(self, name):
        if name not in self.models:
            self.models[name] = reanim(self.source[f'compiled/reanim/{name.lower()}.reanim.compiled'])
        return self.models[name]

    def sequence(self, model, animation):
        fps, tracks = self.model(model)
        if animation == '@all':
            return fps, tracks, list(range(len(tracks[0]['frames'])))
        marker = next((t for t in tracks if t['name'].lower() == animation.lower()), None)
        if marker is None:
            raise ValueError(f'{model}: missing {animation}')
        indices = [i for i, f in enumerate(marker['frames']) if f[6] >= 0]
        if not indices:
            raise ValueError(f'{model}: empty {animation}')
        return fps, tracks, indices

    def render(self, tracks, index, size=(1200, 1200), offset=(400, 400), hidden=()):
        canvas = Image.new('RGBA', size)
        for track in tracks:
            if any(s in track['name'].lower() for s in hidden):
                continue
            f = track['frames'][index]
            if f[6] < 0 or not f[8] or f[7] <= 0:
                continue
            im = self.image(f[8])
            # Reanimation coordinates refer to the upper-left of each piece.
            kx, ky = math.radians(f[2]), math.radians(f[3])
            a, b = math.cos(kx)*f[4], -math.sin(ky)*f[5]
            c, d = math.sin(kx)*f[4], math.cos(ky)*f[5]
            det = a*d-b*c
            if abs(det) < 1e-8:
                continue
            x, y = f[0]+offset[0], f[1]+offset[1]
            corners=[(a*u+b*v+x,c*u+d*v+y) for u,v in [(0,0),(im.width,0),(0,im.height),(im.width,im.height)]]
            left=max(0,math.floor(min(u for u,v in corners))-1)
            top=max(0,math.floor(min(v for u,v in corners))-1)
            right=min(size[0],math.ceil(max(u for u,v in corners))+1)
            bottom=min(size[1],math.ceil(max(v for u,v in corners))+1)
            if right<=left or bottom<=top:
                continue
            x-=left; y-=top
            matrix = (d/det, -b/det, (b*y-d*x)/det, -c/det, a/det, (c*x-a*y)/det)
            layer = im.transform((right-left,bottom-top), Image.Transform.AFFINE, matrix, Image.Resampling.BICUBIC)
            if f[7] < 1:
                layer.putalpha(layer.getchannel('A').point(lambda v: round(v*f[7])))
            canvas.alpha_composite(layer,(left,top))
        return canvas

    def export(self, model, animation, target, hidden=(), still=False, overrides=None, geometry=None):
        fps, tracks, indices = self.sequence(model, animation)
        # Fixed union across the sequence prevents per-frame jitter.
        supplements = [t for t in tracks if t['name'].lower().startswith('anim_head_idle') or t['name'].lower() == 'anim_splitpea_idle']
        supplemented = []
        for step, index in enumerate(indices):
            layers = [{'name':t['name'], 'frames':[t['frames'][index]]} for t in tracks]
            for marker in supplements:
                active = [i for i,f in enumerate(marker['frames']) if f[6]>=0]
                if not active:
                    continue
                alternate = active[step % len(active)]
                for layer, track in zip(layers, tracks):
                    if layer['frames'][0][6]<0 and track['frames'][alternate][6]>=0 and track['frames'][alternate][8]:
                        layer['frames'][0] = track['frames'][alternate]
            supplemented.append(layers)
        canvas_size=(1200,1800) if model.lower()=='crazydave' else (1200,1200)
        frames = [self.render(layers, 0, size=canvas_size,hidden=hidden) for layers in supplemented]
        if overrides:
            for original, replacement in overrides.items():
                self.images[original] = self.image(replacement).resize(self.image(original).size, Image.Resampling.LANCZOS)
            frames = [self.render(layers, 0, size=canvas_size,hidden=hidden) for layers in supplemented]
            for original in overrides:
                self.images.pop(original,None)
        bounds = [f.getbbox() for f in frames if f.getbbox()]
        if not bounds:
            raise ValueError(f'{model}: no visible pixels')
        box = (min(b[0] for b in bounds), min(b[1] for b in bounds), max(b[2] for b in bounds), max(b[3] for b in bounds))
        old = Image.open(target)
        output_size = tuple(geometry['size']) if geometry else old.size
        # Retain the old sprite's transparent margins as well as its DOM size.
        oldbox = geometry['bounds'] if geometry else old.convert('RGBA').getbbox() or (0,0,*old.size)
        fit = (oldbox[2]-oldbox[0], oldbox[3]-oldbox[1])
        output = []
        for frame in frames[:1] if still else frames:
            art = frame.crop(box)
            art.thumbnail(fit, Image.Resampling.LANCZOS)
            dest = Image.new('RGBA', output_size)
            dest.alpha_composite(art, (oldbox[0]+(fit[0]-art.width)//2, oldbox[3]-art.height))
            output.append(dest)
        save_frames(output, target, round(1000/fps))


def save_frames(frames, target, duration=80):
    if target.suffix.lower() == '.gif':
        quantized = []
        for frame in frames:
            palette = frame.convert('RGB').quantize(colors=255)
            alpha = frame.getchannel('A')
            palette.paste(255, mask=alpha.point(lambda x: 255 if x < 128 else 0))
            palette.info['transparency'] = 255
            quantized.append(palette)
        quantized[0].save(target, save_all=len(frames)>1, append_images=quantized[1:], duration=duration, loop=0, transparency=255, disposal=2)
    elif target.suffix.lower() == '.webp':
        frames[0].save(target, save_all=len(frames)>1, append_images=frames[1:], duration=duration, loop=0, lossless=True)
    elif target.suffix.lower() in ('.jpg', '.jpeg'):
        frames[0].convert('RGB').save(target, quality=95)
    else:
        frames[0].save(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pak', type=Path)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--map', type=Path, help='Optional explicit mapping file for an incremental import')
    parser.add_argument('--only', choices=['static','animations','audio','cards','all'], default='all')
    args = parser.parse_args()
    source = unpack(args.pak)
    renderer = Renderer(source)
    mapping = json.loads((args.map or args.root/'scripts/pak-asset-map.json').read_text())
    records, failures = [], []
    from io import BytesIO
    for item in mapping:
        kind = item['kind']
        if args.only not in ('all', kind):
            continue
        target = args.root/'game'/item['target']
        old = target.read_bytes()
        try:
            if kind == 'animations':
                renderer.export(item['model'], item['animation'], target, item.get('hidden', []), item.get('still', False), item.get('overrides'),item.get('geometry'))
            elif kind == 'static':
                image = source_image(source,item['source'].lower())
                if 'crop' in item:
                    image = image.crop(item['crop'])
                if item.get('mirror_tile'):
                    from PIL import ImageOps
                    tile = Image.new('RGBA', (image.width*2, image.height))
                    tile.alpha_composite(ImageOps.mirror(image), (0,0))
                    tile.alpha_composite(image, (image.width,0))
                    image = tile
                size = tuple(item.get('size', Image.open(target).size))
                if image.size != size:
                    image = image.resize(size, Image.Resampling.LANCZOS)
                save_frames([image], target)
            elif kind == 'cards':
                from PIL import ImageOps, ImageDraw
                fps, tracks, indices = renderer.sequence(item['model'], item['animation'])
                layers=[{'name':t['name'],'frames':[t['frames'][indices[0]]]} for t in tracks]
                for marker in tracks:
                    if not (marker['name'].lower().startswith('anim_head_idle') or marker['name'].lower()=='anim_splitpea_idle'):
                        continue
                    active=[i for i,f in enumerate(marker['frames']) if f[6]>=0]
                    if active:
                        for layer,track in zip(layers,tracks):
                            f=track['frames'][active[0]]
                            if layer['frames'][0][6]<0 and f[6]>=0 and f[8]:layer['frames'][0]=f
                art = renderer.render(layers, 0, hidden=item.get('hidden',[]))
                art = art.crop(art.getbbox())
                size = Image.open(target).size
                cell = (size[0], size[1]//2)
                lawn = Image.open(BytesIO(source['images/background1.png'])).crop((450,180,550,240)).resize(cell)
                art.thumbnail((cell[0]-6,cell[1]-6),Image.Resampling.LANCZOS)
                card = lawn.convert('RGBA')
                card.alpha_composite(art,((cell[0]-art.width)//2,cell[1]-art.height-3))
                ImageDraw.Draw(card).rectangle((1,1,cell[0]-2,cell[1]-2),outline='white',width=2)
                image = Image.new('RGBA',size)
                image.alpha_composite(card,(0,0))
                image.alpha_composite(ImageOps.grayscale(card).convert('RGBA'),(0,cell[1]))
                save_frames([image],target)
            elif kind == 'audio':
                with tempfile.TemporaryDirectory() as temp:
                    path = Path(temp)/'source.ogg'; path.write_bytes(source[item['source'].lower()])
                    subprocess.run(['ffmpeg','-v','error','-y','-i',str(path),'-codec:a','libmp3lame','-q:a','2',str(target)],check=True)
            records.append({**item, 'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
        except Exception as error:
            target.write_bytes(old)
            failures.append({'target':item['target'],'error':str(error)})
    report_path=args.root/'docs/pak-import.json'
    pak_hash=hashlib.sha256(args.pak.read_bytes()).hexdigest()
    previous=json.loads(report_path.read_text()) if report_path.exists() else {}
    existing={r['target']:r for r in previous.get('imported',[])} if previous.get('pak_sha256')==pak_hash else {}
    existing.update({r['target']:r for r in records})
    report = {'pak_sha256':pak_hash,'imported':sorted(existing.values(),key=lambda r:r['target']),'failed':failures}
    if 'restored_originals' in previous:
        report['restored_originals'] = previous['restored_originals']
    report_path.write_text(json.dumps(report,indent=2)+'\n')
    print(f'Imported {len(records)}; failed {len(failures)}')
    for f in failures: print(f)
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
