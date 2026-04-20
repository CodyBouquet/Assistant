import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function BillsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bills</CardTitle>
        <CardDescription>
          Tracked bills, amounts, due dates, and autopay status. Coming in v1.1
          — schema and API are already in place.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-neutral-500">
        Placeholder. Add bills directly in the DB for now, or wait for the UI
        to land in the next iteration.
      </CardContent>
    </Card>
  );
}
