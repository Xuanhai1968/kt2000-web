import { Component } from "react";
import type { ReactNode } from "react";
import { Alert, Button } from "antd";

interface State { error: Error | null; }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Alert
          type="error" showIcon
          message="Màn hình này gặp lỗi"
          description={
            <>
              <div style={{ marginBottom: 8 }}>
                Chi tiết (gửi cho Leader): <code>{this.state.error.message}</code>
              </div>
              <Button size="small" onClick={() => this.setState({ error: null })}>
                Thử lại
              </Button>
            </>
          }
        />
      );
    }
    return this.props.children;
  }
}