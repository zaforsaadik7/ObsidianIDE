import React, { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught React Component Error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0A0B] text-white flex items-center justify-center p-6 font-mono">
          <div className="glass-panel animate-fade-in max-w-xl w-full p-8 bg-surface-container-low/90 border border-red-500/40 rounded-xl shadow-2xl space-y-6">
            <div className="flex items-center gap-3 text-red-400 border-b border-outline-variant/30 pb-4">
              <span className="material-symbols-outlined text-3xl">warning</span>
              <div>
                <h1 className="text-lg font-bold font-headline text-white">System Render Fault Intercepted</h1>
                <p className="text-xs text-on-surface-variant">ObsidianIDE Fault Isolation Protocol</p>
              </div>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              An unhandled render exception occurred inside the active view hierarchy. The application state has been isolated to prevent corruption.
            </p>

            {this.state.error && (
              <div className="p-4 bg-red-950/40 border border-red-800/40 text-red-300 text-xs overflow-x-auto rounded-lg">
                <strong>Exception:</strong> {this.state.error.toString()}
              </div>
            )}

            <div className="flex gap-4 pt-2">
              <button
                onClick={this.handleReload}
                className="px-5 py-2.5 bg-surface-tint text-neutral-900 font-bold text-xs hover:bg-cyan-400 transition-colors rounded shadow-lg cursor-pointer"
              >
                Reload Workspace
              </button>
              <button
                onClick={() => window.location.href = '/dashboard'}
                className="px-5 py-2.5 bg-surface-container-high border border-outline-variant text-on-surface text-xs hover:bg-surface-slate transition-colors rounded cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
