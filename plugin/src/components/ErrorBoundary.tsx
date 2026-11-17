import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.warn('工具界面发生异常，已隔离故障。', error, info.componentStack); }
  render() {
    if (this.state.failed) return <div className="empty-state" role="alert"><h2>此面板暂时无法显示</h2><p>已保留本地数据，请刷新页面后重试。</p></div>;
    return this.props.children;
  }
}
