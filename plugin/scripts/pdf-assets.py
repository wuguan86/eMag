"""离线资产生成：保留授权字体，转换规范 SVG 为浏览器和 PDF 共用路径。"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.svgLib.path import SVGPath
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.qu2cuPen import Qu2CuPen
from fontTools.misc.transform import Transform
import argparse, base64, json, re, xml.etree.ElementTree as ET
parser = argparse.ArgumentParser(description='生成离线字体与共用矢量路径。')
parser.add_argument('--icons-only', action='store_true', help='仅转换图标，保留字体模块。')
parser.add_argument('--icon', choices=['ce', 'weee', 'age', 'triman', 'pap20'], help='只更新指定图标，保留其他图标原路径。')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
font_dir = root / 'src/assets/fonts'
for filename, module in ([] if args.icons_only or args.icon else [('NotoSans-Regular.ttf', 'latin'), ('DroidSansFallback.ttf', 'cjk')]):
    content = base64.b64encode((font_dir / filename).read_bytes()).decode()
    codes = sorted(c for c in TTFont(font_dir / filename).getBestCmap() if c <= 65535)
    ranges = []
    for code in codes:
        if ranges and code == ranges[-1][1] + 1: ranges[-1][1] = code
        else: ranges.append([code, code])
    lines = ['// 本文件由 scripts/pdf-assets.py 生成；字体授权与来源见 docs/ASSET_SOURCES.md。',
             'export const base64 = [']
    lines += [json.dumps(content[i:i+24000])+',' for i in range(0,len(content),24000)]
    lines += ["].join('');", 'export const ranges: readonly (readonly [number, number])[] = '+json.dumps(ranges)+';']
    (font_dir / (module+'.ts')).write_text('\n'.join(lines)+'\n',encoding='utf8')

def transform_value(value):
    if not value: return Transform()
    result=Transform()
    for name,args in re.findall(r'(\w+)\(([^)]+)\)',value):
        values=[float(v) for v in re.split('[ ,]+',args.strip())]
        if name=='translate': result=result.translate(*values)
        elif name=='matrix': result=result.transform(values)
        elif name=='scale': result=result.scale(*values)
        else: raise ValueError('不支持的图形变换 '+name)
    return result

data_file = root/'src/utils/pdf/iconData.ts'
icons=json.loads(data_file.read_text(encoding='utf8').split('export const iconData = ', 1)[1].removesuffix(' as const;\n')) if args.icon else {}
for name in ([args.icon] if args.icon else ['ce','weee','age','triman','pap20']):
    source=root/'src/utils/pdf'/f'{name}.svg'
    tree=ET.fromstring(source.read_text(encoding='utf8'))
    size=tree.get('viewBox')
    width,height=map(float,size.split()[2:]) if size else (float(tree.get('width').replace('px','')),float(tree.get('height').replace('px','')))
    paths=[]
    def walk(element, parent_transform=Transform(), inherited=None):
        tag=element.tag.split('}')[-1]
        if tag in ['defs','metadata','namedview']: return
        current=parent_transform.transform(transform_value(element.get('transform')))
        style=dict(inherited or {})
        style.update(dict(item.split(':',1) for item in element.get('style','').split(';') if ':' in item))
        for key in ['fill','stroke','stroke-width','fill-rule']:
            if element.get(key): style[key]=element.get(key)
        if tag in ['path','circle','rect','polygon','ellipse','polyline']:
            clean=ET.Element(element.tag,{k:v for k,v in element.attrib.items() if k not in ['transform','style']})
            pen=RecordingPen()
            # 字母轮廓可能包含二次曲线，统一转成 PDF 与 SVG 都支持的三次贝塞尔曲线。
            SVGPath.fromstring(ET.tostring(clean),transform=current).draw(Qu2CuPen(pen, max_err=0.001, all_cubic=True))
            operations=[]; svg=[]
            for op,points in pen.value:
                command={'moveTo':'m','lineTo':'l','curveTo':'c','closePath':'h','endPath':'h'}[op]
                coords=[round(number,6) for point in points for number in point]
                operations.append({'op':command,'c':coords})
                svg.append({'m':'M','l':'L','c':'C','h':'Z'}[command]+' '.join(str(n) for n in coords))
            color=style.get('fill','black'); stroke=style.get('stroke','none')
            scale=(current.xx**2+current.xy**2)**0.5
            paths.append({'d':' '.join(svg),'operations':operations,'fill':color,'stroke':stroke,
                          'strokeWidth':float(style.get('stroke-width','0').replace('px',''))*scale,
                          'evenOdd':style.get('fill-rule','evenodd' if name=='weee' else 'nonzero')=='evenodd'})
        for child in element: walk(child,current,style)
    walk(tree)
    icons[name]={'width':width,'height':height,'paths':paths}
    svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+str(width)+' '+str(height)+'">\n'
    svg+='\n'.join('<path d="'+p['d']+'" fill="'+p['fill']+'" stroke="'+p['stroke']+'" stroke-width="'+str(p['strokeWidth'])+'" fill-rule="'+('evenodd' if p['evenOdd'] else 'nonzero')+'"/>' for p in paths)
    source.write_text(svg+'\n</svg>\n',encoding='utf8')
(root/'src/utils/pdf/iconData.ts').write_text('// 规范 SVG 路径经 scripts/pdf-assets.py 转换，不包含文字或位图。\nexport const iconData = '+json.dumps(icons,separators=(',',':'))+' as const;\n',encoding='utf8')
