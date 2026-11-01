import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../i18n';

/** Keeps a rendering error from blanking the whole app: shows a message and a reload button instead. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto my-10 max-w-lg space-y-3 rounded-2xl border border-danger/30 bg-danger-soft p-5 text-center text-danger">
        <p className="font-semibold">{i18n.t('errors.INTERNAL')}</p>
        <button type="button" className="min-h-11 rounded-xl bg-surface px-4 font-semibold text-fg" onClick={() => window.location.reload()}>
          {i18n.t('common.retry')}
        </button>
      </div>
    );
  }
}
