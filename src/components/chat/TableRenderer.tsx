type Props = {
  columns: string[];
  rows: string[][];
  caption?: string;
};

export function TableRenderer({ columns, rows, caption }: Props) {
  if (!columns.length || !rows.length) return null;

  return (
    <div className="answer-table-wrap">
      <table className="answer-table">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                ci === 0
                  ? <th key={ci} scope="row">{cell}</th>
                  : <td key={ci}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {caption && (
        <p className="text-xs text-muted-foreground text-center mt-2">{caption}</p>
      )}
    </div>
  );
}
