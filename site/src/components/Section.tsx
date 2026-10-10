import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** A chart card: the finding as its title, a one-sentence summary, the chart, and the chart's data as a table. */
export function Section({ title, summary, columns, rows, children }: {
  title: string;
  summary: string;
  columns?: string[];
  rows?: (string | number)[][];
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle><h3>{title}</h3></CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        {columns && rows && (
          <details>
            <summary className="cursor-pointer text-sm">Table</summary>
            <Table>
              <TableHeader>
                <TableRow>{columns.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r[0]}>{r.map((v, j) => <TableCell key={j}>{v}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
