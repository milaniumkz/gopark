export function ReadOnlyNotice({
  message,
}: {
  message: string;
}) {
  return <div className="permission-note">{message}</div>;
}
