"""验证实际 PDF 的纸张、完整文字、离线字体与矢量内容。"""
from pathlib import Path
from pypdf import PdfReader
import json
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')
output = Path('tmp/pdfs')
manifest = {item['name']: item for item in json.loads((output / 'label-manifest.json').read_text(encoding='utf8'))}
compact = lambda text: re.sub(r'\s+', '', text)

for path in sorted(output.glob('*.pdf')):
    reader = PdfReader(path)
    print(path.name, '页数', len(reader.pages), '页面边界', [round(float(value), 3) for value in reader.pages[0].mediabox])
    fonts = set()
    extracted = []
    for page in reader.pages:
        text = page.extract_text()
        extracted.append(text)
        if path.name.startswith('declaration'):
            assert '草稿' in text and 'DRAFT' in text, (path, '缺少逐页草稿提示')
        for item in page['/Resources']['/Font'].get_object().values():
            font = item.get_object()
            if '/DescendantFonts' in font:
                descriptor = font['/DescendantFonts'][0].get_object()['/FontDescriptor'].get_object()
                assert '/FontFile2' in descriptor, (path, '字体未离线嵌入')
                fonts.add(str(font['/BaseFont']))
        assert len(page.images) == 0, (path, '标志必须为矢量，不得嵌入位图')
    if path.stem in manifest:
        sample = manifest[path.stem]
        assert sample['valid'] and len(reader.pages) == 1
        assert abs(float(reader.pages[0].mediabox.width) * 25.4 / 72 - sample['width']) < 0.001
        assert abs(float(reader.pages[0].mediabox.height) * 25.4 / 72 - sample['height']) < 0.001
        assert compact(extracted[0]) == compact(''.join(line['text'] for line in sample['lines'])), (path, 'PDF 文字不完整或混入提示语')
        expected_fonts = {run['font'] for line in sample['lines'] for run in line['runs'] if run['text']}
        assert len(fonts) == len(expected_fonts), (path, '实际字体数量不匹配')
        assert '提示：发往欧洲' not in extracted[0], (path, '界面提示不可印在标签上')
        for index, line in enumerate(sample['lines']):
            assert line['fontSize'] >= 5.5
            assert line['x'] >= 2
            assert line['x'] + sum(run['width'] for run in line['runs']) <= sample['width'] - 2 + 0.00001
            bottom = line['y'] + line['fontSize'] * 25.4 / 72 * 0.24
            assert bottom <= min((icon['y'] - 0.5 for icon in sample['icons']), default=sample['height'] - 2) + 0.00001
            bounds = line['bounds']
            assert bounds['left'] >= 2 - 0.00001 and bounds['top'] >= 2 - 0.00001
            assert bounds['right'] <= sample['width'] - 2 + 0.00001
            assert bounds['bottom'] <= min((icon['y'] - 0.5 for icon in sample['icons']), default=sample['height'] - 2) + 0.00001
            if index:
                assert bounds['top'] >= sample['lines'][index - 1]['bounds']['bottom']
        for index, icon in enumerate(sample['icons']):
            assert icon['x'] >= 2 and icon['y'] >= 2
            assert icon['x'] + icon['width'] <= sample['width'] - 2
            assert icon['y'] + icon['height'] <= sample['height'] - 2
            for other in sample['icons'][index + 1:]:
                assert icon['x'] + icon['width'] <= other['x'], (path, '图标重叠')
    else:
        assert len(fonts) == 2, (path, '声明必须实际嵌入中文和拉丁字体')
    if path.name == 'declaration-long.pdf':
        assert 'END-LEGISLATION' in ''.join(extracted)
        assert 'Signature:' in extracted[-1]
    print('实际嵌入字体数量', len(fonts))

for name, sample in manifest.items():
    assert (output / f'{name}.pdf').exists() == sample['valid'], (name, '样张生成或拒绝状态不正确')
print('纸张尺寸、完整文字、5.5pt 下界、区域间距、离线字体、矢量及草稿分页验证通过。')
