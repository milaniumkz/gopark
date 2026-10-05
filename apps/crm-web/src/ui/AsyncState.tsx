type AsyncStateProps = {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  emptyContent?: React.ReactNode;
  children: React.ReactNode;
};

export function AsyncState({ loading, error, empty, emptyContent, children }: AsyncStateProps) {
  if (loading) {
    return <article className="panel">Загрузка данных...</article>;
  }

  if (error) {
    return <article className="panel">Ошибка загрузки: {error}</article>;
  }

  if (empty) {
    return emptyContent ? <>{emptyContent}</> : <article className="panel">Нет данных.</article>;
  }

  return <>{children}</>;
}
