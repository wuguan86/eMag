import { useEffect, useRef, useState } from 'react';
import { Box, ChevronLeft } from 'lucide-react';
import type { ProductSnapshot } from '../types';
import { Toolkit } from '../components/Toolkit';
import { OPEN_TOOLKIT_DRAWER_EVENT } from './events';

export function Drawer({ product, openOnMount = false }: { product: ProductSnapshot; openOnMount?: boolean }) {
  const [open, setOpen] = useState(openOnMount);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  const close = () => { returnFocus.current = true; setOpen(false); };
  useEffect(() => {
    const openDrawer = () => setOpen(true);
    window.addEventListener(OPEN_TOOLKIT_DRAWER_EVENT, openDrawer);
    return () => window.removeEventListener(OPEN_TOOLKIT_DRAWER_EVENT, openDrawer);
  }, []);
  useEffect(() => {
    if (!open) {
      // React 提交后按钮才解除隐藏；此前同步 focus 会被浏览器拒绝。
      if (returnFocus.current) { launcher.current?.focus(); returnFocus.current = false; }
      return;
    }
    panel.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); returnFocus.current = true; setOpen(false); }
    };
    const current = panel.current;
    current?.addEventListener('keydown', escape);
    return () => current?.removeEventListener('keydown', escape);
  }, [open]);
  return <>
    <button ref={launcher} className="launcher" aria-label="打开 eMAG 卖家工具箱" aria-expanded={open} aria-controls="emag-toolkit-drawer" onClick={() => setOpen(true)}><Box size={20}/>卖家助手<ChevronLeft size={13}/></button>
    <div ref={panel} id="emag-toolkit-drawer" className={`drawer ${open ? 'open' : ''}`} role="region" aria-label="eMAG 卖家工具箱" aria-hidden={!open} inert={!open} tabIndex={-1}>
      <Toolkit product={product} onClose={close}/>
    </div>
  </>;
}
