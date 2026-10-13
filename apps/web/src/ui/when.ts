/** 記録の日時。チーム詳細とチーム一覧の表で同じ書き方にする。 */
export function formatWhen(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
