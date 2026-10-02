#!/usr/bin/env python3
"""Check imported images, geometry, transparency and importer edge cases."""
import hashlib
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import struct
import unittest
import zlib
from PIL import Image, ImageSequence

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('assets',ROOT/'scripts/import-pak-assets.py')
assets=importlib.util.module_from_spec(spec);spec.loader.exec_module(assets)

def string(value):
    value=value.encode();return struct.pack('<I',len(value))+value

def animation():
    # Original 32-bit cache format, two frames, second inherits its image/x.
    data=struct.pack('<III f I I',0,0,1,12,0,12)
    data+=struct.pack('<III',0,0,2)+string('anim_idle')+struct.pack('<I',44)
    for f in [(5,7,0,0,1,1,0,1),(-10000,9,-10000,-10000,-10000,-10000,-10000,-10000)]:
        data+=struct.pack('<8fIII',*f,0,0,0)
    data+=string('IMAGE_REANIM_TEST')+string('')+string('')
    data+=string('')+string('')+string('')
    return struct.pack('<II',0xDEADFED4,len(data))+zlib.compress(data)

class ImportTests(unittest.TestCase):
    def test_inherited_fields(self):
        fps,tracks=assets.reanim(animation())
        self.assertEqual(fps,12)
        self.assertEqual(tracks[0]['frames'][1],[5,9,0,0,1,1,0,1,'IMAGE_REANIM_TEST','',''])

    def test_truncated_animation(self):
        with self.assertRaises((ValueError,zlib.error,struct.error)):
            assets.reanim(animation()[:-8])

    def test_jpeg_alpha_mask(self):
        color=BytesIO();Image.new('RGB',(5,5),'red').save(color,'JPEG')
        mask=BytesIO();im=Image.new('L',(5,5),0);im.putpixel((2,2),255);im.save(mask,'PNG')
        renderer=assets.Renderer({'reanim/test.jpg':color.getvalue(),'reanim/test_.png':mask.getvalue()})
        image=renderer.image('IMAGE_REANIM_TEST')
        self.assertEqual(image.getbbox(),(2,2,3,3))
        self.assertGreater(image.getpixel((2,2))[0],240)

    def test_large_negative_transform(self):
        blob=BytesIO();Image.new('RGBA',(4,6),(255,0,0,255)).save(blob,'PNG')
        renderer=assets.Renderer({'reanim/test.png':blob.getvalue()})
        tracks=[{'name':'body','frames':[[-200,-180,0,0,1,1,0,1,'IMAGE_REANIM_TEST','','']]}]
        im=renderer.render(tracks,0)
        self.assertEqual(im.getbbox(),(200,220,204,226))

    def test_imported_assets(self):
        report=json.loads((ROOT/'docs/pak-import.json').read_text())
        self.assertEqual(report['failed'],[])
        records=report['imported']
        self.assertGreater(len(records),500)
        for record in records:
            with self.subTest(target=record['target']):
                path=ROOT/'game'/record['target']
                self.assertTrue(path.is_file())
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),record['sha256'])
                if record['kind']!='audio':
                    with Image.open(path) as image:
                        if 'geometry' in record:
                            self.assertEqual(list(image.size),record['geometry']['size'])
                        visible=False
                        for frame in ImageSequence.Iterator(image):
                            frame.load()
                            visible=visible or frame.convert('RGBA').getbbox() is not None
                        self.assertTrue(visible,'sequence has visible artwork')

if __name__=='__main__':
    unittest.main()
