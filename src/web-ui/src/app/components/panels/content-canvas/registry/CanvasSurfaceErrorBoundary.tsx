import React from 'react';

export interface CanvasSurfaceErrorBoundaryProps {
  instanceKey: string;
  fallback: React.ReactNode;
  children: React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface CanvasSurfaceErrorBoundaryState {
  hasError: boolean;
}

export class CanvasSurfaceErrorBoundary extends React.Component<
  CanvasSurfaceErrorBoundaryProps,
  CanvasSurfaceErrorBoundaryState
> {
  public state: CanvasSurfaceErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): CanvasSurfaceErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  public componentDidUpdate(previous: CanvasSurfaceErrorBoundaryProps): void {
    if (previous.instanceKey !== this.props.instanceKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
