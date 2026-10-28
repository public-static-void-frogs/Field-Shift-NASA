import { Button, Result } from 'antd';
import type { ReactNode } from 'react';
import { Component } from 'react';
import { useTranslation } from 'react-i18next';

type QueryBoundaryProps = {
  children: ReactNode;
  onReset: () => void;
};

type QueryBoundaryState = {
  hasError: boolean;
};

export class QueryBoundary extends Component<QueryBoundaryProps, QueryBoundaryState> {
  state: QueryBoundaryState = { hasError: false };
  static getDerivedStateFromError(): QueryBoundaryState {
    return { hasError: true };
  }
  retry = () => {
    this.props.onReset();
    this.setState({ hasError: false });
  };
  render() {
    return this.state.hasError ? <QueryError retry={this.retry} /> : this.props.children;
  }
}

type QueryErrorProps = {
  retry: () => void;
};

function QueryError({ retry }: QueryErrorProps) {
  const { t } = useTranslation();

  return (
    <Result
      status="error"
      title={t('Unable to load data')}
      subTitle={t('Please try again.')}
      extra={
        <Button type="primary" onClick={retry}>
          {t('Try again')}
        </Button>
      }
    />
  );
}
