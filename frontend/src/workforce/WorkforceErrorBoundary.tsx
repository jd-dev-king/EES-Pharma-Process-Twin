import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onReturn: () => void;
}

interface State {
  hasError: boolean;
  message: string;
}

export class WorkforceErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "The Workforce workspace could not be rendered." };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Workforce rendering error", error, info);
  }

  private reset = () => {
    this.setState({ hasError: false, message: "" });
    this.props.onReturn();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section className="planned-zone workforce-error-boundary" role="alert">
        <div className="planned-icon">WF</div>
        <p className="eyebrow">Workforce Workspace Recovery</p>
        <h2>Workforce data could not be displayed</h2>
        <p>{this.state.message}</p>
        <button className="button secondary" onClick={this.reset}>Return to Command Center</button>
      </section>
    );
  }
}
