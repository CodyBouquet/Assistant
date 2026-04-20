import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function TodosPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Todos</CardTitle>
        <CardDescription>Simple checklist — stub for v1.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-neutral-500">
        Placeholder.
      </CardContent>
    </Card>
  );
}
