import stylesheet from '../styles.css?inline';
import { startProductObserver } from './controller';

declare global { interface Window { __emagSellerToolkitCleanup?: () => void } }

// 开发重载或意外重复注入时先释放旧监听，防止重复浮窗与定时器。
window.__emagSellerToolkitCleanup?.();
window.__emagSellerToolkitCleanup = startProductObserver(stylesheet);
